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
  openDays: [0, 1, 2, 3, 4, 5, 6],   // 0 = Sunday
  closedDates: [],
  mobilepay: '',
  phone: '',
  pawshake: 'https://en.pawshake.dk/sitter/can',
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
  // Admin setting wins; otherwise fall back to the GOOGLE_CLIENT_ID env var (a public value).
  config.googleClientId = config.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
  return config;
}
export function estimate(svc, units, pets) {
  if (svc.price == null) return null;
  return (svc.price + (svc.extra || 0) * (pets - 1)) * units;
}
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
// A cancelled booking paid with credits gives them back (if the membership still runs).
// ---- GPS walk tracking (the walker's phone records the route; owners see a map report) ----
export const getTrack = async (key) => { const v = await cmd('HGET', 'tracks', key); return v ? JSON.parse(v) : null; };
export const saveTrack = (key, t) => cmd('HSET', 'tracks', key, JSON.stringify(t));
export const isPremium = (user, config) => { const m = activeMembership(user); return !!(m && config.plans.find((p) => p.id === m.plan)?.premium); };
const hav = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
// Distance in km, ignoring inaccurate fixes and impossible jumps (GPS jitter).
export function routeKm(points) {
  let m = 0, prev = null;
  for (const p of points) {
    if (p[3] > 40) continue;                                   // accuracy worse than 40 m
    if (prev) { const d = hav(prev, p), dt = Math.max(1, (p[2] - prev[2]) / 1000); if (d / dt < 4 && d > 2) m += d; else if (d / dt >= 4) continue; }
    prev = p;
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
// Ends a walk: summary on the booking, stats + badges on the customer.
export async function finishTrack(key, track, bk) {
  track.status = 'done'; track.endedAt = Date.now();
  track.km = routeKm(track.points);
  track.minutes = Math.max(1, Math.round((track.endedAt - track.startedAt) / 60000));
  const last = track.points[track.points.length - 1];
  track.weather = last ? await weatherNow(last[0], last[1]) : { rain: false, snow: false };
  await saveTrack(key, track);
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
export const slotKeys = (b) => (b.time ? (b.dates?.length ? b.dates : [b.date]).map((d) => `${d}|${b.time}`) : []);

// Claims all slots of a booking or none. Returns the first taken key, or null when everything was claimed.
export async function claimAll(b) {
  const done = [];
  for (const k of slotKeys(b)) {
    if (!(await claimSlot(k, b.id))) { for (const d of done) await freeSlot(d); return k; }
    done.push(k);
  }
  return null;
}
export async function freeAll(b) {
  for (const k of slotKeys(b)) if ((await slotOwner(k)) === b.id) await freeSlot(k);
}

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

  let time = '';
  if (svc.mode === 'slot') {
    time = clean(input.time, 5);
    const h = Number(time.slice(0, 2));
    if (!/^\d{2}:00$/.test(time) || h < config.hours.start || h >= config.hours.end) return { error: 'time' };
    if (!admin && dates[0] === t && h <= nowHour()) return { error: 'time' };
  }

  // Pets: a list of profiles (name, dog/cat, size, breed); older input only sends a count.
  const allowed = SERVICE_PETS[svc.id] || ['dog', 'cat'];
  const petList = (Array.isArray(input.petList) ? input.petList : []).slice(0, 6).map((p) => ({
    name: clean(p?.name, 40), type: p?.type === 'cat' ? 'cat' : 'dog', size: ['S', 'M', 'L'].includes(p?.size) ? p.size : '', breed: clean(p?.breed, 40),
  }));
  if (petList.some((p) => !allowed.includes(p.type))) return { error: 'pets' };
  const pets = petList.length || Math.min(6, Math.max(1, parseInt(input.pets, 10) || 1));

  const name = clean(input.name, 80), phone = clean(input.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 8) return { error: 'contact' };
  const units = dates.length; // nights for a range, otherwise visits/walks/days
  const first = petList[0] || {};
  return { booking: {
    id: newId(), created: new Date().toISOString(), service: svc.id, plan,
    date: dates[0], end: plan === 'range' ? end : '', dates: plan === 'range' ? [] : dates, weekdays, time,
    nights: plan === 'range' ? dates.length : 0, days: svc.mode === 'days' ? dates.length : 0, count: units,
    pets, petList, meet: !!input.meet,
    estimate: estimate(svc, units, pets), name, phone,
    email: clean(input.email, 120), address: clean(input.address, 160),
    dog: clean(input.dog, 60) || first.name || '', breed: clean(input.breed, 60) || first.breed || '', size: clean(input.size, 10) || first.size || '',
    notes: clean(input.notes, 600),
    freq: plan === 'weekly' ? 'weekly' : ['weekly', 'multi'].includes(input.freq) ? input.freq : 'once',
    lang: input.lang === 'en' ? 'en' : 'da', status: admin ? 'confirmed' : 'pending', paid: false, source: admin ? 'admin' : 'web'
  } };
}
