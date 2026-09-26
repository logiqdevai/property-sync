// HTTP routes of the Spiti24 collector (/collector/*). Called by the script in the operator's Chrome tab (cross-origin from https://www.spiti24.gr)
// and by the dashboard (same origin). Every route except the CORS preflight needs the token.
const { collectorScript } = require('./collector_script');

const ALLOWED_ORIGINS = new Set(['https://www.spiti24.gr', 'https://spiti24.gr']);

function publicBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
function readJson(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

async function handle(req, res, u, { collector, isAuthed, tokenOf }) {
  const origin = req.headers.origin;
  const cors = {};
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin === publicBase(req))) {
    Object.assign(cors, { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-private-network': 'true', 'access-control-max-age': '600', vary: 'Origin' });
  }
  const send = (code, obj, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (!isAuthed(req)) return send(401, { error: 'unauthorized' });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    switch (u.pathname) {
      case '/collector/next': return send(200, collector.next(Math.min(10, parseInt(u.searchParams.get('n') || '1') || 1), ip));
      case '/collector/ping': collector.lastSeen = Date.now(); return send(200, { ok: true });
      case '/collector/status': return send(200, collector.status());
      case '/collector/script': res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...cors }); return res.end(collectorScript(publicBase(req), tokenOf(req)));
      case '/collector/result': return send(200, collector.result((await readJson(req)).results));
      case '/collector/event': return send(200, collector.event(await readJson(req)));
      case '/collector/start': return send(200, collector.start(await readJson(req)));
      case '/collector/stop': return send(200, collector.stop());
      default: return send(404, { error: 'not found' });
    }
  } catch (e) { return send(400, { error: e.message }); }
}
module.exports = { handle, publicBase, readJson };
