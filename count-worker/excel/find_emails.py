"""Find public contact emails on each agency's OWN website (homepage + up to 3 contact-type pages).
Input : the final Excel (All agencies: Website link + Spiti24 profile -> agency id; skips dead domains / no website).
Output: emails_raw.jsonl (one JSON line per agency, appended as it goes; safe to stop and resume).
Rules : reads only pages the site publishes, honours robots.txt, ~0.4 s between requests to the same host,
        never tries to get past a block (403/captcha => status 'blocked'), skips Facebook/Instagram pages.
Usage : python find_emails.py [limit]   (limit = only the first N sites, for a test run)"""
import html, json, os, re, socket, ssl, sys, threading, time, urllib.parse, urllib.request, urllib.robotparser
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit, unquote

H = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SCAN_OUT') or os.path.join(H, 'emails_raw.jsonl')      # the app passes SCAN_IN / SCAN_OUT
IN = os.environ.get('SCAN_IN')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
socket.setdefaulttimeout(15)

SOCIAL = ('facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com')
FREEMAIL = {'gmail.com', 'googlemail.com', 'yahoo.gr', 'yahoo.com', 'hotmail.com', 'hotmail.gr', 'outlook.com', 'outlook.gr', 'live.com', 'live.gr',
            'msn.com', 'icloud.com', 'otenet.gr', 'in.gr', 'forthnet.gr', 'hol.gr', 'mail.com', 'gmx.com', 'yandex.com', 'proton.me',
            'protonmail.com', 'aol.com', 'windowslive.com', 'vodafone.gr', 'cosmote.gr', 'ath.forthnet.gr', 'yahoo.co.uk', 'me.com'}
FILE_TLDS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'css', 'js', 'woff', 'woff2', 'ttf', 'ico', 'pdf', 'mp4', 'json', 'map', 'php', 'html'}
JUNK_DOMAINS = ('example.com', 'domain.com', 'email.com', 'yourdomain', 'sentry', 'wixpress.com', 'godaddy', 'schema.org', 'w3.org',
                'yoursite', 'mysite', 'company.com', 'test.com', 'yourcompany', 'website.com', 'sample.com', 'domain.gr', 'email.gr')
JUNK_LOCAL = {'name', 'yourname', 'your-name', 'user', 'username', 'email', 'youremail', 'your-email', 'example', 'test', 'nome', 'mail'}
CONTACT_WORDS = ('contact', 'kontakt', 'epikoinon', 'επικοινων', 'about', 'sxetika', 'σχετικ', 'ετεριας', 'εταιρε', 'reach', 'info')

_robots = {}; _robots_txt = {}; _rlock = threading.Lock()
_last = {}; _llock = threading.Lock()


def polite(host, gap=0.4):
    with _llock:
        now = time.time(); wait = _last.get(host, 0) + gap - now
        _last[host] = max(now, _last.get(host, 0) + gap)
    if wait > 0: time.sleep(wait)


def fetch(url, timeout=12, maxbytes=1_500_000):
    """-> (final_url, status, text). status None on network error."""
    polite(urlsplit(url).netloc)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'el,en;q=0.8', 'Accept': 'text/html,*/*;q=0.5'})
        try: r = urllib.request.urlopen(req, timeout=timeout)
        except ssl.SSLError: r = urllib.request.urlopen(req, timeout=timeout, context=CTX)
        with r:
            raw = r.read(maxbytes); st = r.status; fu = r.geturl()
            ct = r.headers.get('Content-Type', '')
        if 'html' not in ct.lower() and 'text' not in ct.lower() and ct: return fu, st, ''
        m = re.search(r'charset=([\w-]+)', ct, re.I); enc = m.group(1) if m else 'utf-8'
        try: txt = raw.decode(enc, 'replace')
        except LookupError: txt = raw.decode('utf-8', 'replace')
        return fu, st, txt
    except urllib.error.HTTPError as e:
        return url, e.code, ''
    except ssl.SSLError:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=timeout, context=CTX) as r:
                return r.geturl(), r.status, r.read(maxbytes).decode('utf-8', 'replace')
        except Exception: return url, None, ''
    except Exception:
        return url, None, ''


