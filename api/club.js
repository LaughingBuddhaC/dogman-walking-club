// Public club data for the home page: approved reviews (best first) and the gallery of dogs walked so far.
// GET            → { reviews, avg, count, dogs }
// GET ?photo=ID  → the image (reviews and gallery)
import * as s from './_store.js';

export default async function handler(req, res) {
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    if (q.get('photo')) {
      const p = /^[a-f0-9]{24}$/.test(q.get('photo')) ? await s.getPhoto(q.get('photo')) : null;
      if (!p) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', p.type);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // ids never change
      return res.end(Buffer.from(p.b64, 'base64'));
    }
    const [reviews, dogs] = await Promise.all([s.getReviews(), s.getDogs()]);
    const ok = reviews.filter((r) => r.status === 'approved');
    const avg = ok.length ? Math.round((ok.reduce((n, r) => n + r.stars, 0) / ok.length) * 10) / 10 : null;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      avg, count: ok.length,
      reviews: ok.sort((a, b) => b.stars - a.stars || b.at.localeCompare(a.at)).slice(0, 9)
        .map(({ name, dog, stars, text, photo, avatar, at }) => ({ name, dog, stars, text, photo, avatar, at: at.slice(0, 10) })),
      dogs: dogs.map(({ id, name, breed, note, photo }) => ({ id, name, breed, note, photo })),
    });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
