import { getConfig, getSlots, today } from './_store.js';
export default async function handler(req, res) {
  try {
    const [config, slots] = await Promise.all([getConfig(), getSlots()]);
    const t = today();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ config, today: t, taken: Object.keys(slots).filter((k) => k >= t) });
  } catch (e) { res.status(500).json({ error: 'server' }); }
}
