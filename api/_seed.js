// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { CARD, PHOTO } from './_seed-boris.js';

export async function seedBoris() {
  if (!(await s.claimSeed('boris-2026-10-11'))) return;
  const date = '2026-10-11', startedAt = Date.parse('2026-10-11T17:50:00+02:00'), endedAt = startedAt + 35 * 60e3;
  const photo = await s.savePhoto(PHOTO), card = await s.savePhoto(CARD);
  const id = s.newId(), key = `${id}|${date}`;
  // own: my walk with Boris – already in the counter's Boris estimate, so the published card is not counted again.
  const bk = { id, created: new Date().toISOString(), service: 'walk', plan: 'once', date, end: '', dates: [date], weekdays: [], time: '17:00',
    nights: 0, days: 0, count: 1, pets: 1, petList: [{ name: 'Boris', type: 'dog', size: 'L', breed: 'Golden retriever' }], meet: false, minutes: 30,
    estimate: null, name: 'Can (egen hund)', phone: '+45 53 51 42 00', email: '', address: '', dog: 'Boris', breed: 'Golden retriever', size: 'L',
    notes: 'Strava-tur, kortet er lavet i hånden', vet: '', emergency: '', terms: null, freq: 'once', lang: 'da', status: 'confirmed', paid: true,
    source: 'admin', own: true, walks: { [date]: { km: 1.58, minutes: 35, startedAt, key, photo, card, pub: true } } };
  // No GPS points: the route only exists in the card picture.
  const track = { status: 'done', startedAt, endedAt, km: 1.58, minutes: 35, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
  await s.saveTrack(key, track); await s.saveBooking(bk);
  await s.setShowcase(key, track, bk, true);
}
