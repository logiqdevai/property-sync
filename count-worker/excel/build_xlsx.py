import json, os, re, sys, collections, unicodedata
from urllib.parse import urlsplit, urlunsplit
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get('EXCEL_DATA_DIR') or HERE   # the deployed app keeps its (updatable) data files in its data volume
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'spiti24-agencies.xlsx')

agents = json.load(open(os.path.join(DATA, 'agents.json'), encoding='utf-8'))
sale = json.load(open(os.path.join(DATA, 'sale_all.json'), encoding='utf-8'))
dec = {}
for tok in open(os.path.join(DATA, 'decisions.txt'), encoding='utf-8').read().split():
    k, v = tok.split(':')
    dec[k] = v

THRESHOLD = 70

# Domain check (dead_links.json): domains that no longer exist, and hosts that only resolve with/without "www."
_dl = os.path.join(DATA, 'dead_links.json')
_dl = json.load(open(_dl, encoding='utf-8')) if os.path.exists(_dl) else {'dead': [], 'www_fixable': []}
DEAD_HOSTS = {h.lower() for h in _dl['dead']}
WWW_FIX = {a.lower(): b for a, b in _dl['www_fixable']}
DEAD_NOTE = 'Website domain no longer exists (site appears offline)'

# Emails found on each agency's OWN website (find_emails.py -> emails_raw.jsonl). Only same-brand-domain and free-mail addresses are used.
EMAILS = {}
_ef = os.path.join(DATA, 'emails.jsonl')
if os.path.exists(_ef):
    for _l in open(_ef, encoding='utf-8'):
        if _l.strip():
            _r = json.loads(_l)
            EMAILS[str(_r['id'])] = _r
STATUS_TEXT = {'robots': 'site blocks automated access (robots.txt)', 'blocked': 'site refused access (403 / bot protection)',
               'no_response': 'website did not respond', 'social': 'website is a social-media page', 'ok': 'no email found on the site',
               'http_404': 'website page not found (404)', 'http_500': 'website server error', 'http_502': 'website server error',
               'http_503': 'website server error', 'http_525': 'website server error'}

# Sale-listing counts read from each agency's OWN website (count-worker/worker.js, run on Railway -> count_results.jsonl).
OWN = {}
_of = os.environ.get('OWN_RESULTS') or os.path.join(HERE, 'count_results.jsonl')   # the deployed service points this at /data/results.jsonl
if os.path.exists(_of):
    for _l in open(_of, encoding='utf-8'):
        if _l.strip():
            _r = json.loads(_l)
            OWN[str(_r['id'])] = _r   # later lines win (a retried error is replaced by its real result)
OWN_TOTAL = int(os.environ.get('OWN_TOTAL') or 1649)                        # agencies whose own website is readable (the job's target list)
def _own_final(v):   # an error row is final only when the domain no longer exists (other errors are retried by the service on its next start)
    s = str(v.get('status', '')); return not s.startswith('error') or 'ERR_NAME_NOT_RESOLVED' in s
OWN_PROCESSED = sum(1 for _v in OWN.values() if _own_final(_v))
OWN_DONE = os.environ.get('OWN_COMPLETE') == '1' or OWN_PROCESSED >= OWN_TOTAL   # the service sets OWN_COMPLETE=1 once its job has finished
OWN_STATUS_TEXT = {'blocked': 'site blocked automated access', 'robots': 'site disallows automated access (robots.txt)',
                    'no_count_found': 'no sale-listing count found on the site', 'no_listing_page': 'no sale-listing page found on the site',
                    'social': 'website is a social-media page'}
OWN_ERROR_TEXT = 'website could not be loaded (domain not found)'
FONT = 'Arial'


def f(**kw):
    return Font(name=FONT, size=kw.pop('size', 10), **kw)


def norm_url(u):
    u = (u or '').strip()
    if not u:
        return ''
    # Spiti24 typos: a doubled scheme ("http://http:/www.x.com") and a trailing sentence dot ("www.x.gr.")
    u = re.sub(r'^https?://(?=https?:/)', '', u, flags=re.I)   # drop the first scheme
    u = re.sub(r'^(https?):/+', r'\1://', u, flags=re.I)        # "http:/www" -> "http://www"
    u = u.rstrip('.,;')
    if not u.lower().startswith(('http://', 'https://')):
        u = 'http://' + u
    sp = urlsplit(u)
    if sp.netloc.lower() in WWW_FIX:                       # host only resolves with/without "www."
        u = urlunsplit(sp._replace(netloc=WWW_FIX[sp.netloc.lower()]))
    return u


