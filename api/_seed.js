// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { CARD, PHOTO } from './_seed-data.js';

export async function seedWalk() {
  if (!(await s.claimSeed('boris-newton-2026-10-15'))) return;
  const date = '2026-10-15', km = 2.11, minutes = 39, startedAt = Date.parse('2026-10-15T16:40:00+02:00'), endedAt = startedAt + (38 * 60 + 43) * 1e3;
  const photo = await s.savePhoto(PHOTO), card = await s.savePhoto(CARD);
  const bk = await s.ownWalk(date, startedAt), key = `${bk.id}|${date}`;
  bk.petList = [...bk.petList, { name: 'Newton', type: 'dog', size: 'M', breed: '' }]; bk.pets = 2;
  bk.notes = 'Strava-tur med Newton, 38 min 43 s; kortet er lavet i hånden';
  bk.walks = { [date]: { km, minutes, startedAt, key, photo, card, pub: true } };
  const track = { status: 'done', startedAt, endedAt, km, minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
  await s.saveTrack(key, track); await s.saveBooking(bk);
  await s.setShowcase(key, track, bk, true);
}
