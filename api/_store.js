// Storage: Upstash Redis over REST (Vercel Marketplace). Falls back to memory for local dev.
import crypto from 'node:crypto';
// Vercel may add a custom prefix (e.g. dogmandb_KV_REST_API_URL), so match on the suffix.
const env = (suffix) => process.env[Object.keys(process.env).find((k) => k.endsWith(suffix))];
const URL_ = env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
const TOKEN = env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
export const hasDb = !!(URL_ && TOKEN);
const mem = globalThis.__dogmanMem || (globalThis.__dogmanMem = { str: {}, hash: {} });

async function cmd(...args) {
  if (!hasDb) return memCmd(args);
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
function memCmd([c, k, f, v]) {
  const h = (mem.hash[k] ||= {});
  switch (c) {
    case 'GET': return mem.str[k] ?? null;
    case 'SET': mem.str[k] = f; return 'OK';
    case 'HGETALL': return Object.entries(h).flat();
    case 'HGET': return h[f] ?? null;
    case 'HSET': h[f] = v; return 1;
    case 'HSETNX': if (f in h) return 0; h[f] = v; return 1;
    case 'HDEL': if (f in h) { delete h[f]; return 1; } return 0;
  }
}
const pairs = (a) => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };

// Version of the terms (/vilkaar/) customers accept when they book or join; stored with the booking/membership.
export const TERMS_VERSION = '2026-10-10';
export const DEFAULT_CONFIG = {
  // price = DKK per unit (night / day / walk), extra = DKK per extra pet per unit (null = not set)
  services: [
    { id: 'boarding', mode: 'nights', price: 275, extra: 125 },
    { id: 'daycare', mode: 'days', price: 200, extra: 80 },
    { id: 'housesit', mode: 'nights', price: 250, extra: null },
    { id: 'visit1', mode: 'days', price: 140, extra: null },
    { id: 'visit2', mode: 'days', price: 250, extra: null },
    { id: 'walk', mode: 'slot', price: 120, extra: 80 }
  ],
  hours: { start: 6, end: 24 },      // first slot 06:00, last slot 23:00
  // Walks are booked in time windows; I come some time inside the window. Capacity = one walk per hour of the
  // window (a 60-minute walk counts double).
  walkWindows: [[6, 9], [9, 12], [12, 16], [16, 20], [20, 24]],
  longWalkPct: 30,                   // a 60-minute walk costs this much more than the standard 30 minutes (%)
  openDays: [0, 1, 2, 3, 4, 5, 6],   // 0 = Sunday
  closedDates: [],
  mobilepay: '+45 53 51 42 00',   // MobilePay number customers pay to (admin can change it)
  phone: '+45 53 51 42 00',       // contact number shown on the site (admin can change it); also the WhatsApp button
  email: 'm.cansasmaz@gmail.com',  // address behind the e-mail button on the site (admin can change it)
  pawshake: 'https://en.pawshake.dk/sitter/EU_Yn7jKcOmgSP',
  // My own walks with Boris since we came to Denmark, added to the home-page counter: walks a day, km and minutes each.
  borisWalks: { since: '2026-07-21', perDay: 2, km: 2, minutes: 30 },
  googleClientId: '',               // OAuth web client ID for "Sign in with Google" (public, set in admin)
  // Membership plans. walks = walk credits per period, months = period length. "pack" credits add up and last
  // the whole period (punch card); "monthly" gives a fresh allowance each paid month. Edited in admin.
  plans: [
    { id: 'flex10', kind: 'pack', walks: 10, price: 1080, months: 3, active: true },
    { id: 'weekly2', kind: 'monthly', walks: 8, price: 880, months: 1, active: true },
    { id: 'daily5', kind: 'monthly', walks: 22, price: 2090, months: 1, active: true },
    // Premium: solo walks, live GPS tracking, priority times and one boarding night a month (given by the admin).
    { id: 'alfa', kind: 'monthly', walks: 22, price: 4490, months: 1, active: true, premium: true }
  ]
};
export async function getConfig() {
  const raw = await cmd('GET', 'config');
  const saved = raw ? JSON.parse(raw) : {};
  // The service list comes from code; only saved prices for known ids are applied.
  const services = DEFAULT_CONFIG.services.map((d) => {
    const s = (saved.services || []).find((x) => x.id === d.id);
    return s ? { ...d, price: s.price ?? null, extra: s.extra ?? null } : d;
  });
  const plans = DEFAULT_CONFIG.plans.map((d) => ({ ...d, ...((saved.plans || []).find((x) => x.id === d.id) || {}), id: d.id, kind: d.kind, months: d.months }));
  const config = { ...DEFAULT_CONFIG, ...saved, services, plans };
  if (!config.pawshake || /\/sitter\/can$/.test(config.pawshake)) config.pawshake = DEFAULT_CONFIG.pawshake; // old placeholder link
  // Admin setting wins; otherwise fall back to the GOOGLE_CLIENT_ID env var (a public value).
  // An empty admin field falls back to the default number instead of hiding MobilePay.
  config.mobilepay = config.mobilepay || DEFAULT_CONFIG.mobilepay;
  config.phone = config.phone || DEFAULT_CONFIG.phone;
  config.email = config.email || DEFAULT_CONFIG.email;
  config.googleClientId = config.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
  return config;
}
export function estimate(svc, units, pets, longPct = 0) {
  if (svc.price == null) return null;
  const per = svc.price + (svc.extra || 0) * (pets - 1);
  return (per + longExtra(per, longPct)) * units;
}
// Surcharge per walk for a 60-minute walk (percent of the walk's price incl. extra dogs, whole kroner).
export const longExtra = (per, pct) => (pct ? Math.round((per * pct) / 100) : 0);
export const WALK_MINUTES = [30, 60];
export const setConfig = (c) => cmd('SET', 'config', JSON.stringify(c));
export const getSlots = async () => pairs(await cmd('HGETALL', 'slots'));
export const claimSlot = (key, val) => cmd('HSETNX', 'slots', key, val);
export const freeSlot = (key) => cmd('HDEL', 'slots', key);
export const slotOwner = (key) => cmd('HGET', 'slots', key);
export async function getBookings() {
  return Object.values(pairs(await cmd('HGETALL', 'bookings'))).map((s) => JSON.parse(s)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
export const getBooking = async (id) => { const s = await cmd('HGET', 'bookings', id); return s ? JSON.parse(s) : null; };
export const saveBooking = (b) => cmd('HSET', 'bookings', b.id, JSON.stringify(b));
export const deleteBooking = (id) => cmd('HDEL', 'bookings', id);

// Customer accounts (Sign in with Google). Sessions are signed with a key derived from the DB token, so no extra secret is needed.
const SESSION_KEY = crypto.createHash('sha256').update('dogman-session:' + (TOKEN || 'dev')).digest();
const sign = (body) => crypto.createHmac('sha256', SESSION_KEY).update(body).digest();
export function makeSession(sub) {
  const body = Buffer.from(JSON.stringify({ sub, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  return body + '.' + sign(body).toString('base64url');
}
export function readSession(req) {
  const m = /(?:^|;\s*)dm_s=([^;]+)/.exec(req.headers.cookie || '');
  const [body, sig] = m ? m[1].split('.') : [];
  if (!body || !sig) return null;
  const want = sign(body), got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const s = JSON.parse(Buffer.from(body, 'base64url').toString()); return s.exp > Date.now() ? s : null; } catch { return null; }
}
export const sessionCookie = (value, maxAge) => `dm_s=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const getUser = async (sub) => { const s = await cmd('HGET', 'users', sub); return s ? JSON.parse(s) : null; };
export const saveUser = (u) => cmd('HSET', 'users', u.sub, JSON.stringify(u));
export const getUsers = async () => Object.values(pairs(await cmd('HGETALL', 'users'))).map((s) => JSON.parse(s));

// Memberships live on the customer record: { plan, kind, status: pending|active|cancelled, start, end, credits,
// request (plan asked for), autoRenew, history[] }. Payment is MobilePay; the admin marks it paid.
export const MEMBER_HORIZON_DAYS = 90; // members can book further ahead
export const addMonths = (d, n) => {
  const [y, m, day] = d.split('-').map(Number), last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, last))).toISOString().slice(0, 10);
};
export const activeMembership = (user) => {
  const m = user?.membership;
  return m && m.status === 'active' && m.end >= today() ? m : null;
};
const logM = (m, action, extra = {}) => { m.history = [...(m.history || []), { at: new Date().toISOString(), action, ...extra }].slice(-60); };

// Customer asks for a plan (or to switch plan); the current membership keeps running until the admin marks payment.
export function requestMembership(user, plan) {
  const m = user.membership || { credits: 0 };
  m.request = plan.id; m.autoRenew = true; m.requested = today();
  if (!activeMembership(user)) { m.status = 'pending'; m.plan = plan.id; m.kind = plan.kind; }
  logM(m, 'requested', { plan: plan.id });
  user.membership = m;
}
// Customer says they don't want to renew: an active membership runs to its end date, a pending one is withdrawn.
export function leaveMembership(user) {
  const m = user.membership; if (!m) return;
  if (activeMembership(user)) { m.autoRenew = false; delete m.request; logM(m, 'notRenewing'); }
  else { m.status = 'cancelled'; delete m.request; logM(m, 'withdrawn'); }
}
// Admin received the MobilePay payment: start or extend the period and load the credits.
export function payMembership(user, plan) {
  const t = today(), m = user.membership || {}, running = activeMembership(user);
  const samePlan = running && m.plan === plan.id;
  const start = samePlan ? addDays(m.end, 1) : t;
  m.credits = plan.kind === 'pack' && samePlan ? (m.credits || 0) + plan.walks : plan.walks;
  m.plan = plan.id; m.kind = plan.kind; m.status = 'active'; m.start = samePlan ? m.start : t;
  m.end = addDays(addMonths(start, plan.months), -1); m.price = plan.price; m.autoRenew = true; delete m.request;
  logM(m, 'paid', { plan: plan.id, price: plan.price, credits: plan.walks, end: m.end });
  user.membership = m;
}
export function adjustCredits(user, delta, action = 'adjusted', extra = {}) {
  const m = user.membership; if (!m) return;
  m.credits = Math.max(0, (m.credits || 0) + delta); logM(m, action, { credits: delta, ...extra });
}
// ---- Reviews (real customers only, approved by the admin), the gallery of dogs walked, and photos ----
export const getReviews = async () => Object.values(pairs(await cmd('HGETALL', 'reviews'))).map((v) => JSON.parse(v));
export const getReview = async (sub) => { const v = await cmd('HGET', 'reviews', sub); return v ? JSON.parse(v) : null; };
export const saveReview = (r) => cmd('HSET', 'reviews', r.sub, JSON.stringify(r));
export const deleteReview = (sub) => cmd('HDEL', 'reviews', sub);
export const getDogs = async () => Object.values(pairs(await cmd('HGETALL', 'dogs'))).map((v) => JSON.parse(v)).sort((a, b) => b.at.localeCompare(a.at));
export const saveDog = (d) => cmd('HSET', 'dogs', d.id, JSON.stringify(d));
export const deleteDog = (id) => cmd('HDEL', 'dogs', id);
// Photos are resized in the browser (≤ 1000 px JPEG) and kept as base64 – a few dozen KB each.
export async function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[2].length > 450_000) return null;
  const id = newId() + newId();
  await cmd('HSET', 'photos', id, JSON.stringify({ type: 'image/' + m[1], b64: m[2] }));
  return id;
}
export const getPhoto = async (id) => { const v = await cmd('HGET', 'photos', id); return v ? JSON.parse(v) : null; };
export const deletePhoto = (id) => (id ? cmd('HDEL', 'photos', id) : 0);
// Result of the last email attempts (for the admin page).
export async function setMailLog(entry) {
  const raw = await cmd('GET', 'maillog'); const list = raw ? JSON.parse(raw) : [];
  await cmd('SET', 'maillog', JSON.stringify([entry, ...list].slice(0, 10)));
}
export const getMailLog = async () => { const raw = await cmd('GET', 'maillog'); return raw ? JSON.parse(raw) : []; };
// Withdrawals (fortrydelser) sent with the online form on /fortryd/.
export const getWithdrawals = async () => Object.values(pairs(await cmd('HGETALL', 'withdrawals'))).map((v) => JSON.parse(v)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
export const getWithdrawal = async (id) => { const v = await cmd('HGET', 'withdrawals', id); return v ? JSON.parse(v) : null; };
export const saveWithdrawal = (w) => cmd('HSET', 'withdrawals', w.id, JSON.stringify(w));
// Who may review: a customer with a finished walk or a confirmed booking that has passed.
export const canReview = (bookings) => bookings.some((b) => Object.keys(b.walks || {}).length || (b.status === 'confirmed' && lastDate(b) < today()));
// "Mette Hansen" → "Mette H."
export const shortName = (n) => { const [f, ...r] = String(n || '').trim().split(/\s+/); return f ? f + (r.length ? ' ' + r.at(-1)[0].toUpperCase() + '.' : '') : ''; };

// A cancelled booking paid with credits gives them back (if the membership still runs).
// ---- GPS walk tracking (the walker's phone records the route; owners see a map report) ----
export const getTrack = async (key) => { const v = await cmd('HGET', 'tracks', key); return v ? JSON.parse(v) : null; };
export const saveTrack = (key, t) => cmd('HSET', 'tracks', key, JSON.stringify(t));
// Removes a finished walk: route, photo, card, home-page entry and the summary on the booking (and my own-walk
// booking when it has no walks left). Customer totals and badges already earned stay as they are.
export async function deleteWalk(key) {
  const [id, date] = key.split('|'), t = await getTrack(key), bk = await getBooking(id);
  if (t) { await deletePhoto(t.photo); await deletePhoto(t.card); await cmd('HDEL', 'tracks', key); await setLive(key, false); }
  await cmd('HDEL', 'showcase', key);
  if (bk?.walks?.[date]) { const w = bk.walks[date]; if (!t) { await deletePhoto(w.photo); await deletePhoto(w.card); } delete bk.walks[date];
    if (bk.own && !Object.keys(bk.walks).length) await deleteBooking(bk.id); else await saveBooking(bk); }
}
// Walks in progress (hash 'live': key → startedAt), so points from a background tracker app (OwnTracks) find them.
export const setLive = (key, on) => (on ? cmd('HSET', 'live', key, String(Date.now())) : cmd('HDEL', 'live', key));
export const liveKeys = async () => Object.keys(pairs(await cmd('HGETALL', 'live')));
// Adds points [lat, lon, ms, acc] in time order without duplicates – two sources (page + app) or late, queued uploads.
export function mergePoints(old, add) {
  const seen = new Set(), out = [];
  for (const p of [...old, ...add].sort((a, b) => a[2] - b[2])) {
    const id = p[2];
    if (!seen.has(id)) { seen.add(id); out.push(p); }
  }
  return out.slice(-4000);
}
export const isPremium = (user, config) => { const m = activeMembership(user); return !!(m && config.plans.find((p) => p.id === m.plan)?.premium); };
const hav = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
// Distance in km, ignoring inaccurate fixes and impossible jumps (GPS jitter).
// Background apps (OwnTracks) can hand over several fixes with almost the same time stamp, so speed is no
// test of a bad fix. Instead a fix is dropped when it jumps away and straight back (a spike), and only
// clearly impossible stretches (faster than 25 m/s over at least 5 s) are skipped.
export function routeKm(points) {
  const pts = points.filter((p) => p[3] <= 60);
  const keep = pts.filter((p, i) => i === 0 || i === pts.length - 1 || hav(pts[i - 1], p) + hav(p, pts[i + 1]) <= 2.5 * hav(pts[i - 1], pts[i + 1]) + 80);
  let m = 0;
  for (let i = 1; i < keep.length; i++) {
    const d = hav(keep[i - 1], keep[i]), dt = (keep[i][2] - keep[i - 1][2]) / 1000;
    if (d < 3 || (dt >= 5 && d / dt > 25)) continue;
    m += d;
  }
  return Math.round(m / 10) / 100;
}
// Rain/snow right now at the walk (Open-Meteo, free, no key; coordinates rounded to ~1 km).
async function weatherNow(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=precipitation,rain,snowfall`);
    const c = (await r.json()).current || {};
    return { rain: (c.rain || 0) > 0 || (c.precipitation || 0) > 0.1, snow: (c.snowfall || 0) > 0 };
  } catch { return { rain: false, snow: false }; }
}
// ---- Home-page showcase: the shape of a finished walk, with nothing that says where it was ----
// The first and last 150 m are cut off (the customer's door), coordinates are replaced by a 0–1000 drawing
// grid, and no name, address or time of day is kept.
export function publicShape(points, cut = 150) {
  const pts = points.filter((p) => p[3] <= 40);
  const trim = (arr) => { let d = 0, i = 0; while (i < arr.length - 1 && d < cut) { d += hav(arr[i], arr[i + 1]); i++; } return arr.slice(i); };
  const core = trim(trim(pts).reverse()).reverse();
  let len = 0; for (let i = 1; i < core.length; i++) len += hav(core[i - 1], core[i]);
  if (core.length < 8 || len < (cut ? 300 : 50)) return null;
  const k = Math.cos((core[0][0] * Math.PI) / 180), xy = core.map((p) => [p[1] * k, -p[0]]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0, sc = 1000 / Math.max(w, h, 1e-9);
  const step = Math.ceil(xy.length / 160), out = [];
  for (let i = 0; i < xy.length; i += step) out.push(xy[i]);
  if (out[out.length - 1] !== xy[xy.length - 1]) out.push(xy[xy.length - 1]);
  return out.map((p) => [Math.round((p[0] - x0) * sc + (1000 - w * sc) / 2), Math.round((p[1] - y0) * sc + (1000 - h * sc) / 2)]);
}
// One entry per walk: { at, date, km, minutes, service, dog, shape, card, ok }. `card` is the finished picture
// (the dog's photo with the route and the numbers on it); `ok` is set when the walker approves it for the home page.
export const getShowcase = async () => Object.values(pairs(await cmd('HGETALL', 'showcase'))).map((v) => JSON.parse(v)).sort((a, b) => b.at - a.at);
export const dogNames = (bk) => (bk.petList || []).map((p) => p.name).filter(Boolean).join(' & ') || bk.dog || '';
async function showcaseEntry(key, track, bk) {
  const v = await cmd('HGET', 'showcase', key), old = v ? JSON.parse(v) : {};
  return { ok: false, ...old, at: track.startedAt, date: key.split('|')[1], km: Math.round(track.km * 10) / 10, minutes: track.minutes,
    service: bk.service, dog: dogNames(bk), shape: publicShape(track.points), card: track.card || '', own: !!bk.own,
    // For the home-page counter: one id per dog (owner + name, hashed), so a dog walked ten times counts once.
    dogIds: (bk.petList?.length ? bk.petList.map((p) => p.name) : [bk.dog || '']).map((n) => crypto.createHash('sha256').update(`${bk.user || String(bk.email || '').toLowerCase() || bk.phone || bk.id}|${String(n).trim().toLowerCase()}`).digest('hex').slice(0, 12)) };
}
// Stores the card picture for a finished walk. It waits for approval; an approved walk keeps its approval.
export async function saveCard(key, track, bk) {
  const e = await showcaseEntry(key, track, bk);
  await cmd('HSET', 'showcase', key, JSON.stringify(e));
  return e;
}
// Approves a finished walk for the home page, or takes it off again. Returns whether it is shown now.
export async function setShowcase(key, track, bk, on) {
  const date = key.split('|')[1], e = await showcaseEntry(key, track, bk);
  e.ok = !!on && track.status === 'done' && !!(e.card || e.shape);
  await cmd('HSET', 'showcase', key, JSON.stringify(e));
  if (bk.walks?.[date]) { bk.walks[date].pub = e.ok; await saveBooking(bk); }
  return e.ok;
}
// Counter for the home page, over the walks whose card is published: time, distance and how many different dogs.
export function showcaseTotals(entries) {
  // Own walks with Boris are left out of time and distance: the Boris estimate in borisTotals already covers them.
  // Guest dogs on an own walk (Boris is first in its dog list) still count as dogs walked.
  const ok = entries.filter((e) => e.ok && !e.own), guests = entries.filter((e) => e.ok && e.own).flatMap((e) => (e.dogIds || []).slice(1));
  const dogs = new Set([...ok.flatMap((e) => e.dogIds || [e.date + e.at]), ...guests]);
  return { walks: ok.length, km: Math.round(ok.reduce((n, e) => n + (e.km || 0), 0) * 10) / 10, minutes: ok.reduce((n, e) => n + (e.minutes || 0), 0), dogs: dogs.size };
}
// Boris's and my walks since we came to Denmark (twice a day), counted up to today.
export function borisTotals(config, day = today()) {
  const b = config.borisWalks;
  if (!b?.since || day < b.since) return { walks: 0, km: 0, minutes: 0 };
  const days = Math.round((Date.parse(day) - Date.parse(b.since)) / 864e5) + 1, walks = days * b.perDay;
  return { walks, km: walks * b.km, minutes: walks * b.minutes, since: b.since };
}
// ---- Recordings from the GPSLogger app (Android) ----
// GPSLogger records with the screen off and sends each fix while logging is switched on. Fixes are grouped into
// recordings (a gap of 20 min starts a new one); in Walk mode a recording is then attached to a booking or to my
// own walk with Boris. Recordings older than 30 days, or attached, are removed.
const REC_GAP = 20 * 60e3;
export const getRecs = async () => Object.values(pairs(await cmd('HGETALL', 'recs'))).map((v) => JSON.parse(v)).sort((a, b) => b.start - a.start);
export const getRec = async (id) => { const v = await cmd('HGET', 'recs', id); return v ? JSON.parse(v) : null; };
export const deleteRec = async (id) => { await cmd('HDEL', 'recs', id); if ((await cmd('GET', 'recCur')) === id) await cmd('SET', 'recCur', ''); };
export async function addRecPoint(p) {
  const cur = await cmd('GET', 'recCur');
  let r = cur ? await getRec(cur) : null;
  if (!r || p[2] > r.end + REC_GAP || p[2] < r.start - REC_GAP) {
    r = { id: newId(), start: p[2], end: p[2], points: [] };
    await cmd('SET', 'recCur', r.id);
    for (const old of await getRecs()) if (old.end < Date.now() - 30 * 864e5) await cmd('HDEL', 'recs', old.id);
  }
  r.points = mergePoints(r.points, [p]); r.start = r.points[0][2]; r.end = r.points[r.points.length - 1][2];
  await cmd('HSET', 'recs', r.id, JSON.stringify(r));
}
// Drops the standing-still part at both ends (waiting at the door, or logging left on at home): the walk starts
// at the last fix within 40 m of the first one and ends at the first fix within 40 m of the last one.
export function trimIdle(points) {
  const pts = points.filter((p) => p[3] <= 40);
  if (pts.length < 3) return pts;
  let a = 0; while (a < pts.length - 1 && hav(pts[a + 1], pts[0]) <= 40) a++;
  let z = pts.length - 1; while (z > a && hav(pts[z - 1], pts[pts.length - 1]) <= 40) z--;
  return pts.slice(a, z + 1);
}
export const recSummary = (r) => {
  const pts = trimIdle(r.points), a = pts[0] || r.points[0], z = pts[pts.length - 1] || r.points[r.points.length - 1];
  return { id: r.id, start: a[2], end: z[2], rawEnd: r.end, km: routeKm(pts), n: r.points.length, live: Date.now() - r.end < 5 * 60e3, shape: publicShape(pts, 0) };
};
export const cphDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms));
// A booking for my own walk with Boris (not for a customer; left out of the customer counter, see showcaseTotals).
export async function ownWalk(date, startedAt) {
  const hh = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hour12: false }).format(new Date(startedAt));
  const bk = { id: newId(), created: new Date().toISOString(), service: 'walk', plan: 'once', date, end: '', dates: [date], weekdays: [], time: `${hh}:00`,
    nights: 0, days: 0, count: 1, pets: 1, petList: [{ name: 'Boris', type: 'dog', size: 'L', breed: 'Golden retriever' }], meet: false, minutes: 30,
    estimate: null, name: 'Can (egen hund)', phone: DEFAULT_CONFIG.phone, email: '', address: '', dog: 'Boris', breed: 'Golden retriever', size: 'L',
    notes: '', vet: '', emergency: '', terms: null, freq: 'once', lang: 'da', status: 'confirmed', paid: true, source: 'admin', own: true };
  await saveBooking(bk);
  return bk;
}
export const showcaseRaw = async () => Object.fromEntries(Object.entries(pairs(await cmd('HGETALL', 'showcase'))).map(([k, v]) => [k, JSON.parse(v)]));
export const claimSeed = async (name) => (await cmd('HSETNX', 'seeds', name, new Date().toISOString())) === 1;
export const dropShowcase = async (bookingId) => { for (const k of Object.keys(pairs(await cmd('HGETALL', 'showcase')))) if (k.startsWith(bookingId + '|')) await cmd('HDEL', 'showcase', k); };

