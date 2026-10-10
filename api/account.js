// Customer account: Sign in with Google, see upcoming walks, cancel a walk, log out.
import * as s from './_store.js';

async function me(user) {
  const t = s.today();
  const all = (await s.getBookings()).filter((b) => b.user === user.sub);
  await s.awardBadges(user, all);
  const bookings = all.filter((b) => s.lastDate(b) >= t)
    .map(({ id, service, plan, date, end, dates, weekdays, time, pets, petList, freq, status, estimate, meet }) => ({ id, service, plan, date, end, dates, weekdays, time, pets, petList, freq, status, estimate, meet }));
  // GPS walk reports (newest first) and a walk in progress, if any.
  const reports = all.flatMap((b) => Object.entries(b.walks || {}).map(([date, w]) => ({ key: w.key, date, km: w.km, minutes: w.minutes, service: b.service })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const live = all.filter((b) => b.live).map((b) => ({ key: b.live, service: b.service }));
  const premium = s.isPremium(user, await s.getConfig());
  const { sub, ...profile } = user;
  const review = await s.getReview(user.sub);
  return { user: profile, bookings, reports, live, premium, canReview: s.canReview(all), review };
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
      if (!bk || bk.user !== user.sub || bk.status === 'cancelled' || s.lastDate(bk) < s.today()) return res.status(400).json({ error: 'cancel' });
      await s.freeAll(bk);
      bk.status = 'cancelled'; bk.cancelledBy = 'customer'; await s.refundCredits(bk); await s.saveBooking(bk);
      return res.status(200).json(await me(await s.getUser(user.sub)));
    }
    if (b.action === 'join') {
      const plan = (await s.getConfig()).plans.find((p) => p.id === b.plan && p.active);
      if (!plan) return res.status(400).json({ error: 'plan' });
      // The terms are linked next to the plans: choosing a plan accepts them.
      s.requestMembership(user, plan);
      user.terms = user.membership.terms = { v: s.TERMS_VERSION, at: new Date().toISOString(), how: 'join' };
      await s.saveUser(user);
    }
    // Optional profile on "Mine ture": pets with the dog declaration, vet and emergency contact.
    if (b.action === 'profile') {
      const str = (v, n) => String(v ?? '').trim().slice(0, n);
      user.pets = (Array.isArray(b.pets) ? b.pets : []).slice(0, 10).map(s.cleanPet).filter((p) => p.name);
      user.vet = str(b.vet, 120); user.emergency = str(b.emergency, 120);
      if (user.pets[0]) { user.dog = user.pets[0].name; user.breed = user.pets[0].breed; user.size = user.pets[0].size; }
      await s.saveUser(user);
    }
    // A review: 1–5 stars, text, optional photo. Only customers who have had a walk; shown after the admin approves.
    if (b.action === 'review') {
      const all = (await s.getBookings()).filter((x) => x.user === user.sub);
      if (!s.canReview(all)) return res.status(403).json({ error: 'review' });
      const stars = parseInt(b.stars, 10), text = String(b.text || '').trim().slice(0, 600);
      if (!(stars >= 1 && stars <= 5) || text.length < 10) return res.status(400).json({ error: 'reviewText' });
      const old = await s.getReview(user.sub);
      let photo = old?.photo || '';
      if (b.photo === null) { await s.deletePhoto(photo); photo = ''; }
      else if (b.photo) { const id = await s.savePhoto(b.photo); if (!id) return res.status(400).json({ error: 'photo' }); await s.deletePhoto(photo); photo = id; }
      const dog = String(b.dog || '').trim().slice(0, 40) || (user.pets || [])[0]?.name || user.dog || '';
      await s.saveReview({ sub: user.sub, name: s.shortName(user.name), dog, stars, text, photo, avatar: photo ? '' : user.picture || '', at: new Date().toISOString(), status: 'pending' });
    }
    if (b.action === 'leave') { s.leaveMembership(user); await s.saveUser(user); }
    res.status(200).json(await me(user));
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
