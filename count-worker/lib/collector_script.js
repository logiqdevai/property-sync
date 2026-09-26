// Builds the JavaScript the operator pastes into the DevTools console of a spiti24.gr tab (their own Chrome, their IP, their solved captcha).
// It asks the app for tasks, fetches spiti24.gr pages (same origin), parses them, and posts small JSON results back. It stops at the first bot check.
// The parsers here were validated against the 4,220 agencies collected earlier (24/24 records identical on a real page).
function collectorScript(appBase, token) {
  const APP = JSON.stringify(appBase), TOKEN = JSON.stringify(token);
  return `(async () => {
  const APP = ${APP}, TOKEN = ${TOKEN};
  if (location.hostname !== 'www.spiti24.gr') { alert('Open https://www.spiti24.gr/mesitika-grafeia in this tab first, then paste the script again.'); return; }
  if (window.__s24collector && window.__s24collector.running) { console.log('The collector is already running in this tab.'); return; }
  const S = window.__s24collector = { running: true, stop: false, requests: 0, done: 0 };
  // pauses are timed by a small background worker: Chrome slows the page's own timers to about one per minute when the tab is hidden
  const sleep = (() => {
    let w = null, dead = false, id = 0; const waits = new Map();
    try {
      w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'])));
      w.onmessage = e => { const f = waits.get(e.data); if (f) { waits.delete(e.data); f(); } };
      w.onerror = () => { dead = true; waits.forEach(f => f()); waits.clear(); };
    } catch (e) { dead = true; }
    return ms => (dead || !w) ? new Promise(r => setTimeout(r, ms)) : new Promise(r => { const i = ++id; waits.set(i, r); w.postMessage({ id: i, ms }); });
  })();
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  const BLOCK = /Pardon Our Interruption|hcaptcha/i;

  // ---- small status box (bottom right) ----
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f1730;color:#e9edfa;font:13px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);min-width:260px;max-width:340px';
  box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Spiti24 collector</div><div id="s24msg">starting…</div><div style="margin-top:8px"><button id="s24stop" style="background:#f87171;border:0;color:#fff;padding:5px 12px;border-radius:8px;cursor:pointer;font-weight:700">Stop</button></div>';
  document.body.appendChild(box);
  const say = (t, color) => { const m = document.getElementById('s24msg'); if (m) { m.textContent = t; m.style.color = color || '#e9edfa'; } };
  document.getElementById('s24stop').onclick = () => { S.stop = true; say('stopping after the current request…'); };

  // ---- talk to the app ----
  const api = async (path, body) => {
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(APP + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
        if (r.status === 401) throw new Error('unauthorized: wrong token');
        return await r.json();
      } catch (e) { if (String(e.message).startsWith('unauthorized')) throw e; say("can't reach the app, retrying… (" + (i + 1) + '/6)', '#fbbf24'); await sleep(10000); }
    }
    throw new Error('app unreachable');
  };
  const beat = setInterval(() => { if (S.running) api('/collector/ping').catch(() => {}); }, 30000);

  // ---- fetch + parse spiti24.gr ----
  const get = async url => { const r = await fetch(url, { credentials: 'include' }); const t = await r.text(); return { status: r.status, text: t, blocked: BLOCK.test(t) || [403, 405, 429].includes(r.status) }; };
  const abs = h => new URL(h, location.href).href;
  const doIndex = async () => {
    const g = await get('/mesitika-grafeia'); if (g.blocked) return { blocked: g.status };
    const doc = new DOMParser().parseFromString(g.text, 'text/html'), seen = new Set(), areas = [];
    doc.querySelectorAll('a[href*="/mesitika-grafeia/"]').forEach(a => {
      const u = abs(a.getAttribute('href')); if (u.includes('?') || u.includes('#')) return;
      if (!/\\/mesitika-grafeia\\/[^\\/]+\\/?$/.test(new URL(u).pathname) || seen.has(u)) return; seen.add(u);
      areas.push({ name: (a.textContent || '').trim(), url: u });
    });
    return { t: 'index', areas };
  };
  const doArea = async task => {
    const g = await get(task.url + (task.page > 1 ? '?page=' + task.page : '')); if (g.blocked) return { blocked: g.status };
    const doc = new DOMParser().parseFromString(g.text, 'text/html'), agents = [];
    doc.querySelectorAll('.broker-listing').forEach(c => {
      const m = /^li-(\\d+)$/.exec(c.id || ''); if (!m) return; const a = c.querySelector('h3.agentEntry__title a'); if (!a) return;
      const phones = [...c.querySelectorAll('span.hidden a[href^="tel:"]')].map(x => { try { return atob(x.getAttribute('href').slice(4)); } catch (e) { return null; } }).filter(Boolean);
      const ext = c.querySelector('a.ext-link'), loc = c.querySelector('.agentEntry__location');
      agents.push({ id: m[1], name: a.textContent.trim(), profile: a.getAttribute('href'), location: loc ? loc.textContent.trim() : '', phones, website: ext ? ext.getAttribute('href') : '' });
    });
    const pages = [...g.text.matchAll(/[?&]page=(\\d+)/g)].map(x => +x[1]);
    return { t: 'area', url: task.url, page: task.page, agents, lastPage: Math.max(1, ...pages) };
  };
  const doSale = async task => {
    const g = await get(task.profile + '?listingType=sale'); if (g.blocked) return { blocked: g.status };
    if (g.status === 404 && /<h1[^>]*>\\s*404/.test(g.text) && /Η σελίδα δεν είναι διαθέσιμη/.test(g.text)) return { t: 'sale', id: task.id, gone: true };
    if (g.status >= 500 || !/Σελίδα Μεσιτικού Γραφείου/.test(g.text)) return { t: 'sale', id: task.id, failed: true };
    const m = g.text.match(/Αποτελέσματα\\s*\\d+\\s*έως\\s*\\d+\\s*από\\s*(\\d+)/);   // no search form => the agency has no listings => 0
    const imgs = [...new Set([...g.text.matchAll(/https:\\/\\/m\\d\\.spitogatos\\.gr\\/(\\d+)_300x220\\.jpg[^"')\\s]*/g)].map(x => x[0]))];
    const pick = [], step = Math.max(1, Math.floor(imgs.length / 3)); for (let i = 0; i < imgs.length && pick.length < 3; i += step) pick.push(imgs[i]);
    return { t: 'sale', id: task.id, n: m ? parseInt(m[1]) : 0, imgs: pick };
  };

  // ---- main loop: ask for a task, do it, send the result, wait a human-like moment ----
  try {
    await api('/collector/event', { kind: 'start' });
    while (!S.stop) {
      const j = await api('/collector/next?n=1');
      if (j.done) { say('All done – nothing left to collect. You can close this tab.', '#34d399'); break; }
      if (!j.tasks || !j.tasks.length) { say('waiting for work…'); await sleep(15000); continue; }
      const task = j.tasks[0];
      say((task.t === 'index' ? 'reading the area list' : task.t === 'area' ? 'area ' + task.name + ' · page ' + task.page : 'agency ' + task.id) + ' · done this session: ' + S.done);
      let res; try { res = task.t === 'index' ? await doIndex() : task.t === 'area' ? await doArea(task) : await doSale(task); } catch (e) { res = { t: task.t, id: task.id, failed: true, url: task.url, page: task.page }; }
      if (res.blocked) {
        let notified = false;
        try { if ('Notification' in window && Notification.permission === 'granted') { const nb = new Notification('Spiti24 stopped the collection', { body: 'Action needed: reload the Spiti24 tab, tick “I am human”, wait a few minutes and paste the script again.', tag: 'spiti24-block', requireInteraction: true }); nb.onclick = () => { window.focus(); nb.close(); }; notified = true; } } catch (e) {}
        await api('/collector/event', { kind: 'block', status: res.blocked, what: task.t + ' ' + (task.id || task.url || ''), notified });
        say('Spiti24 stopped it. Reload this page, tick “I am human”, wait a few minutes, then paste the script again. Nothing is lost.', '#f87171'); break;
      }
      await api('/collector/result', { results: [res] }); S.done++; S.requests++;
      if (S.requests % 150 === 0) { for (let s = 240; s > 0 && !S.stop; s--) { say('short pause to stay polite… ' + s + 's', '#fbbf24'); await sleep(1000); } }
      await sleep(3000 + Math.random() * 1500);
    }
    if (S.stop) say('stopped. Paste the script again to continue.', '#fbbf24');
  } catch (e) { say('Stopped: ' + e.message, '#f87171'); }
  S.running = false; clearInterval(beat);
})();`;
}
module.exports = { collectorScript };
