// Storage: Upstash Redis over REST (Vercel Marketplace). Falls back to memory for local dev.
import crypto from 'node:crypto';
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
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
  services: [
    { id: 'walk', mode: 'slot', price: null },
    { id: 'visit', mode: 'slot', price: null },
    { id: 'daycare', mode: 'day', price: null },
    { id: 'boarding', mode: 'nights', price: null }
  ],
  hours: { start: 8, end: 19 },      // first slot 08:00, last slot 18:00
  openDays: [0, 1, 2, 3, 4, 5, 6],   // 0 = Sunday
  closedDates: [],
  mobilepay: '',
  phone: '',
  pawshake: 'https://en.pawshake.dk/sitter/can'
};
export async function getConfig() {
  const raw = await cmd('GET', 'config');
  return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
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
  const nights = svc.mode === 'nights' ? Math.min(30, Math.max(1, parseInt(input.nights, 10) || 1)) : 0;
  const name = clean(input.name, 80), phone = clean(input.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 8) return { error: 'contact' };
  return { booking: {
    id: newId(), created: new Date().toISOString(), service: svc.id, date, time, nights, name, phone,
    email: clean(input.email, 120), address: clean(input.address, 160), dog: clean(input.dog, 60),
    breed: clean(input.breed, 60), size: clean(input.size, 10), notes: clean(input.notes, 600),
    lang: input.lang === 'en' ? 'en' : 'da', status: admin ? 'confirmed' : 'pending', paid: false, source: admin ? 'admin' : 'web'
  } };
}
