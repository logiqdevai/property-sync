// Agency own-website property counter.
// For each agency site in targets.json: open it in headless Chrome (Playwright), find its "for sale" listing page and read the
// result-count label ("Βρέθηκαν 91 αποτελέσματα", "1-12 από 56", "1 to 3 out of 81 properties" ...). Respects robots.txt (rules baked
// into targets.json), stops at any bot-check/captcha page (records 'blocked', never tries to solve or bypass it), low volume per site.
//
// Results are appended to $DATA_DIR/results.jsonl (one line per site) so a restart RESUMES where it stopped.
// HTTP: GET /health (no auth) | GET /status?token=...  | GET /results.jsonl?token=...   (token = $AUTH_TOKEN; without it only /health works)
// Local test: node worker.js --test 5      (first 5 sites, writes ./test_results.jsonl, no HTTP server)
const fs = require('fs'), path = require('path'), http = require('http');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const TEST = process.argv.includes('--test'); const TEST_N = TEST ? parseInt(process.argv[process.argv.indexOf('--test') + 1]) || 5 : 0;
const DATA = process.env.DATA_DIR || (TEST ? '.' : '/data');
const WORKERS = parseInt(process.env.WORKERS || (TEST ? '1' : '2'));
const GAP = parseInt(process.env.PAGE_GAP_MS || '3000');       // pause between page loads on the same site
const SITE_GAP = parseInt(process.env.SITE_GAP_MS || '1500');  // pause between sites per worker
const MAXP = parseInt(process.env.MAX_LISTING_PAGES || '4');
const RECYCLE = parseInt(process.env.RECYCLE_EVERY || '40');   // fresh browser context every N sites (keeps memory flat)
const SITE_TIMEOUT = parseInt(process.env.SITE_TIMEOUT_MS || '120000');
const TOKEN = process.env.AUTH_TOKEN || '';
const PORT = parseInt(process.env.PORT || '3000');
const OUT = path.join(DATA, TEST ? 'test_results.jsonl' : 'results.jsonl');
fs.mkdirSync(DATA, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let TARGETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'targets.json'), 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).id; } catch (e) { return null; } }) : []);
let queue = TARGETS.filter(t => !done.has(t.id) && (!process.env.ONLY_IDS || process.env.ONLY_IDS.split(',').includes(t.id))); if (TEST) queue = queue.slice(0, TEST_N);
const stats = { total: TARGETS.length, alreadyDone: done.size, startedAt: new Date().toISOString(), processed: 0, byStatus: {}, byConfidence: {}, running: true, lastId: null };

// ---------- robots.txt (rules for "User-agent: *", longest match wins, Allow wins ties, supports * and $) ----------
function robotsAllowed(rules, url) {
  if (!rules || !rules.length) return true;
  const u = new URL(url); const p = u.pathname + u.search; let best = null;
  for (const [kind, pat] of rules) {
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(p)) { const len = pat.length; if (!best || len > best.len || (len === best.len && kind === 'A')) best = { len, kind }; }
  }
  return !best || best.kind === 'A';
}