def short(u):
    return u.replace('https://', '').replace('http://', '').rstrip('/')


by_area = collections.defaultdict(list)
for a in agents:
    n = sale.get(a['id'], {}).get('n')
    v = dec.get(a['id'])
    if n is None:
        check = 'Not checked yet (sale count pending)'
    elif n == 0:
        check = 'No sale listings'
    elif v == 'Y':
        check = 'Watermark on most photos'
    elif v == 'P':
        check = 'Watermark on some photos'
    elif v == 'N':
        check = 'No watermark seen'
    elif n > THRESHOLD:
        check = 'Not checked yet'
    else:
        check = 'Not checked (no photos available)'
    by_area[a['area']].append({
        'area': a['area'], 'name': a['name'], 'web': norm_url(a['website']),
        'phone': ' / '.join(a['phones']), 'loc': a['location'], 'n': n,
        'check': check, 'profile': a['profile'],
        'emails': [e['email'] for e in EMAILS.get(a['id'], {}).get('emails', [])],
        'email_arch': any(e.get('snapshot') for e in EMAILS.get(a['id'], {}).get('emails', [])),
        'email_src': [(e['source'] + ' [ARCHIVED COPY from %s-%s-%s - may be out of date]' % (e['snapshot'][:4], e['snapshot'][4:6], e['snapshot'][6:8])
                       if e.get('snapshot') else e['source']) for e in EMAILS.get(a['id'], {}).get('emails', [])],
        'email_status': (('site bot protection blocks automated visits (also blocked in a real Chrome) - email must be read by visiting the site by hand'
                          if EMAILS[a['id']].get('chrome_status') else STATUS_TEXT.get(EMAILS[a['id']]['status'], EMAILS[a['id']]['status']))
                         if a['id'] in EMAILS and not EMAILS[a['id']].get('emails') else ''),
        'web_note': DEAD_NOTE if norm_url(a['website']) and (urlsplit(norm_url(a['website'])).hostname or '').lower() in DEAD_HOSTS else '',
        'own_n': ((OWN.get(a['id']) or {}).get('best') or {}).get('n'),
        'own_conf': ((OWN.get(a['id']) or {}).get('best') or {}).get('confidence'),
        'own_review': bool(((OWN.get(a['id']) or {}).get('best') or {}).get('needs_review')),
        'own_url': ((OWN.get(a['id']) or {}).get('best') or {}).get('url'),
        'own_status': (OWN_STATUS_TEXT.get(OWN[a['id']]['status'], OWN_ERROR_TEXT if OWN[a['id']]['status'].startswith('error') else OWN[a['id']]['status'])
                        if a['id'] in OWN and not OWN[a['id']].get('best') and _own_final(OWN[a['id']]) else '')})

def alpha_key(text, drop_prefix=None):
    """Alphabetical sort key: ignores case, Greek accents and leading punctuation/quotes/spaces.
    Digits sort first, then Latin A-Z, then Greek Alpha-Omega."""
    t = unicodedata.normalize('NFD', (text or '').strip())
    t = ''.join(ch for ch in t if not unicodedata.combining(ch)).casefold()
    if drop_prefix and t.startswith(drop_prefix):
        t = t[len(drop_prefix):]
    t = re.sub(r'^[^0-9a-zͰ-Ͽ]+', '', t)   # strip leading quotes, pipes, underscores, spaces
    return re.sub(r'\s+', ' ', t)


# Areas A-Z (a leading "Ν. " = Νομός/prefecture is ignored so "Ν. Άρτας" sorts under Α); agencies A-Z inside each area.
areas = sorted(by_area, key=lambda k: alpha_key(k, drop_prefix='ν. '))
for k in areas:
    by_area[k].sort(key=lambda r: (alpha_key(r['name']), -(r['n'] or 0)))

HDR = ['Area', 'Agency', 'Website', 'Phone(s)', 'Town / location', 'Sale properties',
       'More than 70 sale properties', 'No watermark on photos', 'Watermark check', 'Both (70+ and no watermark)',
       'Spiti24 profile', 'Website note', 'Email', 'Email source', 'Agency properties (own website)']