// Ends a walk: summary on the booking, stats + badges on the customer.
// An imported route (GPX) brings its own end time and gets no weather lookup (the weather is only known "now").
export async function finishTrack(key, track, bk, { endedAt = Date.now(), weather = true } = {}) {
  track.status = 'done'; track.endedAt = endedAt;
  track.km = routeKm(track.points);
  track.minutes = Math.max(1, Math.round((track.endedAt - track.startedAt) / 60000));
  const last = track.points[track.points.length - 1];
  track.weather = last && weather ? await weatherNow(last[0], last[1]) : { rain: false, snow: false };
  await saveTrack(key, track); await setLive(key, false);
  const date = key.split('|')[1];
  bk.walks = { ...(bk.walks || {}), [date]: { km: track.km, minutes: track.minutes, startedAt: track.startedAt, key } };
  delete bk.live; await saveBooking(bk);
  if (bk.user) {
    const u = await getUser(bk.user);
    if (u) {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(track.startedAt)).replace(':', '.'));
      const st = { km: 0, walks: 0, morning: 0, night: 0, rain: 0, snow: 0, ...(u.stats || {}) };
      st.km = Math.round((st.km + track.km) * 100) / 100; st.walks += 1;
      if (hour < 7.3) st.morning += 1;
      if (hour >= 21) st.night += 1;
      if (track.weather.rain) st.rain += 1;
      if (track.weather.snow) st.snow += 1;
      u.stats = st; await saveUser(u); await awardBadges(u, []);
    }
  }
  return track;
}