def allowed(url):
    sp = urlsplit(url); base = f'{sp.scheme}://{sp.netloc}'
    with _rlock:
        rp = _robots.get(base)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser()
        _, st, txt = fetch(base + '/robots.txt', timeout=6, maxbytes=200_000)
        try: rp.parse(txt.splitlines() if st == 200 and txt else [])
        except Exception: rp.parse([])
        with _rlock: _robots[base] = rp; _robots_txt[base] = txt[:60000] if st == 200 and txt else ''      # kept so the counting stage can obey it too
    try: return rp.can_fetch('*', url)
    except Exception: return True


def stem(host):
    p = host.lower().split('.')
    if p and p[0] == 'www': p = p[1:]
    if len(p) >= 3 and p[-2] in ('com', 'net', 'org', 'co', 'edu', 'gov'): return p[-3]
    return p[-2] if len(p) >= 2 else p[0]


def cf_decode(h):
    try:
        k = int(h[:2], 16); return ''.join(chr(int(h[i:i + 2], 16) ^ k) for i in range(2, len(h), 2))
    except Exception: return ''


EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}')


def extract(text):
    """-> list of (email, via) via = 'mailto' | 'text' | 'cloudflare'"""
    found = []
    for m in re.finditer(r'data-cfemail="([0-9a-fA-F]+)"', text): found.append((cf_decode(m.group(1)), 'cloudflare'))
    for m in re.finditer(r'email-protection#([0-9a-fA-F]+)', text): found.append((cf_decode(m.group(1)), 'cloudflare'))
    t = html.unescape(text)
    for m in re.finditer(r'mailto:([^"\'<>\s?&]+)', t, re.I): found.append((unquote(m.group(1)), 'mailto'))
    t2 = re.sub(r'\s*[\[\(\{]\s*(?:at|AT|@)\s*[\]\)\}]\s*', '@', t)
    t2 = re.sub(r'\s*[\[\(\{]\s*(?:dot|DOT)\s*[\]\)\}]\s*', '.', t2)
    t2 = re.sub(r'<[^>]{0,200}>', ' ', t2)                      # strip tags so "info@<span>x</span>" style is not glued wrongly
    for m in EMAIL_RE.finditer(t2): found.append((m.group(0), 'text'))
    out = []
    for e, via in found:
        e = re.sub(r'^u003[a-fA-F]', '', e.strip().strip('.,;:<>()[]"\'')).lower()
        if not EMAIL_RE.fullmatch(e): continue
        local, dom = e.rsplit('@', 1)
        if dom.rsplit('.', 1)[-1] in FILE_TLDS or local in JUNK_LOCAL or any(j in dom for j in JUNK_DOMAINS): continue
        if re.search(r'@\d+x|\.(png|jpe?g|gif|webp|svg)$', e) or len(e) > 80: continue
        out.append((e, via))
    return out


def contact_links(base_url, text):
    host = urlsplit(base_url).netloc.lower().lstrip('www.') if False else urlsplit(base_url).netloc.lower()
    cands = []
    for m in re.finditer(r'<a\b[^>]*?href\s*=\s*["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', text, re.I | re.S):
        href, label = m.group(1).strip(), re.sub(r'<[^>]+>', ' ', m.group(2)).lower()
        if href.lower().startswith(('mailto:', 'tel:', 'javascript:')): continue
        full = urljoin(base_url, html.unescape(href)); sp = urlsplit(full)
        if sp.netloc.lower().lstrip('www.') != host.lstrip('www.'): continue
        hay = unquote(sp.path).lower() + ' ' + label
        score = sum(2 if w in ('contact', 'epikoinon', 'επικοινων', 'kontakt') else 1 for w in CONTACT_WORDS if w in hay)
        if score: cands.append((score, full.split('#')[0]))
    seen, out = set(), []
    for sc, u in sorted(cands, key=lambda x: -x[0]):
        if u not in seen and u.rstrip('/') != base_url.rstrip('/'): seen.add(u); out.append(u)
    return out[:3]