WIDTHS = [26, 38, 34, 30, 30, 12, 15, 15, 38, 15, 12, 46, 38, 60, 24]
HFILL = PatternFill('solid', start_color='1F3864')
AFILL = PatternFill('solid', start_color='D9E2F3')
thin = Side(style='thin', color='BFBFBF')
BORDER = Border(bottom=thin)

wb = Workbook()
from openpyxl.comments import Comment
ws_sum = wb.active
ws_sum.title = 'Summary'
ws_all = wb.create_sheet('All agencies')
ws_grp = wb.create_sheet('By area')

TH = "Summary!$B$4"


def write_header(ws, row):
    for i, h in enumerate(HDR, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = f(bold=True, color='FFFFFF')
        c.fill = HFILL
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[row].height = 32
    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_row(ws, r, rec, area_col=True):
    ws.cell(row=r, column=1, value=rec['area'] if area_col else None)
    ws.cell(row=r, column=2, value=rec['name'])
    if rec['web']:
        c = ws.cell(row=r, column=3, value=short(rec['web']))
        c.hyperlink = rec['web']
        c.font = f(color='0563C1', underline='single')
    ws.cell(row=r, column=4, value=rec['phone'])
    ws.cell(row=r, column=5, value=rec['loc'])
    if rec['n'] is not None:
        ws.cell(row=r, column=6, value=rec['n'])
    big = '?' if rec['n'] is None else ('✓' if rec['n'] > THRESHOLD else '✗')
    ws.cell(row=r, column=7, value=big)
    chk = rec['check']
    if chk.startswith('No watermark'):
        h = '✓'
    elif chk.startswith('Watermark'):
        h = '✗'
    else:
        h = '?'
    ws.cell(row=r, column=8, value=h)
    ws.cell(row=r, column=9, value=chk)
    ws.cell(row=r, column=10, value='✓' if (big == '✓' and h == '✓') else '')
    if rec.get('web_note'):
        ws.cell(row=r, column=12, value=rec['web_note']).font = f(color='C62828', italic=True)
    if rec.get('emails'):
        ce = ws.cell(row=r, column=13, value='\n'.join(rec['emails'])); ce.font = f(color='C55A11') if rec.get('email_arch') else f(); ce.alignment = Alignment(wrap_text=True, vertical='top')
        cs = ws.cell(row=r, column=14, value='\n'.join(rec['email_src'])); cs.font = f(color='595959'); cs.alignment = Alignment(wrap_text=True, vertical='top')
    elif rec.get('email_status'):
        ws.cell(row=r, column=14, value=rec['email_status']).font = f(color='9E9E9E', italic=True)
    if rec.get('own_n') is not None:
        co = ws.cell(row=r, column=15, value=rec['own_n'])
        if rec.get('own_url'):
            co.hyperlink = rec['own_url']
        co.font = f(color=('C62828' if rec.get('own_review') else ('C55A11' if rec.get('own_conf') == 'low' else '0563C1')),
                    underline=('single' if rec.get('own_url') else None), bold=True)
        co.alignment = Alignment(horizontal='center')
        if rec.get('own_conf'):
            co.comment = Comment('Confidence: %s%s' % (rec['own_conf'], ' - flagged for review (several different totals seen, or only an estimate)' if rec.get('own_review') else ''), 'Spiti24 list')
    elif rec.get('own_status'):
        ws.cell(row=r, column=15, value=rec['own_status']).font = f(color='9E9E9E', italic=True)
    c = ws.cell(row=r, column=11, value='open')
    c.hyperlink = rec['profile']
    c.font = f(color='0563C1', underline='single')
    for col in (1, 2, 4, 5, 6, 9):
        ws.cell(row=r, column=col).font = f()
    for col in (6, 7, 8, 10):
        ws.cell(row=r, column=col).alignment = Alignment(horizontal='center')
        if col != 6:
            ws.cell(row=r, column=col).font = f(bold=True)
    for col in range(1, 16):
        ws.cell(row=r, column=col).border = BORDER


def add_cf(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"✓"'], font=Font(name=FONT, bold=True, color='2E7D32')))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"✗"'], font=Font(name=FONT, bold=True, color='C62828')))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"?"'], font=Font(name=FONT, bold=True, color='9E9E9E')))


