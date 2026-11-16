// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { WALKS_DJANGO } from './_seed-data.js';

export async function seedWalk() {
  // Evening walk with Boris and Django, 16 Nov.
  if (await s.claimSeed('boris-django-2026-11-16-evening')) {
    for (const w of WALKS_DJANGO) {
      const startedAt = Date.parse(`${w.date}T${w.time}:00+01:00`), endedAt = startedAt + w.minutes * 60e3;
      const photo = await s.savePhoto(w.photo), card = await s.savePhoto(w.card);
      const bk = await s.ownWalk(w.date, startedAt), key = `${bk.id}|${w.date}`;
      bk.petList.push({ name: 'Django', type: 'dog', size: 'L', breed: '' }); bk.pets = 2; bk.dog = 'Boris & Django';
      bk.notes = (w.leash ? 'Leash Off Day – ' : '') + 'Strava-tur; kortet er lavet i hånden';
      bk.walks = { [w.date]: { km: w.km, minutes: w.minutes, startedAt, key, photo, card, pub: true } };
      const track = { status: 'done', startedAt, endedAt, km: w.km, minutes: w.minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
      await s.saveTrack(key, track); await s.saveBooking(bk);
      await s.setShowcase(key, track, bk, true);
    }
  }
}