PLATFORM_ADDRS = {'apieea-helpdesk@outlook.com', 'eea-helpdesk@outlook.com'}       # website-plugin helpdesk, not an agency address
STRICT_EMAIL = re.compile(r'[a-z0-9][a-z0-9._+\-]{0,63}@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,24}')


def clean_list(lst):
    out, seen = [], set()
    for e in lst:
        m = unquote(e['email']).strip().lower()
        m = re.sub(r'\.(gr)(?:fax|tel|phone|mob|mobile|email)[a-z]*$', r'.', m)      # "x@y.grfax" -> "x@y.gr"
        if not STRICT_EMAIL.fullmatch(m) or m in PLATFORM_ADDRS or m in seen: continue
        seen.add(m); e = dict(e); e['email'] = m; out.append(e)
    return out


def process(rec):
    aid, site = rec['id'], rec['site']
    res = {'id': aid, 'site': site, 'status': 'ok', 'pages': [], 'emails': [], 'other': []}
    host = urlsplit(site).hostname or ''
    if any(host == s or host.endswith('.' + s) for s in SOCIAL):
        res['status'] = 'social'; return res
    if not allowed(site): res['status'] = 'robots'; return res
    fu, st, txt = fetch(site)
    if st is None: res['status'] = 'no_response'; return res
    if st in (401, 403, 429) or re.search(r'Pardon Our Interruption|hcaptcha|cf-chl|Attention Required', txt[:20000], re.I):
        res['status'] = 'blocked'; return res
    if st >= 400 and not txt: res['status'] = f'http_{st}'; return res
    pages = [(fu, txt)]
    links = contact_links(fu, txt)
    if not links:
        for path in ('/contact', '/epikoinonia', '/contact-us'):
            u = urljoin(fu, path)
            if allowed(u):
                f2, s2, t2 = fetch(u, timeout=8)
                if s2 == 200 and t2: pages.append((f2, t2)); break
    for u in links:
        if allowed(u):
            f2, s2, t2 = fetch(u, timeout=10)
            if s2 == 200 and t2: pages.append((f2, t2))
    res['pages'] = [p for p, _ in pages]
    sstem = stem(host); seen = {}
    for pu, pt in pages:
        for e, via in extract(pt):
            if e in seen: continue
            dom = e.rsplit('@', 1)[1]
            kind = 'domain' if stem(dom) == sstem else ('freemail' if dom in FREEMAIL else 'other')
            seen[e] = {'email': e, 'source': pu, 'via': via, 'kind': kind}
    for v in seen.values():
        (res['emails'] if v['kind'] in ('domain', 'freemail') else res['other']).append(v)
    res['emails'].sort(key=lambda v: (v['kind'] != 'domain', v['via'] != 'mailto'))
    res['emails'] = clean_list(res['emails'])
    sp0 = urlsplit(site); res['robots_txt'] = _robots_txt.get(f'{sp0.scheme}://{sp0.netloc}', '')
    return res


def load_targets():
    return json.load(open(IN, encoding='utf-8'))          # [{id, site}] prepared by the app (dead domains / no website already excluded)


if __name__ == '__main__':
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    if not IN: sys.exit('SCAN_IN is not set')
    targets = load_targets()
    done = set()
    if os.path.exists(OUT):
        for l in open(OUT, encoding='utf-8'):
            if l.strip(): done.add(json.loads(l)['id'])
    todo = [t for t in targets if t['id'] not in done]
    if limit: todo = todo[:limit]
    print('targets', len(targets), '| already done', len(done), '| to do now', len(todo), flush=True)
    lock = threading.Lock(); n = [0]

    def work(t):
        try: r = process(t)
        except Exception as e: r = {'id': t['id'], 'site': t['site'], 'status': 'error:' + type(e).__name__, 'pages': [], 'emails': [], 'other': []}
        with lock:
            open(OUT, 'a', encoding='utf-8').write(json.dumps(r, ensure_ascii=False) + '\n'); n[0] += 1
            if n[0] % 100 == 0: print('progress', n[0], 'of', len(todo), flush=True)
    with ThreadPoolExecutor(28) as ex: list(ex.map(work, todo))
    print('DONE', n[0], flush=True)