// ---------- link scoring & count extraction ----------
// Greek accents are stripped before matching (NORM), so "Αγορά" and "Αγορα" are the same word
const NORM = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SALE = /(πωληση|πωλησεις|poliseis|for[-_\s]?sale|forbuy|for[-_\s]?buy|\bbuy\b|αγορα|agora|\bsale\b|sales)/i;
const RENT = /(ενοικ|\brent|enoikias|forrent|rental|to[-_\s]?let|\blet\b)/i;
const LIST = /(ακινητα|akinita|propert|listing|search|αναζητηση|anazitisi|αγγελιες|προτασεις|katalog|catalog|estate|results)/i;
// two URLs are "siblings" when they have the same depth and differ in exactly one path segment (.../forbuy/lands/... vs .../forbuy/residences/...)
function sibKey(u) { try { const p = new URL(u).pathname.split('/').filter(Boolean); return p.length + ':' + p.slice(0, Math.max(1, p.length - 2)).join('/'); } catch (e) { return u; } }
function areSiblings(urls) {
  if (urls.length < 2) return false;
  const ps = urls.map(u => new URL(u).pathname.split('/').filter(Boolean)); const L = ps[0].length;
  if (!ps.every(p => p.length === L)) return false;
  let diff = 0; for (let i = 0; i < L; i++) if (new Set(ps.map(p => p[i])).size > 1) diff++;
  return diff === 1;
}
const BLOCK = /(pardon our interruption|just a moment|attention required|access denied|captcha|are you a robot|checking your browser|request blocked)/i;
const FALLBACK = ['/properties', '/akinita', '/listings', '/search', '/for-sale', '/property-status/for-sale', '/poliseis', '/proponeitai', '/el/akinita', '/el/properties', '/en/properties'];
const NUM = s => { s = String(s).trim(); if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, '')); return parseInt(s.replace(/[.,].*$/, '')); };
const PATTERNS = [
  ['found', /(?:βρέθηκαν|βρέθηκε|found|showing|εμφάνιση|εμφανίζονται)\s*(?:\d+\s*[-–]\s*\d+\s*(?:από|of)\s*)?(\d[\d.,]*)/gi, 1],
  ['range_of', /\d+\s*(?:[-–]|to|έως|εως)\s*\d+\s*(?:από|of|out of)\s*(\d[\d.,]*)/gi, 1],
  ['n_results', /(\d[\d.,]*)\s*(?:αποτελέσματα|αποτέλεσμα|results?)\b/gi, 1],
  ['n_properties', /(\d[\d.,]*)\s*(?:ακίνητα|ακίνητο|properties|listings|αγγελίες|προτάσεις)\b/gi, 2],
  ['total', /(?:σύνολο|total)\s*[:\-]?\s*(\d[\d.,]*)/gi, 2],
];
function extract(text) {
  const hits = [];
  for (const [name, re, weak] of PATTERNS) {
    re.lastIndex = 0; let m, k = 0;
    while ((m = re.exec(text)) && k < 3) {
      const n = NUM(m[1]); if (!(n >= 1 && n <= 20000)) continue; k++;
      hits.push({ n, pat: name, weak: weak === 2, ctx: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 25).replace(/\s+/g, ' ') });
    }
  }
  const pg = /(?:σελίδα|page)\s*(\d+)\s*(?:από|of)\s*(\d+)/i.exec(text);
  return { hits, pages: pg ? parseInt(pg[2]) : null };
}

async function gotoSafe(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(2200);
  return resp;
}

