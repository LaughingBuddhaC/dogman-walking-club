import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const routes = { '/api/public': './api/public.js', '/api/book': './api/book.js', '/api/admin': './api/admin.js', '/api/account': './api/account.js', '/api/address': './api/address.js', '/api/track': './api/track.js' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (routes[u.pathname]) {
    let body = ''; for await (const c of req) body += c;
    req.body = body ? JSON.parse(body) : {};
    res.status = (n) => { res.statusCode = n; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return (await import(routes[u.pathname])).default(req, res);
  }
  let f = path.join('public', u.pathname); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.png') ? 'image/png' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(3000, () => console.log('http://localhost:3000'));
