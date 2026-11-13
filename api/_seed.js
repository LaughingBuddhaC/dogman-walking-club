// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
import * as s from './_store.js';
import { BALOO } from './_seed-data.js';

export async function seedWalk() {
  // Baloo (Laura's Labrador, day boarding 23 Oct) joins The DogMan Pack as a Best Friend Forever.
  if (await s.claimSeed('pack-baloo-2026-11-13')) {
    const photo = await s.savePhoto(BALOO.photo);
    await s.saveDog({ id: s.newId(), name: BALOO.name, breed: BALOO.breed, note: '', photo: photo || '', at: new Date().toISOString(),
      feedback: BALOO.feedback, stay: BALOO.stay, traits: BALOO.traits, bff: true });
  }
}
