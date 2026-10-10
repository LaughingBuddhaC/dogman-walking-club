// Online withdrawal (fortrydelsesfunktion, forbrugeraftaleloven § 20 a): the customer withdraws from a booking or a
// membership with a short form on /fortryd/. The receipt is shown at once and emailed. A signed-in customer's own
// booking is cancelled right away; the admin refunds any payment and marks the withdrawal handled.
import * as s from './_store.js';
import { mailWithdrawal } from './_mail.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (b.website) return res.status(200).json({ ok: true }); // honeypot
    const str = (v, n) => String(v ?? '').trim().slice(0, n);
    const name = str(b.name, 80), email = str(b.email, 120), what = b.what === 'membership' ? 'membership' : 'booking';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'contact' });
    const w = { id: s.newId(), at: new Date().toISOString(), name, email, phone: str(b.phone, 30), what,
      ref: str(b.ref, 40), message: str(b.message, 600), lang: b.lang === 'en' ? 'en' : 'da', cancelled: false };
    const session = s.readSession(req), user = session ? await s.getUser(session.sub) : null;
    if (user) {
      w.user = user.sub;
      if (what === 'booking' && /^[a-f0-9]{12}$/.test(w.ref)) {
        const bk = await s.getBooking(w.ref);
        if (bk && bk.user === user.sub && bk.status !== 'cancelled' && s.lastDate(bk) >= s.today()) {
          await s.freeAll(bk); bk.status = 'cancelled'; bk.cancelledBy = 'withdrawal'; await s.refundCredits(bk); await s.saveBooking(bk);
          w.cancelled = true;
        }
      }
      if (what === 'membership' && user.membership && user.membership.status !== 'cancelled') {
        s.leaveMembership(user); await s.saveUser(user); w.cancelled = true;
      }
    }
    await s.saveWithdrawal(w);
    await mailWithdrawal(w);
    res.status(200).json({ id: w.id, at: w.at, cancelled: w.cancelled });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
