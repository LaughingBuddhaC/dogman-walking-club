// Customer account: Sign in with Google, see upcoming walks, cancel a walk, log out.
import * as s from './_store.js';

async function me(user) {
  const t = s.today();
  const bookings = (await s.getBookings()).filter((b) => b.user === user.sub && b.date >= t)
    .map(({ id, service, date, time, pets, freq, status, estimate }) => ({ id, service, date, time, pets, freq, status, estimate }));
  const { sub, ...profile } = user;
  return { user: profile, bookings };
}

// Checks a Google ID token with Google and returns its claims, or null.
async function verifyGoogle(credential, clientId) {
  if (!clientId || typeof credential !== 'string' || credential.length > 4096) return null;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) return null;
  const t = await r.json();
  const ok = t.aud === clientId && ['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)
    && t.email_verified === 'true' && Number(t.exp) * 1000 > Date.now() && t.sub;
  return ok ? t : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const b = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})) : {};
    if (b.action === 'login') {
      const t = await verifyGoogle(b.credential, (await s.getConfig()).googleClientId);
      if (!t) return res.status(401).json({ error: 'login' });
      const prev = (await s.getUser(t.sub)) || {};
      const user = { ...prev, sub: t.sub, email: t.email, name: prev.name || t.name || '', picture: t.picture || '' };
      await s.saveUser(user);
      res.setHeader('Set-Cookie', s.sessionCookie(s.makeSession(t.sub), 30 * 86400));
      return res.status(200).json(await me(user));
    }
    if (b.action === 'logout') { res.setHeader('Set-Cookie', s.sessionCookie('', 0)); return res.status(200).json({ user: null }); }
    const session = s.readSession(req), user = session ? await s.getUser(session.sub) : null;
    if (!user) return res.status(200).json({ user: null });
    if (b.action === 'cancel') {
      const bk = await s.getBooking(b.id);
      if (!bk || bk.user !== user.sub || bk.status === 'cancelled' || bk.date < s.today()) return res.status(400).json({ error: 'cancel' });
      const key = bk.time ? `${bk.date}|${bk.time}` : null;
      if (key && (await s.slotOwner(key)) === bk.id) await s.freeSlot(key);
      bk.status = 'cancelled'; bk.cancelledBy = 'customer'; await s.saveBooking(bk);
    }
    res.status(200).json(await me(user));
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
