import crypto from 'node:crypto';
import * as s from './_store.js';
import { mailConfirmed } from './_mail.js';
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
        if (b.status === 'cancelled') { await s.freeAll(bk); await s.refundCredits(bk); }
        if (b.status !== 'cancelled' && bk.status === 'cancelled' && (await s.claimAll(bk))) return res.status(409).json({ error: 'taken' });
        const confirming = b.status === 'confirmed' && bk.status !== 'confirmed';
        bk.status = b.status;
        // First confirmation → email with the details and calendar buttons.
        if (confirming && !bk.mails?.confirmed && (await mailConfirmed(bk, await s.getConfig()))) bk.mails = { ...(bk.mails || {}), confirmed: new Date().toISOString() };
        await s.saveBooking(bk);
      } else if (b.action === 'paid' && bk) { bk.paid = !!b.paid; await s.saveBooking(bk); }
      else if (b.action === 'delete' && bk) { await s.freeAll(bk); if (bk.status !== 'cancelled') await s.refundCredits(bk); await s.deleteBooking(bk.id); }
      else if (b.action === 'review-status' && ['approved', 'hidden'].includes(b.status)) {
        const r = await s.getReview(String(b.sub || ''));
        if (!r) return res.status(404).json({ error: 'review' });
        r.status = b.status; await s.saveReview(r);
      } else if (b.action === 'review-delete') {
        const r = await s.getReview(String(b.sub || ''));
        if (r) { await s.deletePhoto(r.photo); await s.deleteReview(r.sub); }
      } else if (b.action === 'dog-add') {
        // Gallery of dogs walked so far (name, breed, photo, short note).
        const name = String(b.name || '').trim().slice(0, 40);
        if (!name) return res.status(400).json({ error: 'dogName' });
        const photo = b.photo ? await s.savePhoto(b.photo) : '';
        if (b.photo && !photo) return res.status(400).json({ error: 'photo' });
        await s.saveDog({ id: s.newId(), name, breed: String(b.breed || '').trim().slice(0, 40), note: String(b.note || '').trim().slice(0, 120), photo, at: new Date().toISOString() });
      } else if (b.action === 'dog-delete') {
        const d = (await s.getDogs()).find((x) => x.id === b.did);
        if (d) { await s.deletePhoto(d.photo); await s.deleteDog(d.id); }
      } else if (b.action === 'withdrawal-done') {
        const w = await s.getWithdrawal(String(b.wid || ''));
        if (w) { w.handled = new Date().toISOString(); await s.saveWithdrawal(w); }
      }
      else if (/^member-/.test(b.action || '')) {
        const u = await s.getUser(String(b.sub || ''));
        if (!u?.membership) return res.status(404).json({ error: 'member' });
        const cfg = await s.getConfig();
        if (b.action === 'member-pay') {
          const plan = cfg.plans.find((p) => p.id === (u.membership.request || u.membership.plan));
          if (!plan) return res.status(400).json({ error: 'plan' });
          s.payMembership(u, plan);
        } else if (b.action === 'member-credits') s.adjustCredits(u, Math.max(-50, Math.min(50, parseInt(b.delta, 10) || 0)));
        else if (b.action === 'member-cancel') { u.membership.status = 'cancelled'; u.membership.history = [...(u.membership.history || []), { at: new Date().toISOString(), action: 'cancelledByAdmin' }]; }
        else return res.status(400).json({ error: 'action' });
        await s.saveUser(u);
      }
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
          plans: d.plans.map((x) => { const y = (c.plans || []).find((z) => z.id === x.id) || {}; return { ...x, price: num(y.price) ?? x.price, walks: Math.max(1, Math.min(60, parseInt(y.walks, 10) || x.walks)), active: y.active === undefined ? x.active : !!y.active }; }),
          googleClientId: /^[\w.-]+\.apps\.googleusercontent\.com$/.test(String(c.googleClientId || '').trim()) ? String(c.googleClientId).trim() : ''
        });
      } else return res.status(400).json({ error: 'action' });
    }
    const [config, bookings, slots] = await Promise.all([s.getConfig(), s.getBookings(), s.getSlots()]);
    const members = (await s.getUsers()).filter((u) => u.membership).map(({ sub, name, email, phone, membership }) => ({ sub, name, email, phone, membership }));
    const [reviews, dogs, withdrawals, users] = await Promise.all([s.getReviews(), s.getDogs(), s.getWithdrawals(), s.getUsers()]);
    // Profiles (dog declaration, vet, emergency contact) of customers with bookings – filled in on "Mine ture".
    const withBookings = new Set(bookings.map((b) => b.user).filter(Boolean));
    const profiles = Object.fromEntries(users.filter((u) => withBookings.has(u.sub)).map((u) => [u.sub, { pets: u.pets || [], vet: u.vet || '', emergency: u.emergency || '' }]));
    res.status(200).json({ config, bookings, members, today: s.today(), blocked: Object.keys(slots).filter((k) => slots[k] === 'blocked'),
      reviews: reviews.sort((a, b) => b.at.localeCompare(a.at)), dogs, withdrawals, profiles });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
