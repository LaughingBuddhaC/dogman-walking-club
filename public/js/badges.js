// Badges ("rozetter") customers collect: artwork, texts and the "you got a badge" celebration.
// Shared by the main site and the account page. To add a badge: a rule in api/_store.js (BADGE_RULES)
// plus an entry in BADGES below.
window.DogBadges = (() => {
  const BADGES = {
    welcome: {
      colors: ['#ffb867', '#e8711a', '#c4560c', '#a8740a'],
      da: ['Velkommen', 'Dit første mærke som ny kunde hos The DogMan.'],
      en: ['Welcome', 'Your first badge as a new customer of The DogMan.'],
    },
  };
  const UI = {
    da: { got: 'Du har fået et nyt mærke!', hello: 'Velkommen til The DogMan', see: 'Se mine mærker', close: 'Luk', earned: 'Optjent' },
    en: { got: 'You got a new badge!', hello: 'Welcome to The DogMan', see: 'See my badges', close: 'Close', earned: 'Earned' },
  };
  const MARK = '/img/brand/mark-emboss.png'; // embossed logo medallion

  // Rosette: scalloped medal, stitched inner ring, the hiker logo, two ribbon tails.
  function svg(id) {
    const b = BADGES[id] || BADGES.welcome, [c1, c2, r1, r2] = b.colors, g = 'rg-' + id + '-' + Math.random().toString(36).slice(2, 7);
    let bumps = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      bumps += `<circle cx="${(100 + 80 * Math.cos(a)).toFixed(1)}" cy="${(96 + 80 * Math.sin(a)).toFixed(1)}" r="13"/>`;
    }
    return `<svg viewBox="0 0 200 250" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<path d="M66 150 46 240 72 226 90 246 100 162Z" fill="${r1}"/><path d="M134 150 154 240 128 226 110 246 100 162Z" fill="${r2}"/>
<g fill="url(#${g})">${bumps}<circle cx="100" cy="96" r="82"/></g>
<clipPath id="${g}-c"><circle cx="100" cy="96" r="66"/></clipPath><image href="${MARK}" x="34" y="30" width="132" height="132" clip-path="url(#${g}-c)"/>
<circle cx="100" cy="96" r="60" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 5" opacity=".55"/></svg>`;
  }

  const texts = (id, lang) => (BADGES[id] || BADGES.welcome)[lang === 'en' ? 'en' : 'da'];
  const ui = (lang) => UI[lang === 'en' ? 'en' : 'da'];

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
.rosette svg{display:block;width:100%;height:auto;filter:drop-shadow(4px 6px 8px rgba(0,0,0,.18))}
.bd-overlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,var(--bg) 55%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);animation:bdFade .3s ease}
.bd-card{position:relative;width:min(380px,100%);background:var(--bg);border-radius:34px;box-shadow:var(--raise);padding:30px 26px 26px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;overflow:hidden}
.bd-card .rosette{width:170px;animation:bdPop .9s cubic-bezier(.2,1.4,.4,1) both}
.bd-card small{font-weight:700;color:var(--accent);font-size:.85rem;letter-spacing:.02em}
.bd-card h2{font-size:1.5rem;letter-spacing:-.02em;margin:0}
.bd-card p{color:var(--muted);margin:0 0 8px;font-size:.95rem}
.bd-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.bd-actions a,.bd-actions button{font-weight:600;font-size:.95rem;font-family:inherit;padding:12px 20px;border-radius:999px;border:0;cursor:pointer;text-decoration:none;color:var(--text);background:var(--bg);box-shadow:var(--raise-sm)}
.bd-actions a{background:var(--grad);color:var(--on-grad)}
.bd-dot{position:absolute;width:9px;height:9px;border-radius:2px;top:-10px;animation:bdFall 1.6s ease-in forwards}
@keyframes bdFade{from{opacity:0}}
@keyframes bdPop{from{transform:scale(.3) rotate(-25deg);opacity:0}to{transform:none;opacity:1}}
@keyframes bdFall{to{transform:translateY(460px) rotate(540deg);opacity:0}}
@media (prefers-reduced-motion:reduce){.bd-card .rosette,.bd-overlay{animation:none}.bd-dot{display:none}}`;
    document.head.append(s);
  }

  const SEEN = 'dm-badges-seen';
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch (e) { return []; } };
  const markSeen = (ids) => { try { localStorage.setItem(SEEN, JSON.stringify([...new Set([...seen(), ...ids])])); } catch (e) {} };

  // Shows the celebration once per badge (per device). seeLink: where "See my badges" goes, or null to hide it.
  function celebrate(earned, lang, seeLink) {
    const fresh = Object.keys(earned || {}).filter((id) => BADGES[id] && !seen().includes(id));
    if (!fresh.length) return;
    markSeen(fresh); style();
    const id = fresh[0], [name, desc] = texts(id, lang), u = ui(lang);
    const ov = document.createElement('div'); ov.className = 'bd-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const card = document.createElement('div'); card.className = 'bd-card';
    const ro = document.createElement('div'); ro.className = 'rosette'; ro.innerHTML = svg(id);
    const small = document.createElement('small'); small.textContent = u.got;
    const h = document.createElement('h2'); h.textContent = id === 'welcome' ? u.hello : name;
    const p = document.createElement('p'); p.textContent = desc;
    const act = document.createElement('div'); act.className = 'bd-actions';
    if (seeLink) { const a = document.createElement('a'); a.href = seeLink; a.textContent = u.see; act.append(a); }
    const close = document.createElement('button'); close.type = 'button'; close.textContent = u.close; act.append(close);
    card.append(ro, small, h, p, act);
    const colors = (BADGES[id] || BADGES.welcome).colors;
    for (let i = 0; i < 26; i++) {
      const d = document.createElement('i'); d.className = 'bd-dot';
      d.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * .6).toFixed(2)}s`;
      card.append(d);
    }
    ov.append(card); document.body.append(ov);
    const done = () => { ov.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') done(); };
    close.onclick = done; ov.onclick = (e) => { if (e.target === ov) done(); }; document.addEventListener('keydown', esc);
    close.focus();
  }

  return { BADGES, svg, texts, ui, style, celebrate, ids: Object.keys(BADGES) };
})();
