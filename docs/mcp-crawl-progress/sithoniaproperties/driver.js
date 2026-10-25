(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const expect = localStorage.getItem('mcpExpect');
  for (let i = 0; i < 60; i++) {
    if ((!expect || location.href.startsWith(expect)) && document.readyState === 'complete') break;
    await sleep(500);
  }
  if (expect && !location.href.startsWith(expect)) return { error: 'not at expected page', href: location.href, expect };
  await sleep(250 + Math.random() * 400);
  if (/Pardon Our Interruption|Just a moment|Attention Required/i.test(document.title)) return { blocked: true, title: document.title, href: location.href };
  const db = await new Promise((res, rej) => { const r = indexedDB.open('mcpcrawl', 1); r.onupgradeneeded = () => r.result.createObjectStore('items'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const getAll = () => new Promise(res => { const rq = db.transaction('items').objectStore('items').getAll(); rq.onsuccess = () => res(rq.result); });
  const getOne = k => new Promise(res => { const rq = db.transaction('items').objectStore('items').get(k); rq.onsuccess = () => res(rq.result); });
  const put = (k, v) => new Promise(res => { const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').put(v, k); tx.oncomplete = () => res(); });
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const abs = u => { try { return new URL(u, document.baseURI).href } catch { return u } };
  const bg = s => { const m = (s || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/); return m ? m[1] : null; };
  const textOf = el => el ? (clean(el.textContent) || null) : null;
  const isListing = /\/akinita\/anazitisi/.test(location.pathname);
  const dlVal = (card, label) => { for (const dl of card.querySelectorAll('dl')) { if ([...dl.querySelectorAll('dt')].some(d => clean(d.textContent) === label)) { const dd = dl.querySelector('dd'); return textOf(dd); } } return null; };
  let res, next = null;
  if (isListing) {
    const list = [...document.querySelectorAll('.ts-result-link')];
    const u = new URL(location.href);
    const page = parseInt(u.searchParams.get('page') || '1', 10);
    let added = 0;
    for (const card of list) {
      const raw = {};
      raw.url = card.querySelector('a.ts-result')?.getAttribute('href') || null;
      raw.price = textOf(card.querySelector('.ts-item__info-badge'));
      raw.title = textOf(card.querySelector('h4'));
      raw.sqm = dlVal(card, 'Εμβαδόν');
      raw.bedrooms = dlVal(card, 'Δωμάτια');
      raw.bathrooms = dlVal(card, 'Μπάνια');
      const imgs = [];
      card.querySelectorAll('[style]').forEach(n => { const b = bg(n.getAttribute('style')); if (b) imgs.push(b); });
      card.querySelectorAll('img').forEach(n => { const s = n.getAttribute('src') || ''; if (s && !s.startsWith('data:')) imgs.push(s); });
      raw._all_images = [...new Set(imgs)];
      const su = raw.url ? abs(raw.url) : location.href;
      if (!(await getOne(su))) { await put(su, { source_url: su, raw }); added++; }
    }
    const total = (await getAll()).length;
    res = { listing: true, page, cards: list.length, added, total };
    if (list.length > 0 && added > 0 && page < 50) { u.searchParams.set('page', String(page + 1)); next = u.href; }
  } else {
    const key = location.href.split('?')[0];
    const it = await getOne(key);
    if (!it) return { error: 'no item for ' + key };
    if (document.body.innerText.trim().length < 200) return { blocked: true, title: document.title, key, empty: true };
    const images = [];
    document.querySelectorAll('#gallery-carousel a.popup-image').forEach(el => { const h = el.getAttribute('href'); if (h) { const s = abs(h); if (!s.startsWith('data:') && !/\.svg$|logo|icon|favicon|sprite|sharethis/i.test(s)) images.push(s); } });
    it.raw._all_images = [...new Set([...(it.raw._all_images || []), ...images])];
    const pd = t => { const v = (t || '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); return v || null };
    const desc = pd(document.querySelector('#description p')?.innerText);
    if (desc) it.raw._detail_text = desc;
    const specs = {}, feats = new Set();
    const addSpec = (k, v) => { k = clean(k).replace(/[:：]\s*$/, ''); v = clean(v); if (!k || !v || k.length > 60 || v.length > 200) return; if (Object.keys(specs).length >= 80) return; if (!(k in specs)) specs[k] = v };
    for (const r of document.querySelectorAll('#description dl')) {
      r.closest('dl'); const dt = r.querySelectorAll('dt'), dd = r.querySelectorAll('dd'); for (let k = 0; k < Math.min(dt.length, dd.length); k++) addSpec(dt[k].textContent, dd[k].textContent);
    }
    for (const r of document.querySelectorAll('#amenities ul')) {
      r.querySelectorAll('li, [class*="feature"], [class*="detail"], [class*="spec"], [class*="info"], [class*="amenit"], [class*="char"]').forEach(n => {
        if (n.querySelector('li,ul,ol,table,dl')) return;
        const a = n.querySelector('a'); const t = clean(n.textContent); if (!t || t.length > 80) return; if (a && clean(a.textContent) === t) return;
        const m = t.match(/^(.{1,50}?)\s*[:：]\s*(.+)$/);
        if (m) addSpec(m[1], m[2]); else if (feats.size < 80 && t.length >= 2 && !/[.!?]/.test(t)) feats.add(t);
      });
    }
    if (Object.keys(specs).length) it.raw._detail_specs = specs;
    if (feats.size) it.raw._detail_features = [...feats];
    const t1 = clean(document.querySelector('#page-title h1')?.textContent); if (t1) it.raw.title = t1;
    const p1 = clean(document.querySelector('#page-title .badge')?.textContent); if (p1) it.raw.price = p1;
    let lat = null, lng = null;
    const dl = document.querySelector('[data-lat][data-lng]'); if (dl) { lat = parseFloat(dl.getAttribute('data-lat')); lng = parseFloat(dl.getAttribute('data-lng')) }
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { it.raw.latitude = Math.round(lat * 1e7) / 1e7; it.raw.longitude = Math.round(lng * 1e7) / 1e7 }
    if (!images.length && !desc) it.raw._detail_enrichment_error = 'incomplete detail page: no gallery images and no description';
    it.raw._detail_done = true;
    await put(key, it);
    res = { done: key, images: images.length, desc: !!desc, specs: Object.keys(specs).length, lat };
  }
  const all = await getAll();
  const pending = all.filter(x => !x.raw._detail_done && !x.raw._detail_enrichment_error).map(x => x.source_url);
  if (!next) next = pending[0] || null;
  res.pending = pending.length; res.next = next;
  if (next) { localStorage.setItem('mcpExpect', next); setTimeout(() => { location.href = next; }, 150); }
  else localStorage.removeItem('mcpExpect');
  return res;
})()