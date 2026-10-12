// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { CARD, PHOTO } from './_seed-data.js';

export async function seedWalk() {
  if (!(await s.claimSeed('boris-2026-10-12-evening'))) return;
  const date = '2026-10-12', km = 1.96, minutes = 34, startedAt = Date.parse('2026-10-12T19:55:00+02:00'), endedAt = startedAt + minutes * 60e3;
  const photo = await s.savePhoto(PHOTO), card = await s.savePhoto(CARD);
  const bk = await s.ownWalk(date, startedAt);
  const key = `${bk.id}|${date}`;
  bk.notes = 'Strava-tur, GPS-signalet forsvandt på vej hjem; kortet er lavet i hånden';
  bk.walks = { [date]: { km, minutes, startedAt, key, photo, card, pub: true } };
  // No GPS points: the route only exists in the card picture.
  const track = { status: 'done', startedAt, endedAt, km, minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
  await s.saveTrack(key, track); await s.saveBooking(bk);
  await s.setShowcase(key, track, bk, true);
}
