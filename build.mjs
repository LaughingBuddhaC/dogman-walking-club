import fs from 'node:fs';
// Everything before the first <style> (title, meta, links, JSON-LD) goes into <head>; the rest into <body>.
const wrap = (f, lang) => {
  const src = fs.readFileSync(f, 'utf8'), i = src.indexOf('<style>');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${src.slice(0, i)}<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${src.slice(i)}\n</body></html>`;
};
fs.mkdirSync('public/admin', { recursive: true });
fs.writeFileSync('public/index.html', wrap('src/site.html', 'da'));
fs.writeFileSync('public/admin/index.html', wrap('src/admin.html', 'en'));
fs.mkdirSync('public/privacy', { recursive: true });
fs.writeFileSync('public/privacy/index.html', wrap('src/privacy.html', 'da'));
fs.mkdirSync('public/account', { recursive: true });
fs.writeFileSync('public/account/index.html', wrap('src/account.html', 'da'));
fs.mkdirSync('public/walk', { recursive: true });
fs.writeFileSync('public/walk/index.html', wrap('src/walk.html', 'en'));
console.log('built');
