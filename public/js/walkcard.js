// Route card: a picture of a walk (route line + distance, time, dog) to share or save.
// Looks: a soft-UI card like the site (light or dark; the dog's photo sits in a raised frame when the walk has one)
// and a transparent one to lay over a photo in a story. Every card carries the logo.
// No map tiles are drawn, so the picture shows the shape of the walk but not where it was.
// WalkCard.open({ points:[[lat,lon],…], km, minutes, date:'YYYY-MM-DD', title, lang, photoUrl? })
// await WalkCard.ready(); WalkCard.draw(data, 'soft' | 'dark' | 'clear') → canvas (data.photo = a loaded image, optional;
// data.layout = 'side' (default with a photo) | 'split' | 'corner' | 'over'; data.side = 'left' | 'right' (else automatic); data.drawRoute(g, box, casing) replaces the GPS line)
(function () {
  const W = 1080, H = 1920, ORANGE = ['#ffad5c', '#f07a1e'];
  const TXT = {
    da: { dist: 'Distance', time: 'Tid', min: 'min', walk: 'Gåtur', share: 'Del', save: 'Gem billede', close: 'Luk', clear: 'Gennemsigtig', soft: 'Lys', dark: 'Mørk', hint: 'Gennemsigtig passer oven på et foto i en story.', tag: 'Hundeluftning i Skovlunde' },
    en: { dist: 'Distance', time: 'Time', min: 'min', walk: 'Walk', share: 'Share', save: 'Save image', close: 'Close', clear: 'Transparent', soft: 'Light', dark: 'Dark', hint: 'Transparent sits on top of a photo in a story.', tag: 'Dog walking in Skovlunde' },
  };
  const FONT = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
  const num = (n, lang, d) => Number(n || 0).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Lat/lon → canvas points that fill the box (x, y, w, h) with the route centred and north up.
  // Where the GPS dropped out (two fixes more than 80 m apart), the straight jump is replaced by a gently winding
  // line between the two fixes, so the route reads like a walked path. Deterministic: the same walk draws the same way.
  function organic(points) {
    const out = [points[0]], m = 111320;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], k = Math.cos((a[0] * Math.PI) / 180);
      const dx = (b[1] - a[1]) * k * m, dy = (b[0] - a[0]) * m, len = Math.hypot(dx, dy);
      if (len > 80) {
        const n = Math.min(60, Math.ceil(len / 12)), nx = -dy / len, ny = dx / len, seed = (Math.abs(a[0] * 1e5 + b[1] * 1e5) % 1000) / 1000;
        for (let j = 1; j < n; j++) {
          const t = j / n, env = Math.sin(Math.PI * t);   // no offset at the two real fixes
          const off = env * len * (0.05 * Math.sin(t * Math.PI * (2 + seed * 2) + seed * 6) + 0.025 * Math.sin(t * Math.PI * (7 + seed * 3)));
          out.push([a[0] + (b[0] - a[0]) * t + (ny * off) / m, a[1] + (b[1] - a[1]) * t + (nx * off) / (m * k)]);
        }
      }
      out.push(b);
    }
    return out;
  }
  function fit(points, box) {
    points = organic(points);
    const k = Math.cos((points[0][0] * Math.PI) / 180), xy = points.map((p) => [p[1] * k, -p[0]]);
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1e-9, h = Math.max(...ys) - y0 || 1e-9;
    const sc = Math.min(box.w / w, box.h / h);
    return xy.map((p) => [box.x + (box.w - w * sc) / 2 + (p[0] - x0) * sc, box.y + (box.h - h * sc) / 2 + (p[1] - y0) * sc]);
  }

  // The logo (embossed round mark) is loaded once; cards drawn before it arrives simply have no logo.
  let logo = null, logoP = null;
  const ready = () => logoP || (logoP = loadImage('/img/brand/mark-emboss-round.png').then((i) => { logo = i; }).catch(() => {}));
  // Finds a golden/brown dog in the photo by its fur colour (hue 15–40°, fairly saturated): the largest connected
  // patch of such pixels (fallen leaves are small, scattered patches). Returns the dog's box as fractions of the
  // photo ({x0, x1, y0, y1}, with a little margin) or null. Good enough to pick the free side; Walk mode can override.
  function findDog(img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, w = 96, h = Math.max(1, Math.round((w * ih) / iw));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, fur = new Uint8Array(w * h);
    for (let n = 0; n < w * h; n++) {
      const r = px[n * 4] / 255, gg = px[n * 4 + 1] / 255, b = px[n * 4 + 2] / 255, mx = Math.max(r, gg, b), dl = mx - Math.min(r, gg, b);
      if (mx < 0.28 || dl / mx < 0.35 || mx !== r) continue;
      const hue = 60 * (((gg - b) / dl) % 6);
      if (hue >= 15 && hue <= 40) fur[n] = 1;
    }
    let best = [];
    const seen = new Uint8Array(w * h);
    for (let n = 0; n < w * h; n++) {
      if (!fur[n] || seen[n]) continue;
      const comp = [], stack = [n]; seen[n] = 1;
      while (stack.length) {
        const m = stack.pop(), x = m % w, y = (m - x) / w; comp.push(m);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, k = ny * w + nx;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && fur[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    if (best.length < w * h * 0.015) return null;
    const xs = best.map((m) => (m % w) / w).sort((a, b) => a - b), ys = best.map((m) => Math.floor(m / w) / h).sort((a, b) => a - b);
    const q = (a, p) => a[Math.floor(p * (a.length - 1))];
    return { x0: Math.max(0, q(xs, 0.02) - 0.06), x1: Math.min(1, q(xs, 0.98) + 0.06), y0: q(ys, 0.02), y1: q(ys, 0.98) };
  }
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const routePath = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
  const dateText = (d) => (d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString(d.lang === 'en' ? 'en-GB' : 'da-DK', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
  // Soft UI (the site's look): one surface colour, depth from a dark shadow below-right and a light one above-left.
  const SOFT = { light: { bg: '#e7ebf0', ink: '#1d1d1f', soft: '#62636a', sd: '#c3cad4', sl: '#ffffff', acc: '#b44d08' },
    dark: { bg: '#23262c', ink: '#f5f5f7', soft: '#a1a1a8', sd: '#16181c', sl: '#30343c', acc: '#ffab66' } };

  // style: 'soft' (light soft-UI card), 'dark' (the same in dark) or 'clear' (transparent, for laying over a photo).
  function draw(d, style) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineCap = 'round';
    if (style === 'clear') drawClear(g, d); else drawSoft(g, d, SOFT[style === 'dark' ? 'dark' : 'light']);
    return c;
  }

  function drawSoft(g, d, k) {
    const t = TXT[d.lang === 'en' ? 'en' : 'da'], M = 64;
    const text = (s, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(s, x, y); };
    const noShadow = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = 0; };
    // Raised: the shape casts both shadows outwards.
    const raised = (shape, depth) => { for (const [col, o] of [[k.sd, depth], [k.sl, -depth]]) { g.shadowColor = col; g.shadowBlur = depth * 2.2; g.shadowOffsetX = g.shadowOffsetY = o; g.fillStyle = k.bg; shape(); g.fill(); } noShadow(); };
    // Pressed in: the same two shadows fall inside the shape (drawn by a frame around it, clipped to the shape).
    const inset = (x, y, w, h, r, depth) => { g.save(); rr(g, x, y, w, h, r); g.fillStyle = k.bg; g.fill(); g.clip();
      for (const [col, o] of [[k.sd, depth], [k.sl, -depth]]) { g.shadowColor = col; g.shadowBlur = depth * 2; g.shadowOffsetX = g.shadowOffsetY = o; g.fillStyle = k.bg;
        g.beginPath(); g.rect(x - 200, y - 200, w + 400, h + 400); g.roundRect(x, y, w, h, r); g.fill('evenodd'); }
      g.restore(); noShadow(); };
    g.fillStyle = k.bg; g.fillRect(0, 0, W, H);

    // Head: logo in a raised round badge, club name beside it.
    const lx = M + 104, ly = 140;
    raised(() => { g.beginPath(); g.arc(lx, ly, 104, 0, 7); }, 16);
    if (logo) { g.save(); g.beginPath(); g.arc(lx, ly, 92, 0, 7); g.clip(); g.drawImage(logo, lx - 92, ly - 92, 184, 184); g.restore(); }
    text('DOGMAN WALKING CLUB', M + 238, 134, `800 46px ${FONT}`, k.ink);
    text(t.tag, M + 238, 184, `500 33px ${FONT}`, k.soft);

    // Layouts: 'side' (default with a photo) – the route on the photo beside the dog, on the side with room;
    // 'split' – photo on top, the route in its own pressed-in tile beside the numbers (never over the dog);
    // 'corner' – the route in a small tile in the photo's corner; 'over' – the route drawn across the photo.
    const layout = d.photo ? d.layout || 'side' : 'over';
    const photoIn = (P) => { const iw = d.photo.naturalWidth || d.photo.width, ih = d.photo.naturalHeight || d.photo.height, sc = Math.max(P.w / iw, P.h / ih);
      g.save(); rr(g, P.x, P.y, P.w, P.h, 44); g.clip(); g.drawImage(d.photo, P.x + (P.w - iw * sc) / 2, P.y + (P.h - ih * sc) / 2, iw * sc, ih * sc); g.restore(); };
    // The route fitted into a box; `casing` puts a white outline under it so it reads on a photo.
    const routeIn = (box, casing, lw = 16) => {
      if (d.drawRoute) return d.drawRoute(g, box, casing);
      const pts = (d.points || []).length > 1 ? fit(d.points, box) : [];
      if (!pts.length) return;
      const grad = g.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h); grad.addColorStop(0, ORANGE[0]); grad.addColorStop(1, ORANGE[1]);
      if (casing) { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 16; g.shadowOffsetY = 3; routePath(g, pts); g.strokeStyle = 'rgba(255,255,255,.94)'; g.lineWidth = lw + 10; g.stroke(); noShadow(); }
      routePath(g, pts); g.strokeStyle = grad; g.lineWidth = lw; g.stroke();
      const r = lw * 1.2, dot = (p, fill) => { g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = lw / 2; g.strokeStyle = ORANGE[1]; g.stroke(); };
      dot(pts[0], '#ffffff'); dot(pts[pts.length - 1], ORANGE[1]);
    };
    const title = d.title || t.walk;
    const titleFit = (max, w) => { let size = max; g.font = `800 ${size}px ${FONT}`; while (g.measureText(title).width > w && size > 48) { size -= 4; g.font = `800 ${size}px ${FONT}`; } return size; };
    const tile = (x, y, w, h, label, value, unit, big) => {
      inset(x, y, w, h, 44, 10);
      text(label.toUpperCase(), x + 36, y + (h < 200 ? 50 : 64), `600 ${h < 200 ? 25 : 28}px ${FONT}`, k.soft);
      g.font = `800 ${big}px ${FONT}`; const vw = g.measureText(value).width;
      const base = y + h - (h < 200 ? 32 : 44);
      text(value, x + 34, base, `800 ${big}px ${FONT}`, k.ink);
      text(unit, x + 34 + vw + 12, base, `600 ${h < 200 ? 34 : 38}px ${FONT}`, k.soft);
    };
    const dist = num(d.km, d.lang, 2), mins = String(d.minutes || 0);

    if (layout === 'split') {
      const F = { x: M, y: 272, w: W - 2 * M, h: 900 };
      raised(() => rr(g, F.x, F.y, F.w, F.h, 64), 20);
      photoIn({ x: F.x + 22, y: F.y + 22, w: F.w - 44, h: F.h - 44 });
      const y0 = 1232, R = { x: M, y: y0, w: 440, h: 528 };
      inset(R.x, R.y, R.w, R.h, 48, 12);
      routeIn({ x: R.x + 56, y: R.y + 56, w: R.w - 112, h: R.h - 112 }, false, 13);
      const cx = M + 440 + 36, cw = W - M - cx, size = titleFit(92, cw - 8);
      text(title, cx + 4, y0 + 84, `800 ${size}px ${FONT}`, k.ink);
      text(dateText(d), cx + 6, y0 + 136, `500 34px ${FONT}`, k.soft);
      tile(cx, y0 + 176, cw, 166, t.dist, dist, 'km', 76);
      tile(cx, y0 + 362, cw, 166, t.time, mins, t.min, 76);
    } else {
      const F = { x: M, y: 272, w: W - 2 * M, h: 1000 }, P = { x: F.x + 22, y: F.y + 22, w: F.w - 44, h: F.h - 44 };
      raised(() => rr(g, F.x, F.y, F.w, F.h, 64), 20);
      if (d.photo) photoIn(P); else inset(P.x, P.y, P.w, P.h, 44, 12);
      if (layout === 'corner') {
        // A raised tile in the bottom-right corner of the photo, on the card's own surface colour.
        const s2 = 300, T = { x: P.x + P.w - s2 - 26, y: P.y + P.h - s2 - 26, w: s2, h: s2 };
        g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 6; rr(g, T.x, T.y, T.w, T.h, 40); g.fillStyle = k.bg; g.globalAlpha = 0.93; g.fill(); g.restore(); noShadow();
        routeIn({ x: T.x + 38, y: T.y + 38, w: T.w - 76, h: T.h - 76 }, false, 10);
      } else if (layout === 'side') {
        // The route on the photo itself, beside the dog: on the side with more room (or the one chosen in Walk mode).
        const iw = d.photo.naturalWidth || d.photo.width, ih = d.photo.naturalHeight || d.photo.height, sc = Math.max(P.w / iw, P.h / ih);
        const ox = P.x + (P.w - iw * sc) / 2, toX = (f) => Math.min(P.x + P.w, Math.max(P.x, ox + f * iw * sc));
        const dog = d.dog === undefined ? findDog(d.photo) : d.dog, L = dog ? toX(dog.x0) : P.x + P.w * 0.35, R = dog ? toX(dog.x1) : P.x + P.w * 0.65;
        const side = d.side === 'left' || d.side === 'right' ? d.side : L - P.x >= P.x + P.w - R ? 'left' : 'right';
        const pad = 50, minW = P.w * 0.28;
        // The free strip between the photo edge and the dog, at least 28 % of the photo wide.
        const x0 = side === 'left' ? P.x + pad : Math.min(R + 24, P.x + P.w - pad - minW), x1 = side === 'left' ? Math.max(L - 24, P.x + pad + minW) : P.x + P.w - pad;
        routeIn({ x: x0, y: P.y + 90, w: x1 - x0, h: P.h - 180 }, true, 14);
        d.usedSide = side;
      } else routeIn({ x: P.x + 120, y: P.y + 120, w: P.w - 240, h: P.h - 240 }, !!d.photo);
      const size = titleFit(104, W - 2 * M - 16);
      text(title, M + 8, 1404, `800 ${size}px ${FONT}`, k.ink);
      text(dateText(d), M + 10, 1462, `500 38px ${FONT}`, k.soft);
      const gap = 32, tw = (W - 2 * M - gap) / 2;
      tile(M, 1516, tw, 232, t.dist, dist, 'km', 98);
      tile(M + tw + gap, 1516, tw, 232, t.time, mins, t.min, 98);
    }
    text('dmw.cansasmaz.com', W / 2, 1852, `600 34px ${FONT}`, k.acc, 'center');
  }

  function drawClear(g, d) {
    const t = TXT[d.lang === 'en' ? 'en' : 'da'], ink = '#ffffff', soft = 'rgba(255,255,255,.78)';
    // The text gets a soft shadow so it stays readable on any photo.
    const shadow = (on) => { g.shadowColor = on ? 'rgba(0,0,0,.45)' : 'transparent'; g.shadowBlur = on ? 18 : 0; g.shadowOffsetY = on ? 3 : 0; };
    const text = (s, x, y, font, color) => { g.font = font; g.fillStyle = color; g.textAlign = 'left'; g.fillText(s, x, y); };
    shadow(true);
    const title = d.title || t.walk; let size = 124; g.font = `800 ${size}px ${FONT}`;
    while (g.measureText(title).width > W - 180 && size > 60) { size -= 6; g.font = `800 ${size}px ${FONT}`; }
    text(title, 90, 330, `800 ${size}px ${FONT}`, ink);
    text(dateText(d), 92, 400, `500 44px ${FONT}`, soft);
    const pts = (d.points || []).length > 1 ? fit(d.points, { x: 150, y: 520, w: W - 300, h: 760 }) : [];
    if (pts.length) {
      const grad = g.createLinearGradient(150, 520, W - 150, 1280); grad.addColorStop(0, ORANGE[0]); grad.addColorStop(1, ORANGE[1]);
      routePath(g, pts); g.strokeStyle = grad; g.lineWidth = 16; g.stroke(); shadow(false);
      const dot = (p, fill) => { g.beginPath(); g.arc(p[0], p[1], 19, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 8; g.strokeStyle = ORANGE[1]; g.stroke(); };
      dot(pts[0], '#ffffff'); dot(pts[pts.length - 1], ORANGE[1]);
    }
    shadow(true);
    const cols = [[t.dist, num(d.km, d.lang, 2), 'km'], [t.time, String(d.minutes || 0), t.min]], cw = (W - 180) / cols.length;
    cols.forEach(([label, value, unit], i) => {
      const x = 90 + cw * i;
      text(label.toUpperCase(), x, 1440, `600 34px ${FONT}`, soft);
      g.font = `800 104px ${FONT}`; const vw = g.measureText(value).width;
      text(value, x, 1556, `800 104px ${FONT}`, ink);
      text(unit, x + vw + 14, 1556, `600 44px ${FONT}`, soft);
    });
    // Brand line with the logo.
    const bx = logo ? 280 : 90;
    if (logo) { g.save(); g.beginPath(); g.arc(174, 1724, 84, 0, 7); g.clip(); shadow(false); g.drawImage(logo, 90, 1640, 168, 168); g.restore(); shadow(true); }
    text('DOGMAN WALKING CLUB', bx, 1724, `800 48px ${FONT}`, ink);
    text(t.tag + ' · dmw.cansasmaz.com', bx, 1778, `500 ${logo ? 31 : 36}px ${FONT}`, soft);
    shadow(false);
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
    const btn = (txt, primary) => { const b = el('button', `font:600 15px ${FONT};padding:11px 12px;border:0;border-radius:999px;box-shadow:none;cursor:pointer;flex:1;white-space:nowrap;${primary ? 'background:linear-gradient(135deg,#ffad5c,#f07a1e);color:#1d1d1f' : 'background:#33363d;color:#fff'}`, txt); b.type = 'button'; return b; };
    const row = () => el('div', 'display:flex;gap:8px;width:100%');
    if (d.photoUrl && !d.photo) { try { d.photo = await loadImage(d.photoUrl); } catch (e) { /* card without the photo */ } }
    await ready();
    let style = 'soft', canvas = null;
    const styles = row(), tabs = ['soft', 'dark', 'clear'].map((s) => { const b = btn(t[s]); b.onclick = () => { style = s; paint(); }; styles.append(b); return [s, b]; });
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
  const loadImage = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  // JPEG data URL no longer than `max` characters (what the server stores): scaled to `side` px, quality lowered until it fits.
  function jpeg(source, side, max = 440000) {
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height, k = Math.min(1, side / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k); c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.58, 0.45, 0.3]) { const u = c.toDataURL('image/jpeg', q); if (u.length <= max) return u; }
    return side > 500 ? jpeg(source, Math.round(side * 0.75), max) : null;
  }
  // A photo file from the camera or gallery → { url (JPEG data URL, ≤ 1280 px), img }.
  async function photoFile(file) { const u = URL.createObjectURL(file); try { const url = jpeg(await loadImage(u), 1280); return { url, img: await loadImage(url) }; } finally { URL.revokeObjectURL(u); } }
  window.WalkCard = { open, draw, findDog, ready, share, jpeg, loadImage, photoFile };
})();
