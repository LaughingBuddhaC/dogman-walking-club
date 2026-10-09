// Address suggestions for the booking form, from Photon (OpenStreetMap data, no API key).
// Proxied through this function so customers' IP addresses are not sent to a third party.
const HOME = { lat: 55.7225, lon: 12.4015 }; // Skovlunde
const BBOX = '12.15,55.60,12.65,55.85';     // greater Copenhagen west; keeps suggestions local
const UA = { 'User-Agent': 'DogMan Walking Club (https://dmw.cansasmaz.com)' };
// Official Danish postal districts nearby (OpenStreetMap often names the town instead, e.g. "2740 Ballerup").
const POSTAL = { '2600': 'Glostrup', '2605': 'Brøndby', '2610': 'Rødovre', '2620': 'Albertslund', '2625': 'Vallensbæk', '2650': 'Hvidovre',
  '2700': 'Brønshøj', '2720': 'Vanløse', '2730': 'Herlev', '2740': 'Skovlunde', '2750': 'Ballerup', '2760': 'Måløv', '2765': 'Smørum',
  '2860': 'Søborg', '2870': 'Dyssegård', '2880': 'Bagsværd', '3500': 'Værløse' };

function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function toItem(f) {
  const p = f.properties || {}, [lon, lat] = f.geometry?.coordinates || [];
  const street = p.street || (p.type === 'street' ? p.name : '');
  if (!street) return null;
  const line1 = [street, p.housenumber].filter(Boolean).join(' ');
  const line2 = [p.postcode, POSTAL[p.postcode] || p.city || p.district || p.county].filter(Boolean).join(' ');
  return { label: line2 ? `${line1}, ${line2}` : line1, line1, line2, exact: !!p.housenumber, km: km(HOME, { lat, lon }) };
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const q = (u.searchParams.get('q') || '').trim().slice(0, 100);
  const lat = parseFloat(u.searchParams.get('lat')), lon = parseFloat(u.searchParams.get('lon'));
  let url;
  if (q.length >= 3) url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lat=${HOME.lat}&lon=${HOME.lon}&bbox=${BBOX}&layer=house&layer=street&lang=default`;
  else if (Number.isFinite(lat) && Number.isFinite(lon)) url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1&layer=house&lang=default`;
  else return res.status(400).json({ error: 'q' });
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const seen = new Set();
    const items = ((await r.json()).features || []).map(toItem)
      .filter((x) => x && !seen.has(x.label) && seen.add(x.label))
      .sort((a, b) => b.exact - a.exact).slice(0, 6); // full addresses before bare streets
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600');
    res.status(200).json({ items });
  } catch (e) { res.status(502).json({ error: 'upstream' }); }
}
