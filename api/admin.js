import crypto from 'node:crypto';
import * as s from './_store.js';
const PASS = process.env.ADMIN_PASSWORD || (s.hasDb || process.env.VERCEL ? '' : 'dev'); // never fall back to 'dev' on Vercel
function authed(req) {
  const given = String(req.headers['x-admin-password'] || '');
  if (!PASS || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(PASS).digest();
  return crypto.timingSafeEqual(a, b);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!PASS) return res.status(503).json({ error: 'ADMIN_PASSWORD is not set' });
  if (!authed(req)) { await new Promise((r) => setTimeout(r, 600)); return res.status(401).json({ error: 'auth' }); }
  try {
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const bk = b.id ? await s.getBooking(b.id) : null;
      if (b.action === 'status' && bk && ['pending', 'confirmed', 'cancelled'].includes(b.status)) {
        if (b.status === 'cancelled') await s.freeAll(bk);
        if (b.status !== 'cancelled' && bk.status === 'cancelled' && (await s.claimAll(bk))) return res.status(409).json({ error: 'taken' });
        bk.status = b.status; await s.saveBooking(bk);
      } else if (b.action === 'paid' && bk) { bk.paid = !!b.paid; await s.saveBooking(bk); }
      else if (b.action === 'delete' && bk) { await s.freeAll(bk); await s.deleteBooking(bk.id); }
      else if (b.action === 'add') {
        const { error, booking } = s.buildBooking(b.booking || {}, await s.getConfig(), { admin: true });
        if (error) return res.status(400).json({ error });
        if (await s.claimAll(booking)) return res.status(409).json({ error: 'taken' });
        await s.saveBooking(booking);
      } else if (b.action === 'block' && /^\d{4}-\d{2}-\d{2}\|\d{2}:00$/.test(b.key || '')) {
        if (!(await s.claimSlot(b.key, 'blocked'))) return res.status(409).json({ error: 'taken' });
      } else if (b.action === 'unblock' && (await s.slotOwner(b.key)) === 'blocked') await s.freeSlot(b.key);
      else if (b.action === 'config' && b.config) {
        const c = b.config, d = s.DEFAULT_CONFIG, num = (v) => (v === '' || v == null || isNaN(v) ? null : Math.max(0, Math.round(Number(v))));
        const start = Math.min(23, Math.max(0, parseInt(c.hours?.start, 10) || 6)), end = Math.min(24, Math.max(start + 1, parseInt(c.hours?.end, 10) || 24));
        await s.setConfig({
          services: d.services.map((x) => { const y = c.services?.find((z) => z.id === x.id); return { ...x, price: num(y?.price), extra: num(y?.extra) }; }),
          hours: { start, end },
          openDays: (c.openDays || []).map(Number).filter((n) => n >= 0 && n <= 6),
          closedDates: (c.closedDates || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 200),
          mobilepay: String(c.mobilepay || '').slice(0, 30), phone: String(c.phone || '').slice(0, 30),
          pawshake: /^https:\/\//.test(c.pawshake || '') ? String(c.pawshake).slice(0, 200) : d.pawshake,
          googleClientId: /^[\w.-]+\.apps\.googleusercontent\.com$/.test(String(c.googleClientId || '').trim()) ? String(c.googleClientId).trim() : ''
        });
      } else return res.status(400).json({ error: 'action' });
    }
    const [config, bookings, slots] = await Promise.all([s.getConfig(), s.getBookings(), s.getSlots()]);
    res.status(200).json({ config, bookings, today: s.today(), blocked: Object.keys(slots).filter((k) => slots[k] === 'blocked') });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