// Credits are not refunded on cancellation – only when a customer uses the legal right of withdrawal (api/withdraw.js).
export async function refundCredits(bk) {
  if (!bk.credits || !bk.user || bk.refunded) return;
  const u = await getUser(bk.user);
  if (u && activeMembership(u)) { adjustCredits(u, bk.credits, 'refund', { booking: bk.id }); await saveUser(u); }
  bk.refunded = true;
}

// Badges ("rozetter"). Each rule gets the customer and all their bookings; when it first returns true the
// badge is stored with the date. Artwork and names live in public/js/badges.js.
export const BADGE_RULES = {
  welcome: () => true,                         // every new customer
  member: (user) => !!activeMembership(user),  // has an active membership
  // GPS badges, from the walk stats kept on the customer record (see finishTrack)
  km10: (u) => (u.stats?.km || 0) >= 10,
  km42: (u) => (u.stats?.km || 0) >= 42.2,
  km100: (u) => (u.stats?.km || 0) >= 100,
  walks10: (u) => (u.stats?.walks || 0) >= 10,
  walks50: (u) => (u.stats?.walks || 0) >= 50,
  morning: (u) => (u.stats?.morning || 0) >= 1,  // a walk started before 07:30
  night: (u) => (u.stats?.night || 0) >= 1,      // a walk started at 21:00 or later
  rain: (u) => (u.stats?.rain || 0) >= 1,        // walked while it was raining
  snow: (u) => (u.stats?.snow || 0) >= 1,        // walked while it was snowing
};
export async function awardBadges(user, bookings) {
  const have = { ...(user.badges || {}) };
  let changed = false;
  for (const [id, rule] of Object.entries(BADGE_RULES)) {
    if (!have[id] && rule(user, bookings)) { have[id] = new Date().toISOString(); changed = true; }
  }
  if (changed) { user.badges = have; await saveUser(user); }
  return have;
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date());
export const nowHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hour12: false }).format(new Date()));
export const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const weekday = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
export const newId = () => crypto.randomBytes(6).toString('hex');
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// Which pets each service takes, and how far ahead customers can book.
export const SERVICE_PETS = { walk: ['dog'], daycare: ['dog'], boarding: ['dog', 'cat'], housesit: ['dog', 'cat'], visit1: ['dog', 'cat'], visit2: ['dog', 'cat'] };
export const HORIZON_DAYS = 60;
export const REPEAT_WEEKS = 8; // a weekly booking reserves this many weeks; the customer re-books after that
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
const isOpen = (config, d) => !config.closedDates.includes(d) && config.openDays.includes(weekday(d));

