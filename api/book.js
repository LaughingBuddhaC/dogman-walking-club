import { getConfig, buildBooking, claimSlot, saveBooking, freeSlot, readSession, getUser, saveUser } from './_store.js';
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
    const key = `${booking.date}|${booking.time}`;
    if (booking.time && !(await claimSlot(key, booking.id))) return res.status(409).json({ error: 'taken' });
    try { await saveBooking(booking); } catch (e) { if (booking.time) await freeSlot(key); throw e; }
    // Remember the customer's details so the next booking is pre-filled.
    if (user) {
      const { name, phone, address, dog, breed, size } = booking;
      try { await saveUser({ ...user, name, phone, address, dog, breed, size }); } catch (e) {}
    }
    res.status(200).json({ ok: true, id: booking.id, mobilepay: config.mobilepay });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
