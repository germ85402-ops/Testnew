import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePlayer, lapAt, positionAt, formatTime } from './race.js';
test('laps stay within race bounds', () => {
  assert.equal(lapAt(0, 500), 1); assert.equal(lapAt(500, 500), 2);
  assert.equal(lapAt(1000, 500), 3); assert.equal(lapAt(1600, 500), 3);
});
test('positions compare total distance, including lapped racers', () => {
  assert.equal(positionAt(600, [{distance: 900}, {distance: 590}]), 2);
});
test('boost consumes energy and raises speed; offroad slows the kart', () => {
  const player = { speed: 43, boost: 100, lane: 0, distance: 0 };
  advancePlayer(player, {boost: true, steer: 0}, .1);
  assert.ok(player.speed > 43); assert.ok(player.boost < 100); assert.ok(player.distance > 0);
  player.lane = 10;
  advancePlayer(player, {boost: true, steer: 0}, .1);
  assert.ok(player.speed < 43);
});
test('lane and boost are bounded during sustained input', () => {
  const player = { speed: 0, boost: 3, lane: 0, distance: 0 };
  for (let i=0;i<1000;i++) advancePlayer(player, {boost:true, steer:1, drift:true}, 1/60);
  assert.ok(player.lane <= 12); assert.ok(player.boost >= 0 && player.boost <= 100);
});
test('race clock formatting', () => { assert.equal(formatTime(65.25), '01:05.3'); assert.equal(formatTime(0), '00:00.0'); });
