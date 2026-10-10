import { getConfig, buildBooking, claimAll, freeAll, saveBooking, readSession, getUser, saveUser } from './_store.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (input.website) return res.status(200).json({ ok: true }); // honeypot
    const config = await getConfig();
    const { error, booking } = buildBooking(input, config);
    if (error) return res.status(400).json({ error });
    const session = readSession(req), user = session ? await getUser(session.sub) : null;
    if (user) { booking.user = user.sub; booking.email = booking.email || user.email; }
    const taken = await claimAll(booking);
    if (taken) return res.status(409).json({ error: 'taken', date: taken.slice(0, 10) });
    try { await saveBooking(booking); } catch (e) { await freeAll(booking); throw e; }
    // Remember the customer's details so the next booking is pre-filled.
    if (user) {
      const { name, phone, address, dog, breed, size } = booking;
      // Pet profiles are merged by name so the next booking can pick them again.
      const pets = [...(user.pets || [])];
      for (const p of booking.petList) { const i = pets.findIndex((x) => x.name && x.name.toLowerCase() === p.name.toLowerCase()); if (p.name) i >= 0 ? (pets[i] = p) : pets.push(p); }
      try { await saveUser({ ...user, name, phone, address, dog, breed, size, pets: pets.slice(0, 10) }); } catch (e) {}
    }
    res.status(200).json({ ok: true, id: booking.id, mobilepay: config.mobilepay });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
