export const LAPS = 3;
export const BOT_SPEEDS = [34, 35.4, 36.8, 38.2, 39.2];
export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lapAt(distance, length) { return clamp(Math.floor(Math.max(0, distance) / length) + 1, 1, LAPS); }
export function positionAt(distance, bots) { return 1 + bots.filter(bot => bot.distance > distance).length; }
export function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
export function advancePlayer(player, input, dt) {
  const offroad = Math.abs(player.lane) > 8.1;
  const boosting = input.boost && player.boost > 0 && !offroad;
  const target = offroad ? 20 : boosting ? 62 : input.drift ? 34 : 43;
  player.speed += (target - player.speed) * Math.min(1, dt * 2);
  player.boost = clamp(player.boost + (boosting ? -31 : 11) * dt, 0, 100);
  player.lane = clamp(player.lane + input.steer * dt * (input.drift ? 13 : 9) - player.lane * dt * .045, -12, 12);
  player.distance += player.speed * dt;
  return { boosting, offroad };
}
