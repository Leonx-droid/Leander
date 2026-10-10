// Leander search server. No dependencies, needs Node 18+.
// Usage: TAVILY_API_KEY=tvly-your_key node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const KEY = process.env.TAVILY_API_KEY;
const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_LIMIT, 10) || 900; // stay under the 1,000 free credits
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const cache = new Map();   // key -> {t, data}
const hits = new Map();    // ip -> [timestamps]
const CACHE_MS = 10 * 60 * 1000;
const LIMIT = 30;          // requests per minute per IP
let usage = { month: '', count: 0 }; // resets when the server restarts

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > LIMIT;
}

function budgetLeft() {
  const m = new Date().toISOString().slice(0, 7);
  if (usage.month !== m) usage = { month: m, count: 0 };
  return usage.count < MONTHLY_LIMIT;
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// One Tavily request per search (1 credit). Pages are sliced from the same cached response.
async function fetchAll(q, type) {
  const key = type + '|' + q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.data;
  if (!budgetLeft()) throw Object.assign(new Error('Leander has reached its search limit for this month.'), { status: 503 });

  const body = { query: q, search_depth: 'basic', topic: type === 'news' ? 'news' : 'general', max_results: 20 };
  if (type === 'images') { body.include_images = true; body.include_image_descriptions = true; body.max_results = 1; }

  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new Error('The search provider rejected the API key.');
  if (!r.ok) throw new Error('Search provider returned ' + r.status);
  usage.count += 1;
  const raw = await r.json();

  let list;
  if (type === 'images') {
    list = (raw.images || []).map(i => {
      const url = typeof i === 'string' ? i : i.url;
      return { title: typeof i === 'string' ? '' : i.description || '', url, thumb: url, source: host(url) };
    }).filter(i => i.url);
  } else {
    list = (raw.results || []).map(x => ({
      title: x.title, url: x.url, snippet: clip(x.content, 300), host: host(x.url),
      age: x.published_date ? String(x.published_date).slice(0, 16) : '',
    }));
  }
  cache.set(key, { t: Date.now(), data: list });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return list;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/search') {
    if (!KEY) return json(res, 500, { error: 'TAVILY_API_KEY is not set on the server.' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many searches. Try again in a minute.' });
    const q = (u.searchParams.get('q') || '').trim().slice(0, 400);
    const t = u.searchParams.get('type');
    const type = t === 'images' || t === 'news' ? t : 'web';
    const page = Math.min(1, Math.max(0, parseInt(u.searchParams.get('page'), 10) || 0));
    if (!q) return json(res, 400, { error: 'Missing query.' });
    try {
      const all = await fetchAll(q, type);
      const size = type === 'images' ? 30 : 10;
      return json(res, 200, { results: all.slice(page * size, page * size + size), hasMore: all.length > (page + 1) * size && page < 1 });
    } catch (e) { return json(res, e.status || 502, { error: e.message }); }
  }
  let file = path.normalize(path.join(PUBLIC, u.pathname === '/' ? 'index.html' : u.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('Leander running at http://localhost:' + PORT));
