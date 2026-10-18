// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { PHOTO } from './_seed-data.js';
import { CARD as WCARD, PHOTO as WPHOTO } from './_seed-walk-data.js';

export async function seedWalk() {
  await seedNewton();
  await seedBorisWalk();
}

async function seedNewton() {
  if (!(await s.claimSeed('pack-newton'))) return;
  const photo = await s.savePhoto(PHOTO);
  await s.saveDog({ id: s.newId(), name: 'Newton', breed: '', note: '', photo, at: new Date().toISOString(), stay: '2026-10', bff: true,
    traits: ['again', 'calm', 'tidy', 'gentle'],
    feedback: 'Newton was an absolute pleasure to have! He settled in quickly, was friendly and gentle, and got along wonderfully with my golden retriever Boris. He absolutely loves playing with a ball. He could go on forever! Newton is so clever that I only wish he’d had a bit more time to teach Boris a few of his tricks. A sweet, good boy, and I’d be very happy to look after him again anytime!' });
}

// Boris's walk of 18 Oct 2026 (Strava, card made by hand).
async function seedBorisWalk() {
  if (!(await s.claimSeed('boris-2026-10-18-midday'))) return;
  const date = '2026-10-18', km = 1.82, minutes = 32, startedAt = Date.parse('2026-10-18T12:05:00+02:00'), endedAt = startedAt + minutes * 60e3;
  const photo = await s.savePhoto(WPHOTO), card = await s.savePhoto(WCARD);
  const bk = await s.ownWalk(date, startedAt), key = `${bk.id}|${date}`;
  bk.notes = 'Strava-tur, kortet er lavet i hånden';
  bk.walks = { [date]: { km, minutes, startedAt, key, photo, card, pub: true } };
  const track = { status: 'done', startedAt, endedAt, km, minutes, points: [], imported: 'strava-image', photo, card, weather: { rain: false, snow: false } };
  await s.saveTrack(key, track); await s.saveBooking(bk);
  await s.setShowcase(key, track, bk, true);
}