// Hour slots a booking holds (walks only): one "date|HH:00" key per walk date.
// Last day a booking covers (pick-up day for a range, last walk/visit otherwise).
export const lastDate = (b) => b.end || (b.dates?.length ? b.dates[b.dates.length - 1] : b.date);
// Older bookings hold whole hours (a 60-minute walk also the next hour). Window bookings hold "units" inside
// their window (date|06:00#1, #2 …) – the claimed keys are stored on the booking.
const nextHour = (time) => String(Number(time.slice(0, 2)) + 1).padStart(2, '0') + ':00';
const bookingDates = (b) => (b.dates?.length ? b.dates : [b.date]);
export const slotKeys = (b) => (b.windowEnd ? (b.slots || []) : b.time ? bookingDates(b)
  .flatMap((d) => [`${d}|${b.time}`, ...(b.minutes === 60 ? [`${d}|${nextHour(b.time)}`] : [])]) : []);
export const windowUnits = (b) => (b.minutes === 60 ? 2 : 1);

// Claims all slots of a booking or none. Returns the first taken key, or null when everything was claimed.
export async function claimAll(b) {
  if (b.windowEnd) return claimWindows(b);
  const done = [];
  for (const k of slotKeys(b)) {
    if (!(await claimSlot(k, b.id))) { for (const d of done) await freeSlot(d); return k; }
    done.push(k);
  }
  return null;
}
async function claimWindows(b) {
  const s = Number(b.time.slice(0, 2)), e = Number(b.windowEnd.slice(0, 2)), need = windowUnits(b);
  const slots = await getSlots(), claimed = [];
  const undo = async (k) => { for (const c of claimed) await freeSlot(c); return k; };
  for (const d of bookingDates(b)) {
    if (slots[`${d}|${b.time}`] === 'blocked') return undo(`${d}|${b.time}`);   // the whole window is closed
    // Hours taken by older hourly bookings or blocked by the admin also use up room in the window.
    let old = 0;
    for (let h = s; h < e; h++) if (slots[`${d}|${String(h).padStart(2, '0')}:00`]) old++;
    let got = 0;
    for (let i = 1; i <= e - s - old && got < need; i++) {
      const k = `${d}|${b.time}#${i}`;
      if (await claimSlot(k, b.id)) { claimed.push(k); got++; }
    }
    if (got < need) return undo(`${d}|${b.time}`);
  }
  b.slots = claimed;
  return null;
}
export async function freeAll(b) {
  for (const k of slotKeys(b)) if ((await slotOwner(k)) === b.id) await freeSlot(k);
}
// "06–09" for a window booking, "10:00" for an older hourly one.
export const timeLabel = (b) => (b.windowEnd ? `${b.time.slice(0, 2)}–${b.windowEnd.slice(0, 2)}` : b.time);

