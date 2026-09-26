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
const GAP = parseInt(process.env.PAGE_GAP_MS || '2000');       // pause between page loads on the same site (~1 request per 2-3 s per site)
const SITE_GAP = parseInt(process.env.SITE_GAP_MS || '800');   // pause between sites per worker
const SETTLE = parseInt(process.env.SETTLE_MS || '1500');      // wait after a page loads, for its scripts to render the list
const SCROLL = parseInt(process.env.SCROLL_MS || '600');       // wait after scrolling to the bottom (lazy-loaded results)
const MAXP = parseInt(process.env.MAX_LISTING_PAGES || '4');
const RECYCLE = parseInt(process.env.RECYCLE_EVERY || '15');   // fresh browser context every N sites (keeps memory flat)
const HEAP_GUARD_MB = parseInt(process.env.HEAP_GUARD_MB || '450');   // safety net: if Node's live heap passes this, finish current sites and restart cleanly (progress is saved)
let draining = false;
process.on('unhandledRejection', e => console.error('unhandledRejection (ignored):', e && e.message ? e.message : e));
process.on('uncaughtException', e => console.error('uncaughtException (ignored):', e && e.message ? e.message : e));
const withTimeout = (p, ms, msg) => { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(tm)); };
const SITE_TIMEOUT = parseInt(process.env.SITE_TIMEOUT_MS || '120000');
const TOKEN = process.env.AUTH_TOKEN || '';
const PORT = parseInt(process.env.PORT || '3000');
const OUT = path.join(DATA, TEST ? 'test_results.jsonl' : 'results.jsonl');
fs.mkdirSync(DATA, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let TARGETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'targets.json'), 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => { try { const r = JSON.parse(l); return String(r.status || '').startsWith('error') ? null : r.id; } catch (e) { return null; } }) : []);   // crashed/timed-out sites (status error:*) are retried after a restart
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
  await sleep(SETTLE);
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
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {}); await sleep(SCROLL);
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
  browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--blink-settings=imagesEnabled=false', '--js-flags=--max-old-space-size=384'] });   // images off at browser level: no per-request objects in Node
  return browser;
}
async function newCtx() {
  const b = await getBrowser();
  const ctx = await b.newContext({ locale: 'el-GR', viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  // NOTE: no ctx.route() interception here. Intercepting every request made Playwright keep one Route/Request object per request in
  // Node memory for as long as the page lived, which grew the heap ~5 MB per site and crashed the worker (heap out of memory).
  return ctx;
}
async function worker(wid) {
  let ctx = null, page = null, n = 0;
  while (queue.length && !draining) {
    const t = queue.shift(); if (!t) break;
    try {
      if (!ctx || n % RECYCLE === 0) { if (ctx) await ctx.close().catch(() => {}); ctx = await newCtx(); }
      page = await ctx.newPage();                                   // a fresh page per site; closing it releases everything Playwright tracked for it
      let rec;
      try { rec = await withTimeout(processSite(page, t), SITE_TIMEOUT, 'site_timeout'); }
      finally { await page.close().catch(() => {}); page = null; }
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n'); noteRec(rec);
      stats.byStatus[rec.status] = (stats.byStatus[rec.status] || 0) + 1;
      if (rec.best) stats.byConfidence[rec.best.confidence] = (stats.byConfidence[rec.best.confidence] || 0) + 1;
    } catch (e) {
      const errRec = { id: t.id, name: t.name, site: t.site, spiti24_sales: t.spiti24_sales, status: 'error:' + (e.message || e.name).slice(0, 40), stack: process.env.DEBUG ? String(e.stack).slice(0, 500) : undefined, visited: [], best: null }; fs.appendFileSync(OUT, JSON.stringify(errRec) + '\n'); noteRec(errRec);
      stats.byStatus.error = (stats.byStatus.error || 0) + 1;
      try { if (ctx) await ctx.close().catch(() => {}); } catch (x) {} ctx = null; page = null;      // a timeout/crash: start clean
      if (!browser || !browser.isConnected()) browser = null;
    }
    n++; stats.processed++; stats.lastId = t.id;
    const heapMB = Math.round(process.memoryUsage().heapUsed / 1e6);
    if (heapMB > HEAP_GUARD_MB && !draining) { draining = true; console.error(`heap ${heapMB} MB > guard ${HEAP_GUARD_MB} MB: draining, will exit so the platform restarts it (progress is saved)`); }
    if (stats.processed % 25 === 0) console.log(`[${new Date().toISOString()}] processed ${stats.processed}/${queue.length + stats.processed} | heap ${heapMB} MB | rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`, JSON.stringify(stats.byStatus), JSON.stringify(stats.byConfidence));
    await sleep(SITE_GAP);
  }
  if (ctx) await ctx.close().catch(() => {});
}

// ---------- dashboard data (feeds dashboard.html through /status) ----------
const startMs = new Date(stats.startedAt).getTime();
const latest = new Map();          // id -> compact summary of the LAST record for that site (a retried error is replaced by its new result)
const recent = [];                 // last 15 finished sites, newest first
const newOver70List = [];          // last 10 sites that show >70 on their own site but had <=70 on Spiti24
const history = [];                // one sample every 15 s: t, done, node heap MB, rss MB
function summarize(rec) {
  const b = rec.best || null;
  return { id: rec.id, name: rec.name, spiti24: rec.spiti24_sales, status: String(rec.status || ''), n: b ? b.n : null, conf: b ? b.confidence : null, review: !!(b && b.needs_review),
    over70: !!(b && b.n > 70 && b.confidence !== 'low'), newOver70: !!(b && b.n > 70 && b.confidence !== 'low' && rec.spiti24_sales <= 70), at: Date.now() };
}
function noteRec(rec, seed) {
  const s = summarize(rec); latest.set(String(rec.id), s);
  if (seed) return;
  recent.unshift(s); if (recent.length > 15) recent.pop();
  if (s.newOver70) { newOver70List.unshift(s); if (newOver70List.length > 10) newOver70List.pop(); }
}
(function seedFromFile() {                                       // after a restart the dashboard starts from what is already on disk
  if (!fs.existsSync(OUT)) return;
  const seq = [];
  for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); noteRec(r, true); seq.push(latest.get(String(r.id))); } catch (e) {} }
  seq.slice(-15).reverse().forEach(s => recent.push({ ...s, at: null }));
  [...latest.values()].filter(s => s.newOver70).slice(-10).reverse().forEach(s => newOver70List.push({ ...s, at: null }));
})();
function doneCount() { let c = 0; for (const s of latest.values()) if (!s.status.startsWith('error')) c++; return c; }
function sample() { const m = process.memoryUsage(); history.push({ t: Date.now(), d: doneCount(), h: Math.round(m.heapUsed / 1e6), r: Math.round(m.rss / 1e6) }); if (history.length > 1500) history.shift(); }
sample(); setInterval(sample, 15000).unref();
function dash() {
  const agg = { status: {}, conf: {}, review: 0, over70: 0, newOver70: 0 };
  for (const s of latest.values()) {
    const k = s.status.startsWith('error') ? 'error' : s.status; agg.status[k] = (agg.status[k] || 0) + 1;
    if (s.conf) agg.conf[s.conf] = (agg.conf[s.conf] || 0) + 1;
    if (s.review) agg.review++; if (s.over70) agg.over70++; if (s.newOver70) agg.newOver70++;
  }
  const done = doneCount(), total = TARGETS.length, remaining = Math.max(0, total - done), now = Date.now();
  let rate = null;                                                // speed of the last ~5 minutes; falls back to this run's average
  const ref = history.find(h => now - h.t <= 5 * 60000 + 20000);
  if (ref && history.length > 2 && (now - ref.t) > 30000) rate = (done - ref.d) / ((now - ref.t) / 60000);
  if (!(rate > 0) && stats.processed >= 10) rate = stats.processed / ((now - startMs) / 60000);
  const etaSeconds = rate > 0 && stats.running ? Math.round(remaining / rate * 60) : null;
  return { done, total, remaining, percent: +(100 * done / total).toFixed(2), sitesPerMinute: rate > 0 ? +rate.toFixed(2) : null, etaSeconds,
    etaHours: etaSeconds != null ? +(etaSeconds / 3600).toFixed(2) : null, finishAtMs: etaSeconds != null ? now + etaSeconds * 1000 : null,
    finished: !stats.running, agg, recent, newOver70List, history: history.slice(-240), serverTime: now, startedAtMs: startMs };
}