# ---- All agencies (flat, filterable, sorted by area A-Z, then agency A-Z) ----
write_header(ws_all, 1)
ws_all.cell(row=1, column=13).comment = Comment("Emails read from the agency's own website (black). ORANGE = the live site blocks automated visits, so the address comes from an archived copy (Internet Archive): see the date in the Email source column; it may be out of date.", 'Spiti24 list')
ws_all.cell(row=1, column=15).comment = Comment('Number of "for sale" listings read from the AGENCY\'S OWN WEBSITE (not Spiti24), from an automated visit to their site. '
    'BLUE = a clean total; ORANGE = only a rough estimate (low confidence); RED = flagged for review (several different totals were seen on the site, so double-check before relying on it). '
    'Click the number to open the page it was read from. Grey italic text = no count could be read (with the reason). This column is filled in gradually as the background job runs; '
    'blank means it has not reached that agency yet.', 'Spiti24 list')
r = 2
for a in areas:
    for rec in by_area[a]:
        write_row(ws_all, r, rec)
        r += 1
last_all = r - 1
ws_all.freeze_panes = 'C2'
ws_all.auto_filter.ref = 'A1:O%d' % last_all
for col in ('G', 'H', 'J'):
    add_cf(ws_all, '%s2:%s%d' % (col, col, last_all))

# ---- By area (grouped / collapsible) ----
write_header(ws_grp, 1)
ws_grp.sheet_properties.outlinePr.summaryBelow = False
r = 2
for a in areas:
    start = r + 1
    end = r + len(by_area[a])
    ws_grp.cell(row=r, column=1, value=a)
    recs = by_area[a]
    ws_grp.cell(row=r, column=2, value='%d agencies' % len(recs))
    ws_grp.cell(row=r, column=6, value=sum(x['n'] or 0 for x in recs))
    ws_grp.cell(row=r, column=7, value=sum(1 for x in recs if x['n'] is not None and x['n'] > THRESHOLD))
    ws_grp.cell(row=r, column=8, value=sum(1 for x in recs if x['check'].startswith('No watermark')))
    ws_grp.cell(row=r, column=10, value=sum(1 for x in recs if x['n'] is not None and x['n'] > THRESHOLD and x['check'].startswith('No watermark')))
    for col in range(1, 16):
        c = ws_grp.cell(row=r, column=col)
        c.fill = AFILL
        c.font = f(bold=True)
        if col in (6, 7, 8, 10):
            c.alignment = Alignment(horizontal='center')
    r += 1
    for rec in by_area[a]:
        write_row(ws_grp, r, rec, area_col=False)
        ws_grp.row_dimensions[r].outlineLevel = 1
        r += 1
last_grp = r - 1
ws_grp.freeze_panes = 'C2'
for col in ('G', 'H', 'J'):
    add_cf(ws_grp, '%s2:%s%d' % (col, col, last_grp))

# ---- Summary ----
s = ws_sum
s.column_dimensions['A'].width = 46
s.column_dimensions['B'].width = 14
for col in 'CDEF':
    s.column_dimensions[col].width = 18
s['A1'] = 'Greek real-estate agencies (Spiti24 "Μεσιτικά γραφεία")'
s['A1'].font = f(bold=True, size=14)
s['A2'] = 'Source: https://www.spiti24.gr/mesitika-grafeia  |  collected 2026-09-24 to 2026-09-25'
s['A2'].font = f(italic=True, color='595959')
s['A4'] = 'Sale-properties threshold (fixed for this file)'
s['B4'] = THRESHOLD
s['B4'].font = f(bold=True)
s['A4'].font = f()
allrecs = [x for a in areas for x in by_area[a]]
big_ = [x for x in allrecs if x['n'] is not None and x['n'] > THRESHOLD]
rows = [
    ('Agencies collected', len(allrecs)),
    ('Agencies with sale count collected', sum(1 for x in allrecs if x['n'] is not None)),
    ('Agencies with more than the threshold of sale properties', len(big_)),
    ('  of those, watermark checked by eye', sum(1 for x in big_ if not x['check'].startswith('Not checked'))),
    ('  of those, NO watermark (both checkmarks)', sum(1 for x in big_ if x['check'].startswith('No watermark'))),
    ('  of those, watermark on all/some photos', sum(1 for x in big_ if x['check'].startswith('Watermark'))),
    ('Agencies with 70 or fewer sale properties, watermark checked by eye', sum(1 for x in allrecs if x['n'] is not None and 0 < x['n'] <= THRESHOLD and not x['check'].startswith('Not checked'))),
    ('  of those, no watermark seen', sum(1 for x in allrecs if x['n'] is not None and 0 < x['n'] <= THRESHOLD and x['check'].startswith('No watermark'))),
    ('Agencies with an "Agency properties (own website)" count so far', sum(1 for x in allrecs if x['own_n'] is not None)),
    ('  of those, now show MORE than 70 on their own site', sum(1 for x in allrecs if x['own_n'] is not None and x['own_n'] > THRESHOLD)),
    ('  of those, newly qualify (≤70 on Spiti24, >70 on their own site)', sum(1 for x in allrecs if x['own_n'] is not None and x['own_n'] > THRESHOLD and (x['n'] or 0) <= THRESHOLD)),
]
NOTES_ROW = 6 + len(rows) + 1   # one blank row between the numeric summary and the free-text notes
for i, (lab, val) in enumerate(rows, 6):
    s.cell(row=i, column=1, value=lab).font = f()
    c = s.cell(row=i, column=2, value=val)
    c.font = f(bold=True)
    c.alignment = Alignment(horizontal='center')

