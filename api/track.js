// GPS walk tracking.
// Walker (admin password): POST {action:'start', booking, date} → POST {action:'points', key, pts:[[lat,lon,ms,acc],…]} → POST {action:'stop', key}
// Points can also arrive from the OwnTracks phone app (api/owntracks.js), which keeps tracking with the screen off.
// Owner (signed in) or admin: GET ?key=bookingId|YYYY-MM-DD → route + summary. A walk in progress is only
// visible live to premium members (and the admin); everyone else gets the report when it ends.
import crypto from 'node:crypto';
import * as s from './_store.js';

const PASS = process.env.ADMIN_PASSWORD || (s.hasDb || process.env.VERCEL ? '' : 'dev');
function isAdmin(req) {
  const given = String(req.headers['x-admin-password'] || '');
  if (!PASS || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(PASS).digest();
  return crypto.timingSafeEqual(a, b);
}
const validKey = (k) => /^[a-f0-9]{12}\|\d{4}-\d{2}-\d{2}$/.test(k || '');
const cleanPts = (pts) => (Array.isArray(pts) ? pts : []).slice(0, 500)
  .map((p) => [Number(p[0]), Number(p[1]), Number(p[2]), Number(p[3]) || 0])
  .filter((p) => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p[2] > 1.6e12)
  .map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6, p[2], Math.round(p[3])]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const key = new URL(req.url, 'http://x').searchParams.get('key');
      if (!validKey(key)) return res.status(400).json({ error: 'key' });
      const [track, bk] = await Promise.all([s.getTrack(key), s.getBooking(key.split('|')[0])]);
      if (!track || !bk) return res.status(404).json({ error: 'none' });
      const admin = isAdmin(req), session = s.readSession(req);
      const owner = session && bk.user === session.sub;
      if (!admin && !owner) return res.status(403).json({ error: 'auth' });
      if (track.status === 'live' && !admin) {
        const [u, config] = await Promise.all([s.getUser(session.sub), s.getConfig()]);
        if (!s.isPremium(u, config)) return res.status(200).json({ status: 'live', premium: false, startedAt: track.startedAt });
      }
      const km = track.status === 'live' ? s.routeKm(track.points) : track.km;
      return res.status(200).json({ status: track.status, startedAt: track.startedAt, endedAt: track.endedAt || null, km,
        minutes: track.minutes || Math.round((Date.now() - track.startedAt) / 60000), weather: track.weather || null,
        last: track.points.length ? track.points[track.points.length - 1][2] : null,
        points: track.points.filter((p) => p[3] <= 40).map((p) => [p[0], p[1]]) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!isAdmin(req)) { await new Promise((r) => setTimeout(r, 600)); return res.status(401).json({ error: 'auth' }); }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (b.action === 'start') {
      const bk = await s.getBooking(String(b.booking || ''));
      const date = String(b.date || '');
      if (!bk || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(404).json({ error: 'booking' });
      const key = `${bk.id}|${date}`;
      const existing = await s.getTrack(key);
      if (existing && existing.status === 'live') return res.status(200).json({ key, resumed: true });
      await s.saveTrack(key, { status: 'live', startedAt: Date.now(), points: [] });
      await s.setLive(key, true);
      bk.live = key; await s.saveBooking(bk);
      return res.status(200).json({ key });
    }
    const key = String(b.key || '');
    if (!validKey(key)) return res.status(400).json({ error: 'key' });
    const track = await s.getTrack(key);
    if (!track) return res.status(404).json({ error: 'none' });
    if (b.action === 'points') {
      if (track.status !== 'live') return res.status(409).json({ error: 'ended' });
      track.points = s.mergePoints(track.points, cleanPts(b.pts));
      await s.saveTrack(key, track);
      return res.status(200).json({ n: track.points.length, km: s.routeKm(track.points) });
    }
    if (b.action === 'stop') {
      if (track.status !== 'live') return res.status(200).json(track);
      track.points = s.mergePoints(track.points, cleanPts(b.pts));
      const bk = await s.getBooking(key.split('|')[0]);
      const done = await s.finishTrack(key, track, bk);
      return res.status(200).json({ km: done.km, minutes: done.minutes, weather: done.weather });
    }
    res.status(400).json({ error: 'action' });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