// live estimate from the speed of THIS run so far (not meaningful until ~20 sites are done)
function eta() {
  const mins = (Date.now() - new Date(stats.startedAt).getTime()) / 60000;
  if (stats.processed < 20 || mins <= 0) return { sitesPerMinute: null, etaHours: null };
  const rate = stats.processed / mins;
  return { sitesPerMinute: +rate.toFixed(2), etaHours: +(queue.length / rate / 60).toFixed(2) };
}

// ---------- tiny HTTP server ----------
let DASHBOARD_HTML = '<h1>dashboard.html missing</h1>';
try { DASHBOARD_HTML = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8'); } catch (e) { console.error('dashboard.html not found:', e.message); }
function startServer() {
  const ok = req => { if (!TOKEN) return false; const u = new URL(req.url, 'http://x'); return u.searchParams.get('token') === TOKEN || (req.headers.authorization || '') === 'Bearer ' + TOKEN; };
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
    if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (u.pathname === '/' || u.pathname === '/dashboard') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(DASHBOARD_HTML); }   // the page holds no data; it fetches /status with the token
    if (!ok(req)) { res.writeHead(TOKEN ? 401 : 503); return res.end(TOKEN ? 'unauthorized' : 'set AUTH_TOKEN to enable /status and /results.jsonl'); }
    if (u.pathname === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...stats, remaining: queue.length, ...eta(), memoryMB: Math.round(process.memoryUsage().rss / 1e6), heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), draining, settings: { WORKERS, GAP, SITE_GAP, SETTLE, SCROLL }, ...dash() }, null, 1)); }
    if (u.pathname === '/results.jsonl') { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); return fs.existsSync(OUT) ? fs.createReadStream(OUT).pipe(res) : res.end(''); }
    res.writeHead(404); res.end('not found');
  }).listen(PORT, () => console.log('http on', PORT, TOKEN ? '(token set)' : '(NO AUTH_TOKEN: only /health is served)'));
}

(async () => {
  console.log(`targets ${TARGETS.length} | already done ${done.size} | queued ${queue.length} | workers ${WORKERS} | data dir ${DATA}`);
  if (!TEST) startServer();
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => sleep(i * 4000).then(() => worker(i))));
  if (draining && queue.length) { if (browser) await browser.close().catch(() => {}); process.exit(3); }      // memory guard tripped: exit non-zero => restart policy relaunches and resumes
  stats.running = false; stats.finishedAt = new Date().toISOString();
  if (!TEST) fs.writeFileSync(path.join(DATA, 'DONE'), stats.finishedAt);
  console.log('FINISHED', JSON.stringify(stats));
  if (browser) await browser.close().catch(() => {});
  if (TEST) process.exit(0);                       // in production keep serving /status and /results.jsonl
})();