// A pet profile. Dogs may carry the owner's declaration (hundeerklæring) – optional, filled in on "Mine ture":
// vaccinated, chipped, liability insurance, bite history, ok with other dogs, health notes. Only answered fields are kept.
export function cleanPet(p) {
  const type = p?.type === 'cat' ? 'cat' : 'dog', one = (v, ok) => (ok.includes(v) ? v : undefined), out = {
    name: clean(p?.name, 40), type, size: ['S', 'M', 'L'].includes(p?.size) ? p.size : '', breed: clean(p?.breed, 40) };
  if (type === 'dog') {
    if (typeof p?.vacc === 'boolean') out.vacc = p.vacc;
    if (typeof p?.chip === 'boolean') out.chip = p.chip;
    if (p?.ins) out.ins = clean(p.ins, 80);
    if (one(p?.bite, ['no', 'yes'])) out.bite = p.bite;
    if (one(p?.social, ['yes', 'no', 'unsure'])) out.social = p.social;
  }
  if (p?.health) out.health = clean(p.health, 300);
  return out;
}
export const declDone = (p) => p.type !== 'dog' || !!(p.vacc && p.chip && p.ins && p.bite && p.social);
// Validates and normalises a booking. Returns { error } or { booking }.
// Plans: "once" = one or more chosen dates, "weekly" = weekdays from a start date (REPEAT_WEEKS weeks),
// "range" = drop-off date to pick-up date (overnight services). Older single-date input still works.
export function buildBooking(input, config, { admin = false, member = false } = {}) {
  const svc = config.services.find((s) => s.id === input.service);
  if (!svc) return { error: 'service' };
  const t = today(), last = addDays(t, member ? MEMBER_HORIZON_DAYS : HORIZON_DAYS);
  const plan = svc.mode === 'nights' ? 'range' : input.plan === 'weekly' ? 'weekly' : 'once';
  let dates = [], end = '', weekdays = [];

  if (plan === 'range') {
    const start = clean(input.date, 10);
    end = clean(input.end, 10) || (isDate(start) ? addDays(start, Math.min(30, Math.max(1, parseInt(input.nights, 10) || 1))) : '');
    if (!isDate(start) || !isDate(end) || end <= start) return { error: 'date' };
    const n = Math.round((Date.parse(end) - Date.parse(start)) / 864e5);
    if (n > 30) return { error: 'date' };
    for (let i = 0; i < n; i++) dates.push(addDays(start, i));
    if (!admin && (start < t || start > last)) return { error: 'date' };
    if (!admin && dates.some((d) => config.closedDates.includes(d))) return { error: 'closed' };
  } else if (plan === 'weekly') {
    weekdays = [...new Set((input.weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6))].sort();
    const start = clean(input.date, 10);
    if (!weekdays.length || !isDate(start)) return { error: 'date' };
    for (let i = 0; i < REPEAT_WEEKS * 7; i++) {
      const d = addDays(start, i);
      if (weekdays.includes(weekday(d)) && (admin || (d >= t && d <= last && isOpen(config, d)))) dates.push(d);
    }
  } else {
    const list = Array.isArray(input.dates) && input.dates.length ? input.dates : [input.date];
    dates = [...new Set(list.map((d) => clean(d, 10)))].sort();
    if (!dates.length || dates.length > 40 || !dates.every(isDate)) return { error: 'date' };
    if (!admin && dates.some((d) => d < t || d > last)) return { error: 'date' };
    if (!admin && dates.some((d) => !isOpen(config, d))) return { error: 'closed' };
  }
  if (!dates.length) return { error: 'date' };

  let time = '', windowEnd = '';
  if (svc.mode === 'slot') {
    time = clean(input.time, 5);
    const h = Number(time.slice(0, 2)), win = (config.walkWindows || []).find(([s]) => s === h);
    if (!/^\d{2}:00$/.test(time) || !win) return { error: 'time' };
    // Today only while at least an hour of the window is left.
    if (!admin && dates[0] === t && nowHour() + 1 >= win[1]) return { error: 'time' };
    windowEnd = String(win[1]).padStart(2, '0') + ':00';
  }
  // Walks are 30 minutes as standard; 60 minutes on request (+longWalkPct %).
  const minutes = svc.id === 'walk' ? (Number(input.minutes) === 60 ? 60 : 30) : 0;

  // Pets: a list of profiles (name, dog/cat, size, breed); older input only sends a count.
  const allowed = SERVICE_PETS[svc.id] || ['dog', 'cat'];
  const petList = (Array.isArray(input.petList) ? input.petList : []).slice(0, 6).map(cleanPet);
  if (petList.some((p) => !allowed.includes(p.type))) return { error: 'pets' };
  const pets = petList.length || Math.min(6, Math.max(1, parseInt(input.pets, 10) || 1));

  const name = clean(input.name, 80), phone = clean(input.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 8) return { error: 'contact' };
  // Customers need an email for the booking receipt and the confirmation (admin-made bookings may skip it).
  if (!admin && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(input.email, 120))) return { error: 'email' };
  const units = dates.length; // nights for a range, otherwise visits/walks/days
  const first = petList[0] || {};
  return { booking: {
    id: newId(), created: new Date().toISOString(), service: svc.id, plan,
    date: dates[0], end: plan === 'range' ? end : '', dates: plan === 'range' ? [] : dates, weekdays, time,
    nights: plan === 'range' ? dates.length : 0, days: svc.mode === 'days' ? dates.length : 0, count: units,
    pets, petList, meet: !!input.meet,
    windowEnd, minutes, estimate: estimate(svc, units, pets, minutes === 60 ? config.longWalkPct : 0), name, phone,
    email: clean(input.email, 120), address: clean(input.address, 160),
    dog: clean(input.dog, 60) || first.name || '', breed: clean(input.breed, 60) || first.breed || '', size: clean(input.size, 10) || first.size || '',
    notes: clean(input.notes, 600),
    vet: clean(input.vet, 120), emergency: clean(input.emergency, 120),
    // The terms are linked right above the send button: sending the booking accepts them (nothing to tick).
    terms: admin ? null : { v: TERMS_VERSION, at: new Date().toISOString(), how: 'submit' },
    freq: plan === 'weekly' ? 'weekly' : ['weekly', 'multi'].includes(input.freq) ? input.freq : 'once',
    lang: input.lang === 'en' ? 'en' : 'da', status: admin ? 'confirmed' : 'pending', paid: false, source: admin ? 'admin' : 'web'
  } };
}
