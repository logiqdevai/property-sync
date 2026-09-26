// Server side of the Spiti24 "browser collector".
// spiti24.gr blocks server IPs (Imperva), so the pages are fetched by a small script running in the OPERATOR'S OWN Chrome tab on spiti24.gr
// (their IP, their solved captcha). The app owns the queue and the data; the script asks for work, fetches, parses and sends results back.
// Resumable: the queue position lives in state.run (persisted); a lease stops two tabs from taking the same task.
//
//   run.phase: index -> areas -> sale -> done
//   index : one request for /mesitika-grafeia, returns the ~62 area links
//   areas : every area page (?page=N) -> agencies (id, name, profile, location, phones, website)
//   sale  : every agency profile with ?listingType=sale -> sale-listing count + 3 sample photos
const LEASE_MS = 5 * 60 * 1000;

class Collector {
  constructor(store) { this.store = store; this.leases = new Map(); this.samples = []; this.lastSeen = 0; this.lastIp = null; }
  get run() { return this.store.state.run || null; }
  _save() { this.store.markDirty('state'); }
  _units(run) { return (run.areaPagesDone || 0) + (run.saleDone || 0); }

  start(opts = {}) {
    const mode = opts.mode === 'all' ? 'all' : 'new';
    const run = {
      id: Date.now().toString(36), mode, wantAgents: opts.agents !== false, wantSale: opts.sale !== false, startedAt: new Date().toISOString(), finishedAt: null,
      phase: 'index', areas: [], areaPagesDone: 0, salePending: [], saleTotal: 0, saleDone: 0, newIds: [], newAgents: 0, updatedAgents: 0, blocks: 0, failures: 0, lastBlock: null,
      limitAreas: opts.limitAreas || null, limitSale: opts.limitSale || null, onlyAreas: Array.isArray(opts.onlyAreas) && opts.onlyAreas.length ? opts.onlyAreas : null,          // test options (small dry runs)
    };
    this.store.state.run = run; this.leases.clear(); this.samples = [];
    if (!run.wantAgents) this._beginSale(run);
    this._save(); return this.status();
  }
  stop() { const r = this.run; if (r && r.phase !== 'done') { r.phase = 'done'; r.finishedAt = new Date().toISOString(); r.stopped = true; this._save(); } return this.status(); }

  _beginSale(run) {
    if (!run.wantSale) return this._finish(run);
    let ids = this.store.agents.map(a => String(a.id));
    if (run.mode === 'new') { const fresh = new Set(run.newIds); ids = ids.filter(id => !this.store.sale[id] || fresh.has(id)); }
    if (run.limitSale) ids = ids.slice(0, run.limitSale);
    run.salePending = ids; run.saleTotal = ids.length; run.saleDone = 0; run.phase = ids.length ? 'sale' : 'done';
    if (!ids.length) run.finishedAt = new Date().toISOString();
  }
  _finish(run) { run.phase = 'done'; run.finishedAt = new Date().toISOString(); }

  _leased(key) { const t = this.leases.get(key); if (!t) return false; if (t < Date.now()) { this.leases.delete(key); return false; } return true; }
  _lease(key) { this.leases.set(key, Date.now() + LEASE_MS); }

  next(n = 1, ip) {
    this.lastSeen = Date.now(); if (ip) this.lastIp = ip;
    const run = this.run;
    if (!run || run.phase === 'done') return { done: true, tasks: [] };
    const tasks = [];
    if (run.phase === 'index') { if (!this._leased('index')) { tasks.push({ t: 'index' }); this._lease('index'); } }
    else if (run.phase === 'areas') {
      for (const a of run.areas) {
        if (a.done) continue; const key = `a:${a.url}:${a.next}`;
        if (this._leased(key)) continue;
        tasks.push({ t: 'area', url: a.url, name: a.name, page: a.next }); this._lease(key); if (tasks.length >= n) break;
      }
    } else if (run.phase === 'sale') {
      for (const id of run.salePending) {
        if (this._leased('s:' + id)) continue;
        const ag = this.store.agentById.get(id); if (!ag) continue;
        tasks.push({ t: 'sale', id, profile: ag.profile }); this._lease('s:' + id); if (tasks.length >= n) break;
      }
    }
    return { done: false, phase: run.phase, tasks };
  }

