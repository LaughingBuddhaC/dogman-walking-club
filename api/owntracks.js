// Background GPS from the OwnTracks phone app (free, iOS + Android). A web page loses GPS when the screen
// locks; OwnTracks keeps running and POSTs each fix here in HTTP mode (Basic auth).
// Phone → POST {_type:'location', lat, lon, tst, acc} → added to every walk in progress, else discarded.
// Walker (admin password) → GET → the OwnTracks settings, ready to import with one tap.
import crypto from 'node:crypto';
import * as s from './_store.js';

const PASS = process.env.ADMIN_PASSWORD || (s.hasDb || process.env.VERCEL ? '' : 'dev');
const USER = 'dogman';
// The phone gets its own password (derived from the admin one) that can only add GPS points.
const secret = () => (PASS ? crypto.createHmac('sha256', PASS).update('owntracks-v1').digest('base64url').slice(0, 24) : '');
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
const isAdmin = (req) => { const g = String(req.headers['x-admin-password'] || ''); return !!(PASS && g && same(g, PASS)); };
function isPhone(req) {
  const m = /^Basic (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m || !secret()) return false;
  const [u, ...p] = Buffer.from(m[1], 'base64').toString().split(':');
  return u === USER && same(p.join(':'), secret());
}
const MAX_WALK_MS = 6 * 3600e3; // a walk someone forgot to finish stops collecting points after 6 h

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'auth' });
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
      const url = `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}/api/owntracks`;
      // Move mode with a fix every 20 m / 20 s while walking; outside walks the app can sleep (Quiet).
      return res.status(200).json({ _type: 'configuration', mode: 3, url, auth: true, username: USER, password: secret(),
        deviceId: 'walker', tid: 'DM', monitoring: 2, locatorDisplacement: 20, locatorInterval: 20, cmd: false });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!isPhone(req)) { await new Promise((r) => setTimeout(r, 600)); return res.status(401).json({ error: 'auth' }); }
    const b = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});
    const lat = Number(b.lat), lon = Number(b.lon), ms = Number(b.tst) * 1000;
    if (b._type !== 'location' || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || !(ms > 1.6e12)) return res.status(200).json([]);
    const p = [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, ms, Math.round(Number(b.acc) || 0)];
    const now = Date.now();
    for (const key of await s.liveKeys()) {
      const track = await s.getTrack(key);
      if (!track || track.status !== 'live') { await s.setLive(key, false); continue; }
      // Only fixes from during the walk – the walker's position at other times is never stored.
      if (now - track.startedAt > MAX_WALK_MS || ms < track.startedAt - 60e3 || ms > now + 60e3) continue;
      track.points = s.mergePoints(track.points, [p]);
      await s.saveTrack(key, track);
    }
    res.status(200).json([]);
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
