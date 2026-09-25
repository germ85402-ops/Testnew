import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import './style.css';
import { LAPS, BOT_SPEEDS, clamp, lapAt, positionAt, formatTime, advancePlayer } from './race.js';

const $ = id => document.getElementById(id);
const shell = document.querySelector('.game-shell');
const keys = new Set();
let state = 'menu', previousState = 'race', elapsed = 0, countdown = 0, last = 0;
let muted = true, audio, oscillator, gain;
const player = { distance: 0, lane: 0, speed: 0, boost: 100, coins: 0 };
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('error').hidden = false;
  $('start').disabled = true;
}

if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf4ccad);
  $('scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D-трасса среди сосен и гор на закате');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4ccad, 145, 390);
  const camera = new THREE.PerspectiveCamera(48, 1, .2, 650);
  scene.add(new THREE.HemisphereLight(0xffeee0, 0x738564, 2.8));
  const sun = new THREE.DirectionalLight(0xffd5a0, 3.2);
  sun.position.set(-80, 130, 55); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 155, bottom: -155, far: 350 });
  sun.shadow.bias = -.0005;
  scene.add(sun);
  const materials = new Map();
  function mat(color, extra = {}) {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:.85, ...extra}));
    return materials.get(key);
  }
  function mesh(geometry, color, x=0, y=0, z=0, parent=scene) {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (w,h,d,color,x,y,z,parent) => mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);
  const ground = mesh(new THREE.PlaneGeometry(1600,1600),0x91ad78,0,-.18,0);
  ground.rotation.x = -Math.PI/2; ground.castShadow = false;

  const points = [[0,94],[59,88],[103,50],[100,5],[66,-18],[88,-65],[41,-99],[-26,-101],[-85,-67],[-102,-15],[-79,45],[-42,85]];
  const curve = new THREE.CatmullRomCurve3(points.map(([x,z]) => new THREE.Vector3(x,0,z)), true, 'catmullrom', .45);
  const length = curve.getLength();
  const at = distance => curve.getPointAt(((distance / length) % 1 + 1) % 1);
  const tangent = distance => curve.getTangentAt(((distance / length) % 1 + 1) % 1);
  function frame(distance, lane=0) {
    const p = at(distance), t = tangent(distance);
    p.add(new THREE.Vector3(-t.z,0,t.x).multiplyScalar(lane));
    return { p, angle: Math.atan2(t.x,t.z), t };
  }
  function ribbon(inner, outer, color, y) {
    const vertices = [], indices = [], n = 600;
    for (let i=0;i<=n;i++) {
      for(const lane of [inner,outer]) { const p = frame(i/n*length,lane).p; vertices.push(p.x,y,p.z); }
      if(i<n) { const k=i*2; indices.push(k,k+2,k+1,k+1,k+2,k+3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, mat(color,{side:THREE.DoubleSide}));road.receiveShadow=true;scene.add(road);
  }
  ribbon(-11,11,0xc8b88b,.01);
  ribbon(-8.5,8.5,0x657778,.05);
  ribbon(-8.15,-7.9,0xf0e6c4,.075);ribbon(7.9,8.15,0xf0e6c4,.075);
  for(let i=0;i<220;i++) {
    for(const lane of [-8.9,8.9]) {
      const f = frame(i/220*length,lane);
      const curb=box(.75,.17,length/220+.1,i%2 ? 0xf1e6c9 : 0xd87857,f.p.x,.07,f.p.z);
      curb.rotation.y=f.angle;
    }
  }
  for(let i=0;i<95;i++) {
    const f=frame(i/95*length); const dash=box(.14,.025,2.1,0xd3d6b8,f.p.x,.08,f.p.z);dash.rotation.y=f.angle;
  }
  const startFrame=frame(0), startGroup=new THREE.Group();scene.add(startGroup);startGroup.position.copy(startFrame.p);startGroup.rotation.y=startFrame.angle;
  for(let row=0;row<2;row++) for(let i=0;i<16;i++) box(1,.025,1,(i+row)%2?0xeff0d9:0x293b3c,i-7.5,.1,row-.5,startGroup);
  box(.5,9,.5,0xeee1c3,-10,4.5,0,startGroup);box(.5,9,.5,0xeee1c3,10,4.5,0,startGroup);
  box(21,2,.7,0x324c47,0,9,0,startGroup);
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=128;
  const ctx=signCanvas.getContext('2d');ctx.fillStyle='#324c47';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#d5f578';ctx.textAlign='center';ctx.font='bold 64px Arial';ctx.fillText('SUNSET  KART',512,87);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(17,2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(signCanvas),side:THREE.DoubleSide}));sign.position.set(0,9,-.37);sign.rotation.y=Math.PI;startGroup.add(sign);

  // Seeded scenery keeps the course identical across devices and restarts.
  let seed=49;
  function rand(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}
  function tree(x,z,scale=1) {
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);
    mesh(new THREE.CylinderGeometry(.25,.4,3,5),0x78674d,0,1.5,0,g);
    const color=[0x406c58,0x547d5d,0x658767][Math.floor(rand()*3)];
    mesh(new THREE.ConeGeometry(2.8,6,6),color,0,5,0,g);
    mesh(new THREE.ConeGeometry(2.1,5,6),color,0,7.3,0,g);
  }
  const roadSamples=Array.from({length:200},(_,i)=>at(i/200*length));
  for(let i=0;i<260;i++) {
    const x=(rand()-.5)*360,z=(rand()-.5)*340;
    if(roadSamples.some(p=>Math.hypot(x-p.x,z-p.z)<16))continue;
    tree(x,z,.65+rand()*1.4);
  }
  for(let i=0;i<25;i++) {
    const angle=i/25*Math.PI*2, radius=240+rand()*70;
    const mountain=mesh(new THREE.ConeGeometry(42+rand()*45,50+rand()*90,5),[0x9fae93,0x8caa90,0xb7b599][i%3],Math.cos(angle)*radius,18,Math.sin(angle)*radius);
    mountain.rotation.y=rand()*6;mountain.castShadow=false;
  }
  for(let i=0;i<45;i++) {
    const f=frame(rand()*length,(rand()>.5?1:-1)*(14+rand()*7));
    const rock=mesh(new THREE.DodecahedronGeometry(.7+rand()*1.3,0),0xa1ab92,f.p.x,.6,f.p.z);rock.scale.y=.65;
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(18,24,16),new THREE.MeshBasicMaterial({color:0xffecbb}));sunDisc.position.set(-120,95,-240);scene.add(sunDisc);
  for(let i=0;i<12;i++) {
    const cloud=new THREE.Group();cloud.position.set((rand()-.5)*600,100+rand()*35,-180-rand()*130);scene.add(cloud);
    for(let j=0;j<3;j++) { const puff=mesh(new THREE.IcosahedronGeometry(9,1),0xffe9ce,j*9,0,0,cloud);puff.scale.set(1.4,.45,.75);puff.castShadow=false; }
  }
  // Decorative stands and striped flags punctuate the final straight.
  for(const d of [length-50, length-25,45,75,210]) {
    const f=frame(d,-17);const g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.angle;scene.add(g);
    box(6,2.2,9,0xe5cca0,0,1.1,0,g);box(7,.5,10,0xdb8066,0,2.4,0,g);
    for(let i=0;i<4;i++) box(.18,5,.18,0xe5dfc4,i<2?-2.7:2.7,3.5,i%2?-4:4,g);
    const roof=mesh(new THREE.ConeGeometry(6,2,4),0xe8af79,0,6.8,0,g);roof.rotation.y=Math.PI/4;roof.scale.z=1.3;
  }
  for(let i=0;i<14;i++) {
    const f=frame(i/14*length,12.8);box(.15,5,.15,0xefe6c9,f.p.x,2.5,f.p.z);
    const flag=box(1.8,1,.07,i%2?0xd5f578:0xd58771,f.p.x+.8,4.5,f.p.z);flag.rotation.y=f.angle;
  }
  // Batch static scenery to keep draw calls low on mobile GPUs.
  scene.updateMatrixWorld(true);
  const batches=new Map(), originals=[];
  scene.traverse(object=>{
    if(!object.isMesh)return;
    const key=`${object.material.id}/${object.castShadow}/${Object.keys(object.geometry.attributes).sort().join()}`;
    if(!batches.has(key))batches.set(key,{material:object.material,shadow:object.castShadow,geometries:[]});
    batches.get(key).geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    originals.push(object);
  });
  for(const batch of batches.values()){
    const object=new THREE.Mesh(mergeGeometries(batch.geometries),batch.material);
    object.castShadow=batch.shadow;object.receiveShadow=true;scene.add(object);
    batch.geometries.forEach(geometry=>geometry.dispose());
  }
  originals.forEach(object=>{object.removeFromParent();object.geometry.dispose();});
  function kart(color) {
    const g=new THREE.Group();scene.add(g);
    box(2.2,.45,3.1,color,0,.65,0,g);box(1.5,.45,1.15,color,0,.9,1.2,g);
    box(2.5,.23,.35,0x343d3c,0,.43,1.85,g);box(2.4,.2,.5,color,0,1.25,-1.3,g);
    box(1,.5,1,0x303c3d,0,1,-.3,g);
    for(const x of [-1.15,1.15]) for(const z of [-1.05,1.05]) {
      const wheel=mesh(new THREE.CylinderGeometry(.46,.46,.45,12),0x293534,x,.48,z,g);wheel.rotation.z=Math.PI/2;
      const hub=mesh(new THREE.CylinderGeometry(.21,.21,.47,10),0xa1ac9b,x,.48,z,g);hub.rotation.z=Math.PI/2;
    }
    mesh(new THREE.CapsuleGeometry(.38,.45,3,8),0xf5ead4,0,1.4,-.15,g);
    mesh(new THREE.SphereGeometry(.52,16,12),color,0,2.05,-.18,g);
    const visor=mesh(new THREE.SphereGeometry(.43,12,8),0x243e45,0,2.08,.04,g);visor.scale.set(1,.48,.8);
    box(.8,.12,.2,0x2e3b39,0,1.3,.6,g);
    return g;
  }
  const playerKart=kart(0xd5f578);
  const bots=BOT_SPEEDS.map((speed,i)=>({speed,distance:10+i*7,lane:(i%2?1:-1)*3.4,object:kart([0xd88671,0xada5d6,0x78c6cb,0xf5cc70,0x6f99c5][i])}));
  const coinGeometry=new THREE.TorusGeometry(.65,.2,6,12);
  const pickups=Array.from({length:36},(_,i)=>{
    const distance=(i+1)/37*length,lane=[-4,0,4][Math.floor(i/3)%3],f=frame(distance,lane);
    const object=mesh(coinGeometry,0xffd86c,f.p.x,1.4,f.p.z);
    return{distance,lane,object,collectedLap:-1};
  });
  const mapPoint=d=>{const p=at(d);return{x:110+p.x*.8,y:66+p.z*.48};};
  const path=Array.from({length:100},(_,i)=>{const p=mapPoint(i/100*length);return`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(' ')+'Z';
  $('menu-map').setAttribute('d',path);$('race-map').setAttribute('d',path);
  const startPoint=mapPoint(0);$('map-start').setAttribute('cx',startPoint.x);$('map-start').setAttribute('cy',startPoint.y);
  function place(object,distance,lane){const f=frame(distance,lane);object.position.copy(f.p);object.rotation.y=f.angle;return f;}
  place(playerKart,0,0);bots.forEach(b=>place(b.object,b.distance,b.lane));
  function resize(){const {width,height}=$('scene').getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe($('scene'));resize();
  const cameraPosition=new THREE.Vector3(), cameraTarget=new THREE.Vector3();
  let frameCount=0, frameDuration=0;
  function start(){
    Object.assign(player,{distance:0,lane:0,speed:0,boost:100,coins:0});elapsed=0;countdown=3.5;state='countdown';keys.clear();
    bots.forEach((b,i)=>{b.distance=10+i*7;place(b.object,b.distance,b.lane);});
    pickups.forEach(c=>{c.collectedLap=-1;c.object.visible=true;});
    $('menu').hidden=true;$('overlay').hidden=true;$('driving-hud').hidden=false;document.querySelector('.race-hud').hidden=false;$('pause').hidden=false;$('countdown').hidden=false;
    shell.classList.add('playing');place(playerKart,0,0);updateHud();
    if(!muted)enableAudio();
  }
  function pause(){
    if(state==='race'||state==='countdown'){
      previousState=state;state='paused';keys.clear();$('overlay').hidden=false;$('countdown').hidden=true;
      $('dialog-label').textContent='ПИТ-СТОП';$('dialog-title').textContent='Выдохни.';$('dialog-description').textContent='Закат подождёт. Твоя гонка — на паузе.';
      $('resume').innerHTML='ПРОДОЛЖИТЬ <span>↗</span>';
    } else if(state==='paused') {state=previousState;$('overlay').hidden=true;if(state==='countdown')$('countdown').hidden=false;}
  }
  function finish(){
    state='finished';keys.clear();$('overlay').hidden=false;$('pause').hidden=true;
    const pos=positionAt(player.distance,bots);
    $('dialog-label').textContent='КЛЕТЧАТЫЙ ФЛАГ';$('dialog-title').textContent=pos===1?'Твой закат!':`Финиш. Место ${pos}`;
    $('dialog-description').textContent=`3 круга за ${formatTime(elapsed)} · ${player.coins} монет. ${pos===1?'Первый среди шести!':'Ещё один заезд — и подиум твой.'}`;
    $('resume').innerHTML='ЕЩЁ ЗАЕЗД <span>↗</span>';
  }
  function updateHud(){
    $('position').textContent=positionAt(player.distance,bots);$('lap').textContent=lapAt(player.distance,length);$('time').textContent=formatTime(elapsed);
    $('speed').textContent=Math.round(player.speed*2.7);$('coins').textContent=String(player.coins).padStart(2,'0');
    $('boost-fill').style.width=`${player.boost}%`;$('boost-label').textContent=player.boost>25?'ГОТОВО':'ЗАРЯДКА';
    const p=mapPoint(player.distance);$('map-player').setAttribute('cx',p.x);$('map-player').setAttribute('cy',p.y);
    shell.dataset.state=state;
  }
  $('start').onclick=start;$('restart').onclick=start;$('resume').onclick=()=>state==='finished'?start():pause();$('pause').onclick=pause;
  document.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','Escape','KeyA','KeyD'].includes(e.code)) {
      if(e.target instanceof HTMLButtonElement && e.code==='Space')return;
      e.preventDefault();if(e.code==='Escape'&&!e.repeat)pause();else keys.add(e.code);
    }
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();if(state==='race'||state==='countdown')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='race'||state==='countdown'))pause();});
  for(const [id,key] of [['left','ArrowLeft'],['right','ArrowRight'],['boost','Space'],['drift','ShiftLeft']]){
    const button=$(id);
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(key);button.classList.add('pressed');});
    const release=()=>{keys.delete(key);button.classList.remove('pressed');};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  $('sound').onclick=()=>{muted=!muted;$('sound').setAttribute('aria-label',muted?'Включить звук':'Выключить звук');document.querySelector('.sound-slash').hidden=!muted;if(!muted)enableAudio();};
  $('fullscreen').onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(shell.requestFullscreen)await shell.requestFullscreen();}catch{ $('fullscreen').title='Полный экран недоступен в этом браузере'; }
  };
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='race'||state==='countdown')pause();$('error').textContent='Графический контекст потерян. Обнови страницу, чтобы вернуться на трассу.';$('error').hidden=false;});
  function animate(now){
    requestAnimationFrame(animate);
    const rawDt=(now-last)/1000;
    const dt=Math.min(rawDt,.05);last=now;
    frameDuration+=Math.min(rawDt,.5);frameCount++;
    if(frameCount===90){
      if(frameDuration/frameCount>.04&&renderer.getPixelRatio()>.7){renderer.setPixelRatio(Math.max(.65,renderer.getPixelRatio()*.75));resize();}
      frameCount=0;frameDuration=0;
    }
    let boosting=false;
    if(state==='countdown'){
      countdown-=dt;$('countdown').textContent=countdown>.5?Math.ceil(countdown-.5):'ГОУ!';
      if(countdown<=0){state='race';$('countdown').hidden=true;}
    }
    if(state==='race'){
      elapsed+=dt;
      const input={steer:(keys.has('ArrowLeft')||keys.has('KeyA')?1:0)-(keys.has('ArrowRight')||keys.has('KeyD')?1:0),boost:keys.has('Space'),drift:keys.has('ShiftLeft')||keys.has('ShiftRight')};
      boosting=advancePlayer(player,input,dt).boosting;
      bots.forEach((b,i)=>{
        b.distance+=b.speed*dt;const lane=b.lane+Math.sin(elapsed*.7+i)*.8;place(b.object,b.distance,lane);
        if(Math.abs(b.distance-player.distance)<2.6&&Math.abs(lane-player.lane)<1.8){player.speed*=Math.pow(.93,dt*60);player.lane+=Math.sign(player.lane-lane||1)*dt*4;}
      });
      const lap=Math.floor(player.distance/length),distance=player.distance%length;
      for(const c of pickups){
        c.object.visible=c.collectedLap!==lap;
        if(c.object.visible&&Math.abs(c.distance-distance)<2.5&&Math.abs(c.lane-player.lane)<1.8){c.collectedLap=lap;c.object.visible=false;player.coins++;player.boost=clamp(player.boost+9,0,100);}
      }
      if(player.distance>=length*LAPS)finish();
    }
    if(state==='menu'){
      const orbit=now*.000017;
      camera.position.set(145+Math.sin(orbit)*12,123,171+Math.cos(orbit)*10);camera.lookAt(5,0,12);
    }else{
      const f=place(playerKart,player.distance,player.lane);
      playerKart.rotation.y+=((keys.has('ShiftLeft')||keys.has('ShiftRight'))?1:0)*((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*.22;
      cameraPosition.copy(f.p).addScaledVector(f.t,-(boosting?18:15));cameraPosition.y=8.5;
      cameraTarget.copy(f.p).addScaledVector(f.t,17);cameraTarget.y=1.3;
      camera.position.lerp(cameraPosition,1-Math.exp(-dt*5));camera.lookAt(cameraTarget);
      camera.fov=THREE.MathUtils.lerp(camera.fov,boosting?59:48,dt*3);camera.updateProjectionMatrix();
      updateHud();
    }
    if(state!=='paused'&&state!=='finished')pickups.forEach(c=>{c.object.rotation.y+=dt*1.7;});
    if(gain){gain.gain.setTargetAtTime(!muted&&state==='race'?.025:0,audio.currentTime,.1);oscillator.frequency.setTargetAtTime(45+player.speed*2.1,audio.currentTime,.1);}
    renderer.render(scene,camera);
  }
  requestAnimationFrame(animate);
}

function enableAudio(){
  try {
    if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();oscillator=audio.createOscillator();gain=audio.createGain();oscillator.type='triangle';gain.gain.value=0;oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();}
    audio.resume().catch(()=>{});
  }catch {muted=true;$('sound').setAttribute('aria-label','Звук недоступен');}
}
