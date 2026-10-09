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
  googleClientId: ''                // OAuth web client ID for "Sign in with Google" (public, set in admin)
};
export async function getConfig() {
  const raw = await cmd('GET', 'config');
  const saved = raw ? JSON.parse(raw) : {};
  // The service list comes from code; only saved prices for known ids are applied.
  const services = DEFAULT_CONFIG.services.map((d) => {
    const s = (saved.services || []).find((x) => x.id === d.id);
    return s ? { ...d, price: s.price ?? null, extra: s.extra ?? null } : d;
  });
  return { ...DEFAULT_CONFIG, ...saved, services };
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

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date());
export const nowHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hour12: false }).format(new Date()));
export const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const weekday = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
export const newId = () => crypto.randomBytes(6).toString('hex');
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// Validates and normalises a booking. Returns { error } or { booking }.
export function buildBooking(input, config, { admin = false } = {}) {
  const svc = config.services.find((s) => s.id === input.service);
  if (!svc) return { error: 'service' };
  const date = clean(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return { error: 'date' };
  const t = today();
  if (!admin) {
    if (date < t || date > addDays(t, 60)) return { error: 'date' };
    if (config.closedDates.includes(date) || !config.openDays.includes(weekday(date))) return { error: 'closed' };
  }
  let time = '';
  if (svc.mode === 'slot') {
    time = clean(input.time, 5);
    const h = Number(time.slice(0, 2));
    if (!/^\d{2}:00$/.test(time) || h < config.hours.start || h >= config.hours.end) return { error: 'time' };
    if (!admin && date === t && h <= nowHour()) return { error: 'time' };
  }
  const count = (v) => Math.min(30, Math.max(1, parseInt(v, 10) || 1));
  const nights = svc.mode === 'nights' ? count(input.nights) : 0;
  const days = svc.mode === 'days' ? count(input.days) : 0;
  const pets = Math.min(6, Math.max(1, parseInt(input.pets, 10) || 1));
  const name = clean(input.name, 80), phone = clean(input.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 8) return { error: 'contact' };
  return { booking: {
    id: newId(), created: new Date().toISOString(), service: svc.id, date, time, nights, days, pets,
    estimate: estimate(svc, nights || days || 1, pets), name, phone,
    email: clean(input.email, 120), address: clean(input.address, 160), dog: clean(input.dog, 60),
    breed: clean(input.breed, 60), size: clean(input.size, 10), notes: clean(input.notes, 600),
    freq: ['once', 'weekly', 'multi'].includes(input.freq) ? input.freq : 'once',
    lang: input.lang === 'en' ? 'en' : 'da', status: admin ? 'confirmed' : 'pending', paid: false, source: admin ? 'admin' : 'web'
  } };
}
