// Data store of the pipeline app. Everything lives as plain files in $DATA_DIR/xl - the SAME file names and formats the Excel builder
// (excel/build_xlsx.py) reads, so what the app collects online produces exactly the workbook we built by hand:
//   agents.json     [{id,name,profile,location,phones[],website,area,areaUrl}]      (spiti24.gr agency list)
//   sale_all.json   {id:{n,imgs[],gone?}}                                             (sale-listing count + 3 photos per agency)
//   decisions.txt   "id:Y id:N id:P ..."                                              (watermark verdicts)
//   emails.jsonl    one line per agency site scan {id,site,status,pages[],emails[],other[]}
//   dead_links.json {dead:[host],www_fixable:[[a,b]]}
// state.json keeps the pipeline/collector bookkeeping. On first start the files are seeded from the snapshot baked into the image (excel/).
const fs = require('fs'), path = require('path');

class Store {
  constructor(dataDir, seedDir) {
    this.dir = path.join(dataDir, 'xl'); this.seed = seedDir;
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of ['agents.json', 'sale_all.json', 'decisions.txt', 'dead_links.json', 'emails.jsonl']) {
      const dst = path.join(this.dir, f), src = path.join(seedDir, f);
      if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
    }
    this.agents = this._json('agents.json', []);
    this.agentById = new Map(this.agents.map(a => [String(a.id), a]));
    this.sale = this._json('sale_all.json', {});
    this.deadLinks = this._json('dead_links.json', { dead: [], www_fixable: [] });
    this.decisions = new Map();
    const dp = path.join(this.dir, 'decisions.txt');
    if (fs.existsSync(dp)) for (const tok of fs.readFileSync(dp, 'utf8').split(/\s+/)) { const m = /^(\d+):([YNP])$/.exec(tok); if (m) this.decisions.set(m[1], m[2]); }
    this.emails = new Map();
    const ep = path.join(this.dir, 'emails.jsonl');
    if (fs.existsSync(ep)) for (const l of fs.readFileSync(ep, 'utf8').split('\n')) { if (l.trim()) { try { const r = JSON.parse(l); this.emails.set(String(r.id), r); } catch (e) {} } }
    this.robots = this._json('robots.json', {});                       // id -> robots.txt text of the agency's site (used by the counting stage)
    this.state = this._read(path.join(dataDir, 'state.json'), {}); this.statePath = path.join(dataDir, 'state.json');
    this._dirty = new Set(); this._timer = null;
    process.on('SIGTERM', () => { this.flush(); process.exit(0); });
  }
  _read(p, dflt) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; } }
  _json(name, dflt) { return this._read(path.join(this.dir, name), dflt); }
  _atomic(p, text) { const tmp = p + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, p); }
  markDirty(what) { this._dirty.add(what); if (!this._timer) this._timer = setTimeout(() => this.flush(), 2000); }
  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    for (const w of this._dirty) {
      try {
        if (w === 'agents') this._atomic(path.join(this.dir, 'agents.json'), JSON.stringify(this.agents));
        else if (w === 'sale') this._atomic(path.join(this.dir, 'sale_all.json'), JSON.stringify(this.sale));
        else if (w === 'deadLinks') this._atomic(path.join(this.dir, 'dead_links.json'), JSON.stringify(this.deadLinks));
        else if (w === 'decisions') this._atomic(path.join(this.dir, 'decisions.txt'), [...this.decisions].map(([k, v]) => k + ':' + v).join('\n') + '\n');
        else if (w === 'emails') this._atomic(path.join(this.dir, 'emails.jsonl'), [...this.emails.values()].map(r => JSON.stringify(r)).join('\n') + '\n');
        else if (w === 'robots') this._atomic(path.join(this.dir, 'robots.json'), JSON.stringify(this.robots));
        else if (w === 'state') this._atomic(this.statePath, JSON.stringify(this.state));
      } catch (e) { console.error('store flush failed for', w, e.message); }
    }
    this._dirty.clear();
  }
  // ---- agencies ----
  upsertAgent(a) {                                               // from a spiti24 area page; keeps every other field of an existing agent
    const id = String(a.id), cur = this.agentById.get(id);
    if (cur) {
      const changed = ['name', 'profile', 'location', 'website', 'area', 'areaUrl'].some(k => a[k] != null && a[k] !== cur[k]) || JSON.stringify(a.phones || []) !== JSON.stringify(cur.phones || []);
      Object.assign(cur, { name: a.name, profile: a.profile, location: a.location, phones: a.phones || [], website: a.website || '', area: a.area || cur.area, areaUrl: a.areaUrl || cur.areaUrl });
      if (changed) this.markDirty('agents');
      return changed ? 'updated' : 'same';
    }
    const n = { id, name: a.name, profile: a.profile, location: a.location, phones: a.phones || [], website: a.website || '', area: a.area, areaUrl: a.areaUrl };
    this.agents.push(n); this.agentById.set(id, n); this.markDirty('agents'); return 'new';
  }
  setSale(id, rec) { this.sale[String(id)] = rec; this.markDirty('sale'); }
  setDecision(id, v) { this.decisions.set(String(id), v); this.markDirty('decisions'); }
  setEmails(rec) { this.emails.set(String(rec.id), rec); this.markDirty('emails'); }
  setRobots(id, txt) { if (txt) { this.robots[String(id)] = txt; this.markDirty('robots'); } }
  reset() {                                                      // erase all collected data (the caller has already made a backup)
    this.agents = []; this.agentById = new Map(); this.sale = {}; this.deadLinks = { dead: [], www_fixable: [] };
    this.decisions = new Map(); this.emails = new Map(); this.robots = {};
    for (const w of ['agents', 'sale', 'deadLinks', 'decisions', 'emails', 'robots']) this.markDirty(w);
  }
  setState(patch) { Object.assign(this.state, patch); this.markDirty('state'); }
}
module.exports = { Store };