  result(items) {
    this.lastSeen = Date.now(); const run = this.run; if (!run) return { ok: false, error: 'no active run' };
    for (const r of items || []) {
      if (r.failed && (r.t === 'index' || r.t === 'area')) {                 // a failed fetch is NOT an empty result: release the lease so it is retried
        run.failures++; this.leases.delete(r.t === 'index' ? 'index' : `a:${r.url}:${r.page}`); continue;
      }
      if (r.t === 'index') {
        let areas = (r.areas || []).filter(a => a && a.url && a.name);
        if (run.onlyAreas) areas = areas.filter(a => run.onlyAreas.some(slug => a.url.replace(/\/$/, '').endsWith('/' + slug)));
        if (run.limitAreas) areas = areas.slice(0, run.limitAreas);
        run.areas = areas.map(a => ({ name: a.name, url: a.url, lastPage: null, next: 1, done: false })); run.phase = run.areas.length ? 'areas' : 'done'; this.leases.delete('index');
      } else if (r.t === 'area') {
        const a = run.areas.find(x => x.url === r.url); if (!a) continue;
        this.leases.delete(`a:${a.url}:${r.page}`);
        for (const ag of r.agents || []) {
          const res = this.store.upsertAgent({ ...ag, area: a.name, areaUrl: a.url });
          if (res === 'new') { run.newAgents++; run.newIds.push(String(ag.id)); } else if (res === 'updated') run.updatedAgents++;
        }
        a.lastPage = Math.max(a.lastPage || 1, r.lastPage || 1); a.next = Math.max(a.next, r.page + 1); run.areaPagesDone++;
        if (!(r.agents || []).length || r.page >= a.lastPage) a.done = true;
        if (run.areas.every(x => x.done)) { if (run.wantSale) this._beginSale(run); else this._finish(run); }
      } else if (r.t === 'sale') {
        this.leases.delete('s:' + r.id);
        if (r.failed) {                                                                       // page did not look like an agency profile: retry, give up after 3 tries
          run.failures++; run.failCount = run.failCount || {}; const c = run.failCount[r.id] = (run.failCount[r.id] || 0) + 1;
          if (c < 3) continue;
          this.store.setSale(r.id, { n: 0, imgs: [], failed: true });
          const j = run.salePending.indexOf(String(r.id)); if (j >= 0) run.salePending.splice(j, 1);
          run.saleDone++; if (!run.salePending.length) this._finish(run); continue;
        }
        this.store.setSale(r.id, r.gone ? { n: 0, imgs: [], gone: true } : { n: r.n, imgs: r.imgs || [] });
        const i = run.salePending.indexOf(String(r.id)); if (i >= 0) run.salePending.splice(i, 1);
        run.saleDone++; if (!run.salePending.length) this._finish(run);
      }
    }
    this.samples.push({ t: Date.now(), u: this._units(run) }); if (this.samples.length > 400) this.samples.shift();
    this._save(); return { ok: true, phase: run.phase };
  }

  event(e) {
    this.lastSeen = Date.now(); const run = this.run; if (!run) return { ok: false };
    if (e.kind === 'block') { run.blocks++; run.lastBlock = { at: new Date().toISOString(), status: e.status || null, what: e.what || null, notified: !!e.notified }; }
    else if (e.kind === 'start' || e.kind === 'resume') run.lastBlock = null;
    this.store.state.collectorEvent = { kind: e.kind, at: new Date().toISOString() }; this._save(); return { ok: true };
  }

  status() {
    const run = this.run; const now = Date.now();
    const seenAgo = this.lastSeen ? Math.round((now - this.lastSeen) / 1000) : null;
    if (!run) return { active: false, hasRun: false, agentsTotal: this.store.agents.length, saleTotal: Object.keys(this.store.sale).length, seenAgoSeconds: seenAgo };
    const areasTotal = run.areas.length, areasDone = run.areas.filter(a => a.done).length;
    let estAreaPages = 0, doneAreaPages = run.areaPagesDone || 0;
    for (const a of run.areas) estAreaPages += a.lastPage ? a.lastPage : 1;
    const remainingUnits = run.phase === 'done' ? 0 : (run.phase === 'index' ? 1 : Math.max(0, estAreaPages - doneAreaPages)) + (run.phase === 'sale' ? run.salePending.length : (run.wantSale ? (run.mode === 'all' ? this.store.agents.length : 0) : 0));
    let rate = null; const w = this.samples.filter(s => now - s.t <= 5 * 60000);
    if (w.length >= 2 && w[w.length - 1].t - w[0].t > 20000) rate = (w[w.length - 1].u - w[0].u) / ((w[w.length - 1].t - w[0].t) / 60000);
    const etaSeconds = rate > 0 && run.phase !== 'done' ? Math.round(remainingUnits / rate * 60) : null;
    return {
      active: run.phase !== 'done', hasRun: true, runId: run.id, mode: run.mode, phase: run.phase, startedAt: run.startedAt, finishedAt: run.finishedAt, stopped: !!run.stopped,
      areas: { total: areasTotal, done: areasDone, pagesDone: doneAreaPages, pagesKnown: estAreaPages },
      agentsTotal: this.store.agents.length, newAgents: run.newAgents, updatedAgents: run.updatedAgents,
      sale: { total: run.saleTotal, done: run.saleDone, remaining: run.salePending.length }, blocks: run.blocks, failures: run.failures, lastBlock: run.lastBlock,
      seenAgoSeconds: seenAgo, collectorOnline: seenAgo != null && seenAgo < 90, unitsPerMinute: rate ? +rate.toFixed(2) : null, etaSeconds, saleTotalStored: Object.keys(this.store.sale).length,
    };
  }
}
module.exports = { Collector };
