// One-off data import, run by the first /api/club request after deploy; the claims in hash 'seeds' make each step run once.
import * as s from './_store.js';
import { WALKS_FIX } from './_seed-data.js';

export async function seedWalk() {
  // The nine Strava walks first imported all on 1 Nov are replaced by twelve walks spread over 24 Oct – 1 Nov.
  if (await s.claimSeed('boris-2026-10-24-11-01-twelve')) {
    for (const key of Object.keys(await s.showcaseRaw())) {
      const [id, date] = key.split('|');
      if (date !== '2026-11-01') continue;
      const bk = await s.getBooking(id);
      if (bk?.own && String(bk.notes || '').startsWith('Strava-tur;')) await s.deleteWalk(key);
    }
    for (const w of WALKS_FIX) {
      const tz = w.date < '2026-10-25' ? '+02:00' : '+01:00';
      const startedAt = Date.parse(`${w.date}T${w.time}:00${tz}`), endedAt = startedAt + w.minutes * 60e3;
      const photo = await s.savePhoto(w.photo), card = await s.savePhoto(w.card);
      const bk = await s.ownWalk(w.date, startedAt), key = `${bk.id}|${w.date}`;
      bk.notes = (w.leash ? 'Leash Off Day – ' : '') + 'Strava-tur; kortet er lavet i hånden';
      bk.walks = { [w.date]: { km: w.km, minutes: w.minutes, startedAt, key, photo, card, pub: true } };
      const track = { status: 'done', startedAt, endedAt, km: w.km, minutes: w.minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
      await s.saveTrack(key, track); await s.saveBooking(bk);
      await s.setShowcase(key, track, bk, true);
    }
  }
}
