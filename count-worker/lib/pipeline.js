// Pipeline controller: runs the stages that can run on a server and reports their progress to the dashboard.
//   collect   Spiti24 agency list + sale counts  -> the operator's browser (lib/collector.js), not started from here
//   dns       which agency websites still exist (Node)
//   scan      each agency's website: contact pages + emails, honours robots.txt   (Python: excel/find_emails.py)
//   wayback   archived copies of the sites that block automated visits            (Python: excel/wayback_emails.py)
//   own       the "for sale" count on each agency's OWN website                   (Playwright, worker.js)
//   watermark photo check: FREE local model (ONNX + classifier trained on the manual verdicts) when excel/wm.onnx exists, otherwise an AI vision model when ANTHROPIC_API_KEY is set (Python: excel/watermark.py)
//   excel     the client workbook, built on demand (worker.js /spiti24-agencies.xlsx)
// Every stage is resumable: results are merged into the store as they arrive and the scripts skip what is already done.
const fs = require('fs'), path = require('path'), dns = require('dns').promises, { spawn } = require('child_process');

const CHAIN = ['dns', 'scan', 'wayback', 'own', 'watermark'];       // "Run all" order (the collector needs the operator, so it is not part of it)
const SOCIAL = /(^|\.)(facebook|fb|instagram|linktr|twitter|x|linkedin|youtube|tiktok)\.(com|ee)$/i;

function normUrl(u) {                                                // same clean-ups the Excel builder applies
  u = String(u || '').trim(); if (!u) return '';
  u = u.replace(/^https?:\/\/(?=https?:\/)/i, '').replace(/^(https?):\/+/i, '$1://').replace(/[.,;]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}
function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }

class Pipeline {
  constructor({ store, collector, dataDir, excelDir, own, python }) {
    this.store = store; this.collector = collector; this.own = own; this.python = python; this.excelDir = excelDir; this.dataDir = dataDir;
    this.work = path.join(dataDir, 'work'); fs.mkdirSync(this.work, { recursive: true });
    this.procs = {}; this.timers = {}; this.stop_ = {};
    store.state.stages = store.state.stages || {};
    for (const [n, st] of Object.entries(store.state.stages)) if (st.status === 'running') { st.status = 'interrupted'; st.note = 'The app was restarted while this step was running. Press Start to continue where it stopped.'; }
    if (store.state.chain && store.state.chain.active) store.state.chain.pending = true;         // resume the chain after a restart
    setInterval(() => this._scratchTick(), 5000).unref();                                         // "start from scratch": run the server stages once the Spiti24 collection is finished
    store.markDirty('state');
  }
  _st(name) { return (this.store.state.stages[name] = this.store.state.stages[name] || { status: 'idle' }); }
  _save() { this.store.markDirty('state'); }
  get keyPresent() { return !!(process.env.ANTHROPIC_API_KEY || '').trim(); }
  get wmEngine() {                                                    // 'local' (free, needs wm.onnx + wm_model.json) | 'ai' (needs the API key) | null
    const want = (process.env.WM_ENGINE || '').toLowerCase();
    const local = fs.existsSync(process.env.WM_ONNX || path.join(this.excelDir, 'wm.onnx')) && fs.existsSync(process.env.WM_MODEL_JSON || path.join(this.excelDir, 'wm_model.json'));
    if (want === 'ai') return this.keyPresent ? 'ai' : null;
    if (want === 'local') return local ? 'local' : null;
    return local ? 'local' : this.keyPresent ? 'ai' : null;
  }

