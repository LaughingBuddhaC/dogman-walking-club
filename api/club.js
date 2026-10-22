// Public club data for the home page: approved reviews (best first) and the gallery of dogs walked so far.
// GET            → { reviews, avg, count, dogs, walks, totals }   (walks = published walk cards, newest first;
//                  totals = hours, km and dogs over every published walk)
// GET ?photo=ID  → the image (reviews and gallery)
import * as s from './_store.js';
import { seedWalk } from './_seed.js';

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
    await seedWalk();
    const [reviews, dogs, walks, config] = await Promise.all([s.getReviews(), s.getDogs(), s.getShowcase(), s.getConfig()]);
    // Counter = published customer walks + my walks with Boris since we came to Denmark (Boris counts as one dog).
    const pub = s.showcaseTotals(walks), boris = s.borisTotals(config);
    const totals = { walks: pub.walks + boris.walks, km: Math.round((pub.km + boris.km) * 10) / 10, minutes: pub.minutes + boris.minutes,
      dogs: pub.dogs + (boris.walks ? 1 : 0), borisSince: boris.since || null };
    const ok = reviews.filter((r) => r.status === 'approved');
    const avg = ok.length ? Math.round((ok.reduce((n, r) => n + r.stars, 0) / ok.length) * 10) / 10 : null;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      avg, count: ok.length,
      reviews: ok.sort((a, b) => b.stars - a.stars || b.at.localeCompare(a.at)).slice(0, 9)
        .map(({ name, dog, stars, text, photo, avatar, at }) => ({ name, dog, stars, text, photo, avatar, at: at.slice(0, 10) })),
      dogs: dogs.map(({ id, name, breed, note, photo, feedback, stay, traits, bff }) => ({ id, name, breed, note, photo, feedback: feedback || '', stay: stay || '', traits: traits || [], bff: !!bff })),
      totals,
      walks: walks.filter((w) => w.ok && (w.card || w.shape)).slice(0, 120).map(({ date, km, minutes, service, shape, card, dog }) => ({ date, km, minutes, service, shape, card: card || '', dog: card ? dog : '' })),
    });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
