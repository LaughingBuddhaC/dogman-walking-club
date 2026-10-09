import fs from 'node:fs';
const wrap = (f, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${fs.readFileSync(f, 'utf8')}\n</body></html>`;
fs.mkdirSync('public/admin', { recursive: true });
fs.writeFileSync('public/index.html', wrap('src/site.html', 'da'));
fs.writeFileSync('public/admin/index.html', wrap('src/admin.html', 'en'));
console.log('built');