notes = ([
    'STATUS: COMPLETE. Every one of the %d agencies was crawled; all have a sale count.' % len(allrecs),
    '3 agencies whose Spiti24 profile page no longer exists (removed from the site) show 0 sale properties.',
] if all(x['n'] is not None for x in allrecs) else [
    'STATUS: PARTIAL. spiti24.gr rate-limited/blocked the crawl, so sale counts exist for the agencies that show a number in',
    '"Sale properties"; the rest show blank / "?" and will be filled when the crawl resumes.',
]) + [
    'Sale properties = number of "προς πώληση" listings on the agency profile (?listingType=sale filter, all categories).',
    'Watermark check: ~3 sale-listing photos per agency (300x220 thumbnails) inspected by eye, local, no external service.',
    '  "Watermark on most photos" = overlay visible on 2+ of 3 sampled photos; "some photos" = on 1 of 3.',
    '  Faint / tiny overlays may be missed at thumbnail size, so "No watermark seen" means none was visible in the sample.',
    '  Agencies with no sale listings, or no usable photos, show "?" (nothing to check). The "Both" column needs 70+ sale properties.',
    'Checkmark columns: ✓ = yes, ✗ = no, ? = not determined yet.',
    'Agencies are listed under the area Spiti24 files them under ("Μεσίτες ανά περιοχή").',
    (('STATUS OF "Agency properties (own website)": COMPLETE for all %d agencies whose website could be visited. Agencies without a working website, or whose site blocks automated visits, cannot be counted (grey text).' % OWN_TOTAL)
     if OWN_DONE else
     ('STATUS OF "Agency properties (own website)": PARTIAL - %d of %d agencies with a readable website processed so far. Download again later to get more.' % (OWN_PROCESSED, OWN_TOTAL))),
]
for i, n_ in enumerate(notes, NOTES_ROW):
    s.cell(row=i, column=1, value=n_).font = f(color='404040')

hr = NOTES_ROW + len(notes) + 1
for i, h in enumerate(['Area', 'Agencies', 'With sale count', '70+ sale props', 'No watermark (checked)', 'Both ✓'], 1):
    c = s.cell(row=hr, column=i, value=h)
    c.font = f(bold=True, color='FFFFFF')
    c.fill = HFILL
    c.alignment = Alignment(horizontal='center', wrap_text=True)
for i, a in enumerate(areas, hr + 1):
    recs = by_area[a]
    vals = [a, len(recs), sum(1 for x in recs if x['n'] is not None),
            sum(1 for x in recs if x['n'] is not None and x['n'] > THRESHOLD),
            sum(1 for x in recs if x['check'].startswith('No watermark')),
            sum(1 for x in recs if x['n'] is not None and x['n'] > THRESHOLD and x['check'].startswith('No watermark'))]
    for col, v in enumerate(vals, 1):
        c = s.cell(row=i, column=col, value=v)
        c.font = f()
        if col > 1:
            c.alignment = Alignment(horizontal='center')

wb.save(OUT)
print('saved', OUT, 'rows', last_all - 1, 'areas', len(areas))