  // ---------------- inputs ----------------
  siteOf(a) {                                                        // normalised website with the www-fix, or '' when there is none / it is dead
    const u = normUrl(a.website); if (!u) return '';
    const h = hostOf(u); if (!h) return '';
    if (new Set((this.store.deadLinks.dead || []).map(x => x.toLowerCase())).has(h)) return '';
    const fix = (this.store.deadLinks.www_fixable || []).find(p => p[0].toLowerCase() === h);
    return fix ? u.replace(new RegExp('//' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '//' + fix[1]) : u;
  }
  scanTargets(refresh) {
    return this.store.agents.map(a => ({ id: String(a.id), site: this.siteOf(a) })).filter(t => t.site && (refresh || !this.store.emails.has(t.id)));
  }
  waybackTargets() {
    return this.store.agents.map(a => ({ a, rec: this.store.emails.get(String(a.id)) })).filter(x => x.rec && ['blocked', 'robots'].includes(x.rec.status) && !(x.rec.emails || []).length && !x.rec.wayback_status)
      .map(x => ({ id: String(x.a.id), site: x.rec.site || this.siteOf(x.a), name: x.a.name }));
  }
  watermarkTargets() {
    return Object.entries(this.store.sale).filter(([id, s]) => s && s.n >= 1 && (s.imgs || []).length && !this.store.decisions.has(id)).map(([id, s]) => ({ id, imgs: s.imgs.slice(0, 3) }));
  }

  // ---------------- control ----------------
  start(name, opts = {}) {
    if (this.procs[name] || (name === 'dns' && this.timers.dns) || (name === 'own' && this.own.status().running)) return { ok: false, error: 'This step is already running.' };
    const st = this._st(name); this.stop_[name] = false;
    switch (name) {
      case 'dns': return this._dns(st);
      case 'scan': return this._py(st, 'scan', 'find_emails.py', this.scanTargets(!!opts.refresh), { SCAN_IN: 'scan_in.json', SCAN_OUT: 'scan_out.jsonl' }, rec => this._mergeScan(rec), 'sites scanned', opts);
      case 'wayback': return this._py(st, 'wayback', 'wayback_emails.py', this.waybackTargets(), { WB_IN: 'wb_in.json', WB_OUT: 'wb_out.jsonl' }, rec => this._mergeWayback(rec), 'sites checked in the web archive', opts);
      case 'watermark': {
        if (!this.wmEngine && !(opts.dry && this.wmEngine !== 'local')) { st.status = 'waiting'; st.note = 'The free photo-check model is not installed in this version of the app, so this step cannot run. Agencies that already have a result keep it; new ones show "?" in the Excel.'; this._save(); return { ok: false, error: st.note }; }
        return this._py(st, 'watermark', 'watermark.py', this.watermarkTargets(), { WM_IN: 'wm_in.json', WM_OUT: 'wm_out.jsonl', ...(opts.dry ? { WM_DRY: '1' } : {}) }, rec => { if (['Y', 'P', 'N'].includes(rec.v)) this.store.setDecision(rec.id, rec.v); }, 'agencies judged', opts);
      }
      case 'own': return this.own.start(opts);
      default: return { ok: false, error: 'Unknown step.' };
    }
  }
  stop(name) {
    this.stop_[name] = true;
    if (this.procs[name]) { try { this.procs[name].kill('SIGTERM'); } catch (e) {} }
    else if (name === 'own') this.own.stop();
    else if (name === 'dns') { /* checked between lookups */ }
    const st = this._st(name); if (st.status === 'running') { st.status = 'stopped'; st.note = 'Paused by you. Press Start to continue where it stopped.'; this._save(); }
    if (this.store.state.chain) { this.store.state.chain.active = false; this._save(); }
    return { ok: true };
  }
  runAll() { this.store.state.chain = { active: true, index: 0, startedAt: new Date().toISOString() }; this._save(); this._advance(); return { ok: true }; }
  _advance() {                                                       // start the next stage of the chain; called again whenever a stage finishes
    const ch = this.store.state.chain; if (!ch || !ch.active) return;
    while (ch.index < CHAIN.length) {
      const name = CHAIN[ch.index];
      if (name === 'watermark' && !this.wmEngine) { this._st(name).status = 'waiting'; this._st(name).note = 'Skipped: the free photo-check model is not installed in this version of the app.'; ch.index++; continue; }
      const r = this.start(name);
      if (r.ok === false && !/already running/.test(r.error || '')) { ch.index++; continue; }          // nothing to do / cannot start: move on
      this._save(); return;
    }
    ch.active = false; ch.finishedAt = new Date().toISOString();
    const sc = this.store.state.scratch; if (sc && sc.active && sc.phase === 'server') { sc.active = false; sc.phase = 'finished'; sc.finishedAt = ch.finishedAt; }
    this._save();
  }

  // ---------------- start everything from scratch ----------------
  // 1) copy all data to $DATA/backups/<time>  2) erase it  3) start the Spiti24 collection (needs the operator's Chrome tab)
  // 4) when the collection has finished, _scratchTick() runs every server stage (dns, scan, wayback, own-site counts, watermark) - all on empty data, so nothing is skipped.
  scratch(opts = {}) {
    if (!opts.confirm) return { ok: false, error: 'Please confirm to continue.' };
    const running = Object.keys(this.procs).concat(this.timers.dns ? ['dns'] : []);
    if (running.length || this.own.status().running) return { ok: false, error: 'Something is still running (' + running.concat(this.own.status().running ? ['own'] : []).map(k => ({ dns: 'website check', scan: 'websites & emails', wayback: 'web archive', own: 'own-website counts', watermark: 'watermark check', collect: 'Spiti24 collection' })[k] || k).join(', ') + '). Press Stop on it first, then try again.' };
    const cr = this.collector.run; if (cr && cr.phase !== 'done' && this.collector.lastSeen && Date.now() - this.collector.lastSeen < 120000) return { ok: false, error: 'The Spiti24 Chrome tab is still working. Press Stop in step 1 first, then try again.' };
    this.store.flush();
    const ts = new Date().toISOString().replace(/[:.]/g, '-'), bdir = path.join(this.dataDir, 'backups', ts);
    fs.mkdirSync(path.join(bdir, 'work'), { recursive: true });
    const cp = (from, to) => { try { if (fs.existsSync(from)) fs.copyFileSync(from, to); } catch (e) { console.error('backup copy failed', from, e.message); } };
    for (const f of fs.readdirSync(this.store.dir)) if (!f.endsWith('.tmp')) cp(path.join(this.store.dir, f), path.join(bdir, f));
    cp(this.store.statePath, path.join(bdir, 'state.json'));
    for (const f of fs.readdirSync(this.work)) { const src = path.join(this.work, f); if (fs.statSync(src).isFile()) { cp(src, path.join(bdir, 'work', f)); try { fs.unlinkSync(src); } catch (e) {} } }   // stage output files would otherwise "resume" the old results
    this.own.reset(bdir);
    this.store.reset();
    const keep = fs.readdirSync(path.join(this.dataDir, 'backups')).sort(); for (const old of keep.slice(0, Math.max(0, keep.length - 3))) fs.rmSync(path.join(this.dataDir, 'backups', old), { recursive: true, force: true });   // keep the 3 newest
    this.store.state.stages = {}; this.store.state.chain = null;
    const startedAt = new Date().toISOString();
    this.store.state.scratch = { active: true, phase: 'collect', startedAt, backup: ts };
    this.collector.start({ mode: 'all' });
    this.store.flush(); return { ok: true, backup: ts };
  }
  _scratchTick() {
    const sc = this.store.state.scratch; if (!sc || !sc.active || sc.phase !== 'collect') return;
    const r = this.collector.run;
    if (r && r.phase === 'done' && !r.stopped && String(r.startedAt) >= String(sc.startedAt)) { sc.phase = 'server'; sc.serverStartedAt = new Date().toISOString(); this._save(); this.runAll(); }
  }
  onStageEnd(name) {
    const ch = this.store.state.chain;
    if (ch && ch.active && CHAIN[ch.index] === name) { if (this.stop_[name] || this._st(name).status === 'error') { ch.active = false; this._save(); return; } ch.index++; this._advance(); }
  }
  resumeChainIfNeeded() { const ch = this.store.state.chain; if (ch && ch.active && ch.pending) { delete ch.pending; setTimeout(() => this._advance(), 3000); } }

  // ---------------- Node stage: DNS ----------------
  _dns(st) {
    const hosts = new Map();                                         // normalised host -> [agency ids]
    for (const a of this.store.agents) { const u = normUrl(a.website), h = hostOf(u); if (h && !SOCIAL.test(h)) hosts.set(h, 1); }
    const list = [...hosts.keys()];
    Object.assign(st, { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, total: list.length, done: 0, startDone: 0, error: null, note: 'Checking which websites still exist…' });
    this.timers.dns = true; this._save();
    const dead = [], fixable = []; let i = 0;
    // a failed lookup (not found, server failure, timeout) counts as "gone" only after 3 tries AND when a control lookup proves our own DNS/internet works
    const lookup = h => Promise.race([dns.lookup(h), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]).then(() => true, () => false);
    const online = async () => { for (let t = 0; t < 3; t++) { if ((await lookup('www.google.com')) || (await lookup('www.cloudflare.com'))) return true; await new Promise(r => setTimeout(r, 2000)); } return false; };
    const unknown = [];
    const one = async h => {
      let ok = false; for (let t = 0; t < 3 && !ok; t++) ok = await lookup(h);
      if (ok) return;
      if (!(await online())) { unknown.push(h); return; }
      const alt = h.startsWith('www.') ? h.slice(4) : 'www.' + h; let okAlt = false; for (let t = 0; t < 2 && !okAlt; t++) okAlt = await lookup(alt);
      if (okAlt) fixable.push([h, alt]); else dead.push(h);
    };
    const runner = async () => { while (i < list.length && !this.stop_.dns) { const h = list[i++]; try { await one(h); } catch (e) {} st.done++; if (st.done % 50 === 0) this._save(); } };
    Promise.all(Array.from({ length: 30 }, runner)).then(() => {
      this.timers.dns = false;
      if (!this.stop_.dns) { this.store.deadLinks = { dead, www_fixable: fixable }; this.store.markDirty('deadLinks'); st.status = 'done'; st.note = `${dead.length} websites no longer exist (they are marked in the Excel); ${fixable.length} only open with or without "www." (the link is fixed automatically)` + (unknown.length ? `; ${unknown.length} could not be checked because the internet connection was down – run this step again later` : ''); }
      st.finishedAt = new Date().toISOString(); this._save(); this.onStageEnd('dns');
    });
    return { ok: true };
  }

  // ---------------- Python stages ----------------
  _py(st, name, script, targets, files, mergeFn, unit, opts) {
    if (opts && opts.limit) targets = targets.slice(0, opts.limit);                            // test option: only the first N
    if (!targets.length) { Object.assign(st, { status: 'done', total: 0, done: 0, finishedAt: new Date().toISOString(), note: 'Nothing to do – everything is already done.' }); this._save(); return { ok: false, error: 'Nothing to do – everything is already done.' }; }
    const inFile = path.join(this.work, files[Object.keys(files)[0]]), outFile = path.join(this.work, files[Object.keys(files)[1]]);
    fs.writeFileSync(inFile, JSON.stringify(targets));
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }; for (const k of Object.keys(files)) env[k] = path.join(this.work, files[k]);
    if (name === 'watermark') { env.WM_SHEETS = path.join(this.work, 'wm_sheets'); if (this.wmEngine) env.WM_ENGINE = this.wmEngine; }
    if (opts.refresh && fs.existsSync(outFile)) fs.unlinkSync(outFile);                         // refresh: forget the old output so every site is scanned again
    let already = 0; if (fs.existsSync(outFile)) already = fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).length;
    Object.assign(st, { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, total: targets.length + already, done: already, startDone: already, error: null, note: unit, dry: !!opts.dry });
    const child = spawn(this.python, [path.join(this.excelDir, script)], { env, cwd: this.excelDir }); this.procs[name] = child; let offset = 0, tail = '';
    const merge = () => {                                            // merge the lines the script wrote since last time
      if (!fs.existsSync(outFile)) return; const buf = fs.readFileSync(outFile); const chunk = buf.subarray(offset).toString('utf8'); const lastNl = chunk.lastIndexOf('\n'); if (lastNl < 0) return;
      offset += Buffer.byteLength(chunk.slice(0, lastNl + 1), 'utf8');
      for (const l of chunk.slice(0, lastNl).split('\n')) { if (!l.trim()) continue; try { mergeFn(JSON.parse(l)); st.done++; } catch (e) {} }
    };
    // a resumed run must also merge what earlier runs wrote but the store does not have yet (cheap and idempotent)
    if (already) { for (const l of fs.readFileSync(outFile, 'utf8').split('\n')) { if (!l.trim()) continue; try { mergeFn(JSON.parse(l)); } catch (e) {} } offset = fs.statSync(outFile).size; }
    this.timers[name] = setInterval(() => { merge(); this._save(); }, 4000);
    child.stderr.on('data', d => { tail = (tail + d.toString()).slice(-800); });
    child.stdout.on('data', () => {});
    child.on('exit', code => {
      clearInterval(this.timers[name]); delete this.timers[name]; merge(); delete this.procs[name];
      if (this.stop_[name]) { st.status = 'stopped'; }
      else if (code === 0) { st.status = 'done'; st.note = unit; }
      else { st.status = 'error'; st.error = tail.trim() || ('exit code ' + code); st.note = st.error; }
      st.finishedAt = new Date().toISOString(); this.store.flush(); this._save(); this.onStageEnd(name);
    });
    child.on('error', e => { st.status = 'error'; st.error = String(e.message); delete this.procs[name]; clearInterval(this.timers[name]); this._save(); this.onStageEnd(name); });
    return { ok: true };
  }
  _mergeScan(rec) { const robots = rec.robots_txt; delete rec.robots_txt; this.store.setEmails(rec); this.store.setRobots(rec.id, robots); }
  _mergeWayback(w) {
    const r = this.store.emails.get(String(w.id)); if (!r) return;
    if ((r.emails || []).length) return;
    if ((w.emails || []).length) { r.emails = w.emails; r.other = (r.other || []).concat(w.other || []); r.fetched_with = 'wayback'; }
    else r.wayback_status = w.status;
    this.store.markDirty('emails');
  }

  // ---------------- status ----------------
  status() {
    const stages = {}, s = this.store.state.stages;
    for (const n of ['dns', 'scan', 'wayback', 'watermark']) { const st = s[n] || { status: 'idle' }; stages[n] = { ...st }; }
    stages.watermark.keyPresent = this.keyPresent; stages.watermark.engine = this.wmEngine;
    stages.dns.pending = this.store.agents.filter(a => normUrl(a.website)).length;
    stages.scan.pending = this.scanTargets(false).length; stages.wayback.pending = this.waybackTargets().length; stages.watermark.pending = this.watermarkTargets().length;
    const now = Date.now();
    for (const n of ['dns', 'scan', 'wayback', 'watermark']) {                                    // rate + ETA from the time the stage started
      const st = stages[n]; if (st.status === 'running' && st.startedAt) { const el = (now - new Date(st.startedAt).getTime()) / 60000; const base = st.total ? Math.max(0, st.done - (st.startDone || 0)) : 0; if (el > 0.3 && base > 0) { st.perMinute = +(base / el).toFixed(1); st.etaSeconds = Math.round(Math.max(0, st.total - st.done) / (base / el) * 60); } }
    }
    return { stages, chain: this.store.state.chain || null, scratch: this.store.state.scratch || null, keyPresent: this.keyPresent, wmEngine: this.wmEngine, counts: { agents: this.store.agents.length, sale: Object.keys(this.store.sale).length, emails: this.store.emails.size, decisions: this.store.decisions.size } };
  }
}
module.exports = { Pipeline, normUrl, hostOf };
