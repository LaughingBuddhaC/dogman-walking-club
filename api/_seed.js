// One-off data change, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
// Swaps the picture of Boris's two hand-made walk cards (found by their old card id) for the new layout.
import * as s from './_store.js';
import { CARDS } from './_seed-data.js';

export async function seedWalk() {
  if (!(await s.claimSeed('boris-cards-beside-dog'))) return;
  for (const [key, e] of Object.entries(await s.showcaseRaw())) {
    const data = CARDS[e.card];
    if (!data) continue;
    const [id, date] = key.split('|'), bk = await s.getBooking(id), track = await s.getTrack(key);
    const card = await s.savePhoto(data);
    if (!bk || !track || !card) continue;
    const old = track.card;
    track.card = card; await s.saveTrack(key, track);
    if (bk.walks?.[date]) { bk.walks[date].card = card; await s.saveBooking(bk); }
    await s.setShowcase(key, track, bk, e.ok);
    await s.deletePhoto(old);
  }
}
