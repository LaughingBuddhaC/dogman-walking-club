import { mailNewBooking } from './_mail.js';
import { getConfig, buildBooking, claimAll, freeAll, saveBooking, readSession, getUser, saveUser, activeMembership, adjustCredits, lastDate } from './_store.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (input.website) return res.status(200).json({ ok: true }); // honeypot
    const config = await getConfig();
    const session = readSession(req), user = session ? await getUser(session.sub) : null;
    const member = activeMembership(user);
    const { error, booking } = buildBooking(input, config, { member: !!member });
    if (error) return res.status(400).json({ error });
    if (user) { booking.user = user.sub; booking.email = booking.email || user.email; }
    // Members can pay walks with credits; extra dogs are still charged per walk.
    if (input.useCredits && booking.service === 'walk') {
      if (!member) return res.status(400).json({ error: 'member' });
      if ((member.credits || 0) < booking.count) return res.status(400).json({ error: 'credits' });
      if (lastDate(booking) > member.end) return res.status(400).json({ error: 'creditsEnd' });
      const walk = config.services.find((x) => x.id === 'walk');
      booking.credits = booking.count;
      booking.due = (walk.extra || 0) * (booking.pets - 1) * booking.count;
    }
    const taken = await claimAll(booking);
    if (taken) return res.status(409).json({ error: 'taken', date: taken.slice(0, 10) });
    try { await saveBooking(booking); } catch (e) { await freeAll(booking); throw e; }
    // Receipt to the customer + notice to the admin (failures never block the booking).
    if (await mailNewBooking(booking, config)) { booking.mails = { request: new Date().toISOString() }; await saveBooking(booking); }
    // Remember the customer's details so the next booking is pre-filled.
    if (user) {
      if (booking.credits) adjustCredits(user, -booking.credits, 'used', { booking: booking.id });
      const { name, phone, address, dog, breed, size } = booking;
      // Pet profiles are merged by name so the next booking can pick them again.
      const pets = [...(user.pets || [])];
      for (const p of booking.petList) { const i = pets.findIndex((x) => x.name && x.name.toLowerCase() === p.name.toLowerCase()); if (p.name) i >= 0 ? (pets[i] = { ...pets[i], ...p }) : pets.push(p); }
      const { vet, emergency, terms } = booking;
      try { await saveUser({ ...user, name, phone, address, dog, breed, size, pets: pets.slice(0, 10), vet: vet || user.vet || '', emergency: emergency || user.emergency || '', terms }); } catch (e) {}
    }
    res.status(200).json({ ok: true, id: booking.id, mobilepay: config.mobilepay, credits: booking.credits || 0, due: booking.due ?? null, creditsLeft: user?.membership?.credits ?? null });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
