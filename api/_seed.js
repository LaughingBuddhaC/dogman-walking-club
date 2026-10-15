// One-off data import, run by the first /api/club request after deploy; the claim in hash 'seeds' makes it run once.
// Newton (Rover boarding 15–17 Oct 2026): the stay itself plus his morning and evening walks.
import * as s from './_store.js';

export async function seedWalk() {
  if (!(await s.claimSeed('newton-2026-10-15'))) return;
  const config = await s.getConfig();
  const newton = { name: 'Newton', type: 'dog', size: 'M', breed: 'Goldendoodle' };
  const base = { name: 'Jessica (Rover)', phone: '+45 52 51 97 72', address: 'Birkerød', petList: [newton], lang: 'en' };
  const add = async (input, extra) => {
    const { error, booking } = s.buildBooking({ ...base, ...input }, config, { admin: true });
    if (error) { console.error('seed newton', error, input); return; }
    Object.assign(booking, { paid: true, source: 'rover' }, extra);
    if (booking.time && (await s.claimAll(booking))) console.error('seed newton: slot taken', input.time);
    await s.saveBooking(booking);
  };
  const info = 'Rover-booking. Male, castrated, 3 years, 13 kg, loves other dogs. Drop-off Thu 15 Oct 13:00–15:00, pick-up Sat 17 Oct 19:00–20:30.';
  await add({ service: 'boarding', date: '2026-10-15', end: '2026-10-17', notes: info }, { estimate: 462.5 });
  // Walks are part of the boarding (paid on Rover), so no separate price.
  await add({ service: 'walk', dates: ['2026-10-16', '2026-10-17'], time: '06:00', notes: 'Morning walk – part of the Rover boarding.' }, { estimate: 0 });
  await add({ service: 'walk', dates: ['2026-10-15', '2026-10-16', '2026-10-17'], time: '16:00', notes: 'Evening walk – part of the Rover boarding.' }, { estimate: 0 });
}
