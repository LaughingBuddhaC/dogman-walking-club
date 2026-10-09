import { getConfig, buildBooking, claimSlot, saveBooking, freeSlot } from './_store.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (input.website) return res.status(200).json({ ok: true }); // honeypot
    const config = await getConfig();
    const { error, booking } = buildBooking(input, config);
    if (error) return res.status(400).json({ error });
    const key = `${booking.date}|${booking.time}`;
    if (booking.time && !(await claimSlot(key, booking.id))) return res.status(409).json({ error: 'taken' });
    try { await saveBooking(booking); } catch (e) { if (booking.time) await freeSlot(key); throw e; }
    res.status(200).json({ ok: true, id: booking.id, mobilepay: config.mobilepay });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
