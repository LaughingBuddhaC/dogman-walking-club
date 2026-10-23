// One-off data import, run by the first /api/club request after deploy; the claims in hash 'seeds' make each step run once.
import * as s from './_store.js';
import { WALKS, LEASH_CARD, WALK23 } from './_seed-data.js';

export async function seedWalk() {
  if (await s.claimSeed('boris-2026-10-18-22')) {
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
  // The Leash Off Day walk of 18 Oct took 2 h 37 min (it was imported as 56 min): new time and card.
  if (await s.claimSeed('leash-off-2026-10-18-157')) {
    for (const [key, e] of Object.entries(await s.showcaseRaw())) {
      if (e.date !== '2026-10-18' || Math.round(e.km) !== 7) continue;
      const [id, date] = key.split('|'), bk = await s.getBooking(id), track = await s.getTrack(key);
      if (!bk || !track) continue;
      if (track.minutes !== 157) {
        const card = await s.savePhoto(LEASH_CARD); if (!card) continue;
        const old = track.card; track.card = card; track.minutes = 157; track.endedAt = track.startedAt + 157 * 60e3;
        await s.saveTrack(key, track);
        if (bk.walks?.[date]) { bk.walks[date].card = card; bk.walks[date].minutes = 157; await s.saveBooking(bk); }
        await s.setShowcase(key, track, bk, true); await s.deletePhoto(old);
      }
    }
  }
  // Boris & Baloo, 23 Oct (morning walk, card made by hand).
  if (await s.claimSeed('boris-baloo-2026-10-23')) {
    const w = WALK23, startedAt = Date.parse(`${w.date}T${w.time}:00+02:00`), endedAt = startedAt + w.minutes * 60e3;
    const photo = await s.savePhoto(w.photo), card = await s.savePhoto(w.card);
    const bk = await s.ownWalk(w.date, startedAt), key = `${bk.id}|${w.date}`;
    bk.petList.push({ name: 'Baloo', type: 'dog', size: 'L', breed: 'Labrador' }); bk.pets = 2; bk.dog = 'Boris & Baloo';
    bk.notes = w.note + '; kortet er lavet i hånden';
    bk.walks = { [w.date]: { km: w.km, minutes: w.minutes, startedAt, key, photo, card, pub: true } };
    const track = { status: 'done', startedAt, endedAt, km: w.km, minutes: w.minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
    await s.saveTrack(key, track); await s.saveBooking(bk);
    await s.setShowcase(key, track, bk, true);
  }
}
