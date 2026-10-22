// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { WALKS } from './_seed-data.js';

export async function seedWalk() {
  if (!(await s.claimSeed('boris-2026-10-18-22'))) return;
  for (const w of WALKS) {
    const startedAt = Date.parse(`${w.date}T${w.time}:00+02:00`), endedAt = startedAt + w.minutes * 60e3;
    const photo = await s.savePhoto(w.photo), card = await s.savePhoto(w.card);
    const bk = await s.ownWalk(w.date, startedAt), key = `${bk.id}|${w.date}`;
    bk.notes = w.note + '; kortet er lavet i hånden';
    bk.walks = { [w.date]: { km: w.km, minutes: w.minutes, startedAt, key, photo, card, pub: true } };
    const track = { status: 'done', startedAt, endedAt, km: w.km, minutes: w.minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
    await s.saveTrack(key, track); await s.saveBooking(bk);
    await s.setShowcase(key, track, bk, true);
  }
}
