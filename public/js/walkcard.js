// Route card: a picture of a walk (route line + distance, time, dog) to share or save.
// Three looks – transparent (to lay over a photo in a story), light and dark. No map tiles are drawn, so the
// picture shows the shape of the walk but not where it was.
// WalkCard.open({ points:[[lat,lon],…], km, minutes, date:'YYYY-MM-DD', title, lang })
(function () {
  const W = 1080, H = 1920, ORANGE = ['#ffad5c', '#f07a1e'];
  const TXT = {
    da: { dist: 'Distance', time: 'Tid', min: 'min', walk: 'Gåtur', share: 'Del', save: 'Gem billede', close: 'Luk', clear: 'Gennemsigtig', light: 'Lys', dark: 'Mørk', hint: 'Gennemsigtig passer oven på et foto i en story.', tag: 'Hundeluftning i Skovlunde' },
    en: { dist: 'Distance', time: 'Time', min: 'min', walk: 'Walk', share: 'Share', save: 'Save image', close: 'Close', clear: 'Transparent', light: 'Light', dark: 'Dark', hint: 'Transparent sits on top of a photo in a story.', tag: 'Dog walking in Skovlunde' },
  };
  const FONT = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
  const num = (n, lang, d) => Number(n || 0).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Lat/lon → canvas points that fill the box (x, y, w, h) with the route centred and north up.
  function fit(points, box) {
    const k = Math.cos((points[0][0] * Math.PI) / 180), xy = points.map((p) => [p[1] * k, -p[0]]);
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1e-9, h = Math.max(...ys) - y0 || 1e-9;
    const sc = Math.min(box.w / w, box.h / h);
    return xy.map((p) => [box.x + (box.w - w * sc) / 2 + (p[0] - x0) * sc, box.y + (box.h - h * sc) / 2 + (p[1] - y0) * sc]);
  }

  function draw(d, style) {
    const t = TXT[d.lang === 'en' ? 'en' : 'da'], c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), dark = style !== 'light', ink = dark ? '#ffffff' : '#1d1d1f', soft = dark ? 'rgba(255,255,255,.72)' : '#62636a';
    if (style === 'light') { g.fillStyle = '#e7ebf0'; g.fillRect(0, 0, W, H); }
    if (style === 'dark') { g.fillStyle = '#1d1f24'; g.fillRect(0, 0, W, H); }
    // On a transparent card the text gets a soft shadow so it stays readable on any photo.
    const shadow = (on) => { g.shadowColor = on && style === 'clear' ? 'rgba(0,0,0,.45)' : 'transparent'; g.shadowBlur = on ? 18 : 0; g.shadowOffsetY = on ? 3 : 0; };
    const text = (s, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(s, x, y); };
    g.textBaseline = 'alphabetic';

    // Head: who walked, and when.
    shadow(true);
    const date = d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString(d.lang === 'en' ? 'en-GB' : 'da-DK', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    let size = 124; g.font = `800 ${size}px ${FONT}`;
    const title = d.title || t.walk;
    while (g.measureText(title).width > W - 180 && size > 60) { size -= 6; g.font = `800 ${size}px ${FONT}`; }
    text(title, 90, 330, `800 ${size}px ${FONT}`, ink);
    text(date, 92, 400, `500 44px ${FONT}`, soft);

    // Route.
    const pts = (d.points || []).length > 1 ? fit(d.points, { x: 150, y: 520, w: W - 300, h: 760 }) : [];
    if (pts.length) {
      const grad = g.createLinearGradient(150, 520, W - 150, 1280); grad.addColorStop(0, ORANGE[0]); grad.addColorStop(1, ORANGE[1]);
      g.lineJoin = 'round'; g.lineCap = 'round';
      const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
      shadow(true); path(); g.strokeStyle = grad; g.lineWidth = 16; g.stroke(); shadow(false);
      const dot = (p, fill) => { g.beginPath(); g.arc(p[0], p[1], 19, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 8; g.strokeStyle = ORANGE[1]; g.stroke(); };
      dot(pts[0], dark ? '#1d1f24' : '#ffffff'); dot(pts[pts.length - 1], ORANGE[1]);
    }

    // Numbers.
    shadow(true);
    const cols = [[t.dist, num(d.km, d.lang, 2), 'km'], [t.time, String(d.minutes || 0), t.min]];
    const cw = (W - 180) / cols.length;
    cols.forEach(([label, value, unit], i) => {
      const x = 90 + cw * i;
      text(label.toUpperCase(), x, 1440, `600 34px ${FONT}`, soft);
      g.font = `800 104px ${FONT}`; const vw = g.measureText(value).width;
      text(value, x, 1556, `800 104px ${FONT}`, ink);
      text(unit, x + vw + 14, 1556, `600 44px ${FONT}`, soft);
    });

    // Brand line.
    g.fillStyle = ORANGE[1]; shadow(false); g.fillRect(90, 1660, 96, 10); shadow(true);
    text('DOGMAN WALKING CLUB', 90, 1740, `800 50px ${FONT}`, ink);
    text(t.tag + ' · dmw.cansasmaz.com', 90, 1800, `500 36px ${FONT}`, soft);
    shadow(false);
    return c;
  }

  const blob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  const fileName = (d) => 'dogman-' + (d.date || 'walk') + '.png';
  async function save(canvas, d) { const a = document.createElement('a'); a.href = URL.createObjectURL(await blob(canvas)); a.download = fileName(d); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  async function share(canvas, d) {
    const file = new File([await blob(canvas)], fileName(d), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* closed by the user */ } return; }
    await save(canvas, d);
  }

  async function open(d) {
    const t = TXT[d.lang === 'en' ? 'en' : 'da'];
    try { await Promise.all([document.fonts.load(`800 100px Inter`), document.fonts.load(`500 40px Inter`)]); } catch (e) { /* system font instead */ }
    const el = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
    const back = el('div', 'position:fixed;inset:0;z-index:9999;background:rgba(15,16,20,.82);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto');
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', t.share);
    const box = el('div', `display:flex;flex-direction:column;gap:12px;align-items:center;width:min(340px,100%);margin:auto;font:500 15px ${FONT};color:#fff`);
    // The chequered backing shows which parts of the transparent card are see-through.
    const frame = el('div', 'width:100%;aspect-ratio:9/16;max-height:62vh;border-radius:18px;overflow:hidden;background:#3a3d44 repeating-conic-gradient(#4a4d55 0 25%,transparent 0 50%) 0 0/28px 28px;display:flex;justify-content:center');
    const btn = (txt, primary) => { const b = el('button', `font:600 15px ${FONT};padding:11px 16px;border:0;border-radius:999px;box-shadow:none;cursor:pointer;flex:1;white-space:nowrap;${primary ? 'background:linear-gradient(135deg,#ffad5c,#f07a1e);color:#1d1d1f' : 'background:#33363d;color:#fff'}`, txt); b.type = 'button'; return b; };
    const row = () => el('div', 'display:flex;gap:8px;width:100%');
    let style = 'clear', canvas = null;
    const styles = row(), tabs = ['clear', 'light', 'dark'].map((s) => { const b = btn(t[s]); b.onclick = () => { style = s; paint(); }; styles.append(b); return [s, b]; });
    function paint() {
      canvas = draw(d, style); canvas.style.cssText = 'height:100%;width:auto;max-width:100%;display:block';
      frame.replaceChildren(canvas);
      tabs.forEach(([s, b]) => { b.setAttribute('aria-pressed', String(s === style)); b.style.outline = s === style ? '2px solid #f07a1e' : 'none'; });
    }
    const acts = row(), sh = btn(t.share, true), sv = btn(t.save), cl = btn(t.close);
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    sh.onclick = () => share(canvas, d); sv.onclick = () => save(canvas, d); cl.onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    document.addEventListener('keydown', esc);
    acts.append(sh, sv);
    box.append(frame, styles, el('div', 'font-size:13px;opacity:.75;text-align:center', t.hint), acts, cl);
    cl.style.flex = 'none'; cl.style.width = '100%';
    back.append(box); document.body.append(back); paint(); sh.focus();
  }
  window.WalkCard = { open, draw };
})();
