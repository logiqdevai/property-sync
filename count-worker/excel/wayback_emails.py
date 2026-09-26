"""Find agency contact emails from PUBLIC ARCHIVED COPIES (Internet Archive Wayback Machine) of sites whose live pages
refuse automated visits. Nothing here touches the agency's own server. Same extraction/filter rules as find_emails.py.
Input : a JSON list of {id, site, name} (default retry125.json). Output: wayback_raw.jsonl (append-safe, resumable).
Source strings keep the archive URL + snapshot date so every address can be verified (and its age judged).
Usage : python wayback_emails.py [targets.json] [limit]"""
import json, os, re, sys, threading, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, unquote
import find_emails as F

H = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('WB_OUT') or os.path.join(H, 'wayback_raw.jsonl')
UA = 'Mozilla/5.0 (compatible; agency-contact-research; low-volume)'
_lock = threading.Lock(); _last = [0.0]


def get(url, timeout=25, tries=3):
    for i in range(tries):
        with _lock:                                   # global gap: be gentle with archive.org
            wait = _last[0] + 0.7 - time.time(); _last[0] = max(time.time(), _last[0] + 0.7)
        if wait > 0: time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(1_500_000).decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (429, 503): time.sleep(8 * (i + 1)); continue
            return e.code, ''
        except Exception:
            time.sleep(3)
    return None, ''


def snapshots(host):
    q = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode({
        'url': host, 'matchType': 'host', 'output': 'json', 'fl': 'timestamp,original,statuscode,mimetype',
        'filter': ['statuscode:200', 'mimetype:text/html'], 'collapse': 'urlkey', 'limit': 400}, doseq=True)
    st, txt = get(q, timeout=40)
    if st != 200 or not txt.strip(): return []
    try: rows = json.loads(txt)[1:]
    except Exception: return []
    return [{'ts': r[0], 'url': r[1]} for r in rows]


KW = re.compile(r'(contact|kontakt|epikoinon|επικοινων|about|sxetika|σχετικ)', re.I)


def process(t):
    res = {'id': t['id'], 'site': t['site'], 'status': 'no_snapshot', 'pages': [], 'emails': [], 'other': [], 'fetched_with': 'wayback'}
    host = (urlsplit(t['site']).hostname or '').lower()
    hostbare = host[4:] if host.startswith('www.') else host
    snaps = snapshots(hostbare) or snapshots('www.' + hostbare)
    if not snaps: return res
    def norm(u): return re.sub(r'^https?://(www\.)?', '', u.lower()).rstrip('/')
    best = {}
    for s in snaps:
        k = norm(s['url']);  best[k] = s if k not in best or s['ts'] > best[k]['ts'] else best[k]
    pick = []
    home = [s for k, s in best.items() if urlsplit('http://' + k).path in ('', '/') or re.fullmatch(r'/(el|en|gr)', urlsplit('http://' + k).path)]
    if home: pick.append(max(home, key=lambda s: s['ts']))
    contact = [s for k, s in best.items() if KW.search(unquote(urlsplit('http://' + k).path)) and '?' not in k]
    contact.sort(key=lambda s: -int(s['ts']))
    pick += contact[:3]
    if not pick: pick = sorted(best.values(), key=lambda s: -int(s['ts']))[:2]
    sstem = F.stem(host); seen = {}
    for s in pick:
        st, txt = get(f"https://web.archive.org/web/{s['ts']}id_/{s['url']}", timeout=35)
        if st != 200 or not txt: continue
        src = f"https://web.archive.org/web/{s['ts']}/{s['url']}"
        res['pages'].append(src); res['status'] = 'ok'
        for e, via in F.extract(txt):
            if e in seen: continue
            dom = e.rsplit('@', 1)[1]
            kind = 'domain' if F.stem(dom) == sstem else ('freemail' if dom in F.FREEMAIL else 'other')
            seen[e] = {'email': e, 'source': src, 'via': via, 'kind': kind, 'snapshot': s['ts'][:8]}
    res['emails'] = F.clean_list(sorted([v for v in seen.values() if v['kind'] in ('domain', 'freemail')], key=lambda v: (v['kind'] != 'domain', v['via'] != 'mailto')))
    res['other'] = [v for v in seen.values() if v['kind'] == 'other']
    return res


if __name__ == '__main__':
    tfile = os.environ.get('WB_IN') or (sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, 'retry125.json'))
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
    targets = json.load(open(tfile, encoding='utf-8'))
    done = set(json.loads(l)['id'] for l in open(OUT, encoding='utf-8') if l.strip()) if os.path.exists(OUT) else set()
    todo = [t for t in targets if t['id'] not in done][:limit or 10**9]
    print('targets', len(targets), '| done', len(done), '| now', len(todo), flush=True)
    lk = threading.Lock(); n = [0]
    def work(t):
        try: r = process(t)
        except Exception as e: r = {'id': t['id'], 'site': t['site'], 'status': 'error:' + type(e).__name__, 'pages': [], 'emails': [], 'other': [], 'fetched_with': 'wayback'}
        with lk:
            open(OUT, 'a', encoding='utf-8').write(json.dumps(r, ensure_ascii=False) + '\n'); n[0] += 1
            if n[0] % 20 == 0: print('progress', n[0], 'of', len(todo), flush=True)
    with ThreadPoolExecutor(4) as ex: list(ex.map(work, todo))
    print('DONE', n[0], flush=True)
