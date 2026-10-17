// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { PHOTO } from './_seed-data.js';

export async function seedWalk() {
  if (!(await s.claimSeed('pack-newton'))) return;
  const photo = await s.savePhoto(PHOTO);
  await s.saveDog({ id: s.newId(), name: 'Newton', breed: '', note: '', photo, at: new Date().toISOString(), stay: '2026-10', bff: true,
    traits: ['again', 'calm', 'tidy', 'gentle'],
    feedback: 'Newton was an absolute pleasure to have! He settled in quickly, was friendly and gentle, and got along wonderfully with my golden retriever Boris. He absolutely loves playing with a ball. He could go on forever! Newton is so clever that I only wish he’d had a bit more time to teach Boris a few of his tricks. A sweet, good boy, and I’d be very happy to look after him again anytime!' });
}