async function processSite(page, t) {
  const rec = { id: t.id, name: t.name, site: t.site, spiti24_sales: t.spiti24_sales, status: 'ok', visited: [], best: null };
  if (!robotsAllowed(t.rules, t.site)) { rec.status = 'robots'; return rec; }
  const home = await gotoSafe(page, t.site);
  const htxt = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 700)).catch(() => '');
  const htitle = await page.title().catch(() => '');
  if (BLOCK.test(htitle) || BLOCK.test(htxt) && htxt.length < 900 || (home && [403, 429].includes(home.status()))) { rec.status = 'blocked'; return rec; }
  const start = new URL(page.url()); const host = start.hostname.replace(/^www\./, '');
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => [a.href, (a.innerText || '').trim().slice(0, 60), !!a.closest('nav, header, footer, [class*="menu"], [id*="menu"], [class*="nav"]')])).catch(() => []);
  const seen = new Set(), cands = [], tier2 = [];
  const DETAIL = /(\/\d{4,}\/?$|\/(property|properties|listing|akinito|proponeitai|ad|ads)\/[^\/]+\/?$)/i;
  for (const [href, label, inNav] of links) {
    try {
      const u = new URL(href); if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== host) continue;
      const hay = NORM(decodeURIComponent(u.pathname + u.search) + ' ' + label);
      const key = u.origin + u.pathname + u.search; if (seen.has(key) || /\.(jpg|png|pdf|jpeg|gif|webp)$/i.test(u.pathname)) continue; seen.add(key);
      if (!robotsAllowed(t.rules, key)) continue;
      const sale = SALE.test(hay), rent = RENT.test(hay), list = LIST.test(hay); let sc = 0;
      if (sale) sc += 3; if (list) sc += 1; if (inNav) sc += 2; if (rent && !sale) sc -= 4;
      if (DETAIL.test(u.pathname)) sc -= 5;                                   // an individual property page, not the list
      sc -= Math.max(0, u.pathname.split('/').filter(Boolean).length - 2);    // deep paths are less likely to be the main list
      if (sale && sc >= 3) cands.push({ sc, url: key, sale: true, label });
      else if (list && !rent && !DETAIL.test(u.pathname) && inNav) tier2.push({ sc, url: key, sale: false, label });
    } catch (e) {}
  }
  cands.sort((a, b) => b.sc - a.sc); tier2.sort((a, b) => b.sc - a.sc);
  let pages = cands.slice(0, MAXP);
  if (pages.length < 2) pages = pages.concat(tier2.slice(0, 2));               // no clear "for sale" link: also try the generic properties/search menu entries
  if (!pages.length) {                                                          // nothing at all on the home page: try common listing paths
    const lang = (start.pathname.match(/^\/(el|en|gr)(\/|$)/) || [])[1];
    const paths = (lang ? FALLBACK.map(p => '/' + lang + p) : []).concat(FALLBACK).filter((p, i, a) => a.indexOf(p) === i);
    for (const p of paths) { const u = start.origin + p; if (robotsAllowed(t.rules, u)) pages.push({ sc: 0, url: u, sale: /sale|poliseis|πωλ/.test(p), label: '(fallback path)' }); if (pages.length >= 4) break; }
  }
  for (const c of pages) {
    await sleep(GAP);
    try {
      const r = await gotoSafe(page, c.url);
      if (r && r.status() >= 400 && ![403, 429].includes(r.status())) { rec.visited.push({ url: c.url, http: r.status() }); continue; }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {}); await sleep(1000);
      const txt = await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
      const title = await page.title().catch(() => '');
      if (BLOCK.test(title) || (BLOCK.test(txt.slice(0, 700)) && txt.length < 1200)) { rec.visited.push({ url: c.url, blocked: true }); continue; }
      const finalUrl = page.url(); const ex = extract(txt);
      const cards = await page.evaluate(() => Math.max(document.querySelectorAll('article, .property, .listing, [class*="property-item"], [class*="listing-item"], [class*="estate-item"], [class*="property-card"]').length, 0)).catch(() => 0);
      const marked = c.sale || SALE.test(NORM(decodeURIComponent(finalUrl))); const rentMarked = RENT.test(NORM(decodeURIComponent(finalUrl))) && !marked;
      rec.visited.push({ url: finalUrl, sale: marked, rent: rentMarked, cards, pages: ex.pages, hits: ex.hits.slice(0, 5) });
      const good = ex.hits.find(h => !h.weak);
      const sibs = pages.filter(o => o.url !== c.url && o.sale && sibKey(o.url) === sibKey(c.url)).length;   // other sale pages in the same category family?
      if (marked && good && !rentMarked && !sibs) break;    // clean sale total found and no sibling category pages to add up: stop
    } catch (e) { rec.visited.push({ url: c.url, error: e.name }); }
  }
  // ---- fallback: no total label anywhere -> count distinct property links across the site's own pagination ----
  if (!rec.visited.some(v => v.hits && v.hits.some(h => !h.weak)) ) {
    const lp = rec.visited.find(v => v.cards >= 3 || (v.cards === 0 && !v.blocked && !v.http && !v.error));
    if (lp) {
      const uniq = new Set(); let url = lp.url, pgs = 0;
      try {
        while (url && pgs < 12) {
          if (pgs > 0) { await sleep(GAP); await gotoSafe(page, url); }
          const info = await page.evaluate((base) => {
            const isD = p => !/(category|tag|page|author|feed|wp-|cart|checkout|login)/i.test(p) && (/\/\d{4,}\/?$/.test(p) || /\/(property|properties|listing|akinito|proponeitai|ad|ads|prostasia)\/[^\/]+\/?$/i.test(p));
            const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => { try { const u = new URL(h); return u.origin === base && isD(u.pathname); } catch (e) { return false; } });
            let next = document.querySelector('a[rel=next], .next a, a.next, .pagination .next a, li.next a');
            if (!next) next = [...document.querySelectorAll('a')].find(a => /^(›|»|>|next|επόμενη|επόμενο|επόμενα)$/i.test((a.innerText || '').trim()));
            return { hrefs, next: next ? next.href : null };
          }, new URL(page.url()).origin).catch(() => ({ hrefs: [], next: null }));
          const before = uniq.size; info.hrefs.forEach(h => uniq.add(h.split('#')[0].split('?')[0])); pgs++;
          if (!info.next || info.next === url || uniq.size === before) break; url = info.next;
        }
      } catch (e) {}
      if (uniq.size >= 3) rec.visited.push({ url: lp.url, sale: !!lp.sale, cards: uniq.size, pages: pgs, hits: [{ n: uniq.size, pat: 'links_across_pagination', weak: true, ctx: `${uniq.size} distinct property links over ${pgs} page(s)` }] });
    }
  }
  // ---- pick the best number ----
  const pick = (pred, conf) => {
    const vs = rec.visited.filter(v => v.hits && v.hits.length && !v.rent && pred(v));     // only pages that actually showed a number
    const all = vs.flatMap(v => v.hits.filter(h => !h.weak).map(h => ({ ...h, url: v.url }))).concat(vs.flatMap(v => v.hits.filter(h => h.weak).map(h => ({ ...h, url: v.url }))));
    const strong = all.filter(h => !h.weak); const pool = strong.length ? strong : all; if (!pool.length) return null;
    const first = vs.find(v => v.hits.some(h => !h.weak)) || vs[0];
    const ns = [...new Set(pool.map(h => h.n))];
    const top = (first.hits.find(h => !h.weak) || first.hits[0]);
    let n = Math.max(...pool.filter(h => h.url === first.url).map(h => h.n), top.n);
    // category-split sites: several sale pages that are siblings with no parent total -> the total is the SUM of the categories
    const perPage = vs.map(v => ({ url: v.url, n: (v.hits.find(h => !h.weak) || v.hits[0]).n }));
    let summed = false;
    if (perPage.length >= 2 && areSiblings(perPage.map(x => x.url))) { n = perPage.reduce((a, x) => a + x.n, 0); summed = true; }
    const weakOk = !strong.length && top.pat === 'n_properties' && first.sale;
    return { n, confidence: (strong.length ? conf : (weakOk ? 'medium' : 'low')), url: first.url, ctx: top.ctx, pattern: summed ? 'sum_of_category_pages' : top.pat, other_numbers: summed ? perPage.map(x => x.n) : ns.filter(x => x !== n).slice(0, 5), summed };
  };
  rec.best = pick(v => v.sale, 'high') || pick(v => true, 'medium');
  if (!rec.best) { const v = rec.visited.find(v => v.pages && v.cards); if (v) rec.best = { n: v.pages * v.cards, confidence: 'low', url: v.url, ctx: `estimate ${v.pages} pages x ${v.cards} cards`, pattern: 'pages_x_cards', other_numbers: [] }; }
  if (rec.best) rec.best.needs_review = rec.best.confidence === 'low' || (rec.best.other_numbers.length > 0 && !rec.best.summed);   // several different totals, or only a weak estimate
  if (!rec.best) rec.status = rec.visited.length ? 'no_count_found' : 'no_listing_page';
  else if (rec.best.other_numbers.length && rec.best.confidence === 'high') rec.best.confidence = 'medium';   // several different totals seen (e.g. category pages)
  return rec;
}

// ---------- worker pool ----------
let browser = null;
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--js-flags=--max-old-space-size=384'] });
  return browser;
}
async function newCtx() {
  const b = await getBrowser();
  const ctx = await b.newContext({ locale: 'el-GR', viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  await ctx.route('**/*', r => ['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue());   // lighter: no images/fonts
  return ctx;
}
async function worker(wid) {
  let ctx = null, page = null, n = 0;
  while (queue.length) {
    const t = queue.shift(); if (!t) break;
    try {
      if (!ctx || n % RECYCLE === 0) { if (ctx) await ctx.close().catch(() => {}); ctx = await newCtx(); page = await ctx.newPage(); }
      const rec = await Promise.race([processSite(page, t), sleep(SITE_TIMEOUT).then(() => { throw new Error('site_timeout'); })]);
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
      stats.byStatus[rec.status] = (stats.byStatus[rec.status] || 0) + 1;
      if (rec.best) stats.byConfidence[rec.best.confidence] = (stats.byConfidence[rec.best.confidence] || 0) + 1;
    } catch (e) {
      fs.appendFileSync(OUT, JSON.stringify({ id: t.id, name: t.name, site: t.site, spiti24_sales: t.spiti24_sales, status: 'error:' + (e.message || e.name).slice(0, 40), stack: process.env.DEBUG ? String(e.stack).slice(0, 500) : undefined, visited: [], best: null }) + '\n');
      stats.byStatus.error = (stats.byStatus.error || 0) + 1;
      try { if (ctx) await ctx.close().catch(() => {}); } catch (x) {} ctx = null; page = null;      // a timeout/crash: start clean
      if (!browser || !browser.isConnected()) browser = null;
    }
    n++; stats.processed++; stats.lastId = t.id;
    if (stats.processed % 25 === 0) console.log(`[${new Date().toISOString()}] processed ${stats.processed}/${queue.length + stats.processed}`, JSON.stringify(stats.byStatus), JSON.stringify(stats.byConfidence));
    await sleep(SITE_GAP);
  }
  if (ctx) await ctx.close().catch(() => {});
}

// ---------- tiny HTTP server ----------
function startServer() {
  const ok = req => { if (!TOKEN) return false; const u = new URL(req.url, 'http://x'); return u.searchParams.get('token') === TOKEN || (req.headers.authorization || '') === 'Bearer ' + TOKEN; };
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
    if (!ok(req)) { res.writeHead(TOKEN ? 401 : 503); return res.end(TOKEN ? 'unauthorized' : 'set AUTH_TOKEN to enable /status and /results.jsonl'); }
    if (u.pathname === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...stats, remaining: queue.length, memoryMB: Math.round(process.memoryUsage().rss / 1e6) }, null, 1)); }
    if (u.pathname === '/results.jsonl') { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); return fs.existsSync(OUT) ? fs.createReadStream(OUT).pipe(res) : res.end(''); }
    res.writeHead(404); res.end('not found');
  }).listen(PORT, () => console.log('http on', PORT, TOKEN ? '(token set)' : '(NO AUTH_TOKEN: only /health is served)'));
}

(async () => {
  console.log(`targets ${TARGETS.length} | already done ${done.size} | queued ${queue.length} | workers ${WORKERS} | data dir ${DATA}`);
  if (!TEST) startServer();
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => sleep(i * 4000).then(() => worker(i))));
  stats.running = false; stats.finishedAt = new Date().toISOString();
  if (!TEST) fs.writeFileSync(path.join(DATA, 'DONE'), stats.finishedAt);
  console.log('FINISHED', JSON.stringify(stats));
  if (browser) await browser.close().catch(() => {});
  if (TEST) process.exit(0);                       // in production keep serving /status and /results.jsonl
})();
