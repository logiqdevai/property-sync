"""Watermark check, automated version of what was done by eye on the contact sheets. Two engines, same output (one line per agency: Y overlay on 2-3 photos / P on 1 / N none):
  local (default when wm.onnx exists, FREE, no key): the agency's 3 sample listing photos go through a free open-source watermark model (ONNX, see wm_export.py) and a small classifier
        fitted on the manual verdicts (wm_model.json, see wm_train.py). Cross-validated on 3,500 reviewed agencies: a watermarked agency was never called N, a clean one called Y in 0.4%.
  ai    (needs ANTHROPIC_API_KEY, paid): the photos are stitched into 5-agencies-per-sheet contact sheets (the same as mksheets.py) and an AI vision model judges them with the by-eye rules.
Nothing is guessed: agencies without a usable photo are left undecided, and the AI engine never writes '?'.

Env : WM_IN (json list [{id, imgs:[url,...]}]), WM_OUT (jsonl, append/resume), WM_ENGINE (local|ai; default local if wm.onnx is present), WM_ONNX / WM_MODEL_JSON (paths, default next to this file), WM_THREADS (local, default 2),
      ANTHROPIC_API_KEY, WM_MODEL (default claude-sonnet-5), WM_DRY=1 (ai: only build the sheets into WM_SHEETS; local: only download/score nothing), WM_KEEP=1, WM_MAX (max agencies this run), ANTHROPIC_BASE_URL (tests)
Exit: 0 ok | 2 API key rejected / unusable (see stderr) | 3 no API key (ai engine) / no local model
"""
import base64, hashlib, io, json, os, re, sys, time, urllib.request, urllib.error
from PIL import Image, ImageDraw

WM_IN, WM_OUT = os.environ.get('WM_IN'), os.environ.get('WM_OUT')
SHEETS = os.environ.get('WM_SHEETS') or os.path.join(os.path.dirname(WM_OUT or '.'), 'wm_sheets')
KEY = os.environ.get('ANTHROPIC_API_KEY', '').strip()
MODEL = os.environ.get('WM_MODEL', 'claude-sonnet-5')
BASE = (os.environ.get('ANTHROPIC_BASE_URL') or 'https://api.anthropic.com').rstrip('/')
DRY, KEEP = os.environ.get('WM_DRY') == '1', os.environ.get('WM_KEEP') == '1'
MAXN = int(os.environ.get('WM_MAX') or 10**9)
UA = {'User-Agent': 'Mozilla/5.0 (compatible; agency-watermark-check)'}
PER = 5
HERE = os.path.dirname(os.path.abspath(__file__))
ONNX = os.environ.get('WM_ONNX') or os.path.join(HERE, 'wm.onnx')
MODEL_JSON = os.environ.get('WM_MODEL_JSON') or os.path.join(HERE, 'wm_model.json')
ENGINE = (os.environ.get('WM_ENGINE') or ('local' if os.path.exists(ONNX) else 'ai')).lower()

PROMPT = """You are doing a by-eye watermark review of real-estate listing photos.
The image is a contact sheet. Each ROW is one agency (its id is printed in small RED text at the top-left of the row). A row shows up to 3 photos of that agency's listings side by side (rows with 1-2 photos leave the rest blank white).
For every row decide whether the AGENCY puts its own watermark/logo/name overlay on its listing photos and give ONE verdict:
- Y = an agency logo, name or text overlay is visible on 2 or 3 of the photos shown (it repeats). If only 2 photos are shown and both have it, Y.
- P = an overlay visible on only 1 of the photos shown (or on the only photo shown, when the row has just 1 photo).
- N = no agency overlay visible on any photo.
When unsure between N and P, choose P (a false "no watermark" is the costly mistake). Faint, semi-transparent or small corner logos DO count if you can really see them.
NOT a watermark: camera/phone timestamps or camera stamps, hand-drawn or yellow/red property-outline lines and arrows, signs or shop names that physically exist in the scene, generic price/feature banners unless they carry the agency's logo/name, a plain portal mark such as "Spitogatos".
NEVER guess. If a row is unreadable or you cannot judge it, use "?".
Answer with ONLY a JSON array, one object per row IN ORDER, like:
[{"id":"9402","v":"Y","note":"akinita24"},{"id":"9376","v":"N","note":"none"}]
"note" is a SHORT evidence string (max 20 characters, no spaces needed) naming the overlay text/logo you saw, or "none". Do not invent a note.
The row ids, in order, are: """


def get_bytes(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r: return r.read()
        except Exception: time.sleep(1.5 * (i + 1))
    return None


def make_sheet(batch):
    out = Image.new('RGB', (900, 224 * len(batch)), 'white'); d = ImageDraw.Draw(out); seen_any = 0
    for r, a in enumerate(batch):
        for j, u in enumerate(a['imgs'][:3]):
            data = get_bytes(u)
            if not data: continue
            try: out.paste(Image.open(io.BytesIO(data)).convert('RGB').resize((300, 220)), (j * 300, 224 * r)); seen_any += 1
            except Exception: pass
        d.rectangle((0, 224 * r, 44, 224 * r + 12), fill='white'); d.text((3, 224 * r + 1), str(a['id']), fill=(255, 0, 0))
    buf = io.BytesIO(); out.save(buf, 'JPEG', quality=88); return buf.getvalue(), seen_any


def ask(jpeg, ids):
    body = json.dumps({'model': MODEL, 'max_tokens': 1500, 'messages': [{'role': 'user', 'content': [
        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.b64encode(jpeg).decode()}},
        {'type': 'text', 'text': PROMPT + ', '.join(ids)}]}]}).encode()
    for attempt in range(5):
        req = urllib.request.Request(BASE + '/v1/messages', data=body, method='POST', headers={'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r: resp = json.loads(r.read().decode('utf-8'))
            return ''.join(c.get('text', '') for c in resp.get('content', []) if c.get('type') == 'text')
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:300]
            if e.code in (401, 403): print('API KEY REJECTED (%d): %s' % (e.code, msg), file=sys.stderr, flush=True); sys.exit(2)
            if e.code == 400: print('API REQUEST REJECTED (400): %s' % msg, file=sys.stderr, flush=True); sys.exit(2)
            time.sleep(6 * (attempt + 1))                                   # 429 / 5xx: back off and retry
        except Exception: time.sleep(6 * (attempt + 1))
    return None


def parse(text, ids):
    m = re.search(r'\[.*\]', text or '', re.S)
    if not m: return None
    try: arr = json.loads(m.group(0))
    except Exception: return None
    got = {}
    for o in arr:
        if isinstance(o, dict) and str(o.get('id')) in ids and str(o.get('v', '')).upper() in ('Y', 'P', 'N', '?'): got[str(o['id'])] = (str(o['v']).upper(), str(o.get('note', ''))[:40])
    return got


def local_verdict(p, a, b):
    q = sorted(p, reverse=True)
    if len(q) >= 2 and q[1] >= a: return 'Y'
    if len(q) == 1 and q[0] >= a: return 'Y'
    return 'N' if q[0] < b else 'P'


def local_main(todo, done_n):
    import numpy as np
    from concurrent.futures import ThreadPoolExecutor
    try: import onnxruntime as ort
    except Exception as e: print('onnxruntime is not installed: %s' % e, file=sys.stderr, flush=True); sys.exit(3)
    if not (os.path.exists(ONNX) and os.path.exists(MODEL_JSON)): print('local watermark model missing (%s, %s)' % (ONNX, MODEL_JSON), file=sys.stderr, flush=True); sys.exit(3)
    M = json.load(open(MODEL_JSON)); mu, sd, coef = (np.array(M[k], dtype=np.float32) for k in ('mu', 'sd', 'coef')); icpt = float(M['intercept']); a, b = float(M['a']), float(M['b'])
    so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get('WM_THREADS') or 2)
    sess = ort.InferenceSession(ONNX, so, providers=['CPUExecutionProvider'])
    def prep(data):
        im = Image.open(io.BytesIO(data)).convert('RGB').resize((224, 224), Image.BILINEAR)
        return ((np.asarray(im, dtype=np.float32) / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)
    def load(a_):
        out = []
        for u in a_['imgs'][:3]:
            d = get_bytes(u)
            if not d: continue
            try: out.append(prep(d))
            except Exception: pass
        return out
    n = 0
    with ThreadPoolExecutor(4) as pool:
        for i in range(0, len(todo), 8):
            batch = todo[i:i + 8]
            if DRY: n += len(batch); print('progress', n, flush=True); continue
            photos = list(pool.map(load, batch))
            flat = [x for ph in photos for x in ph]
            if flat:
                emb = sess.run(None, {'pixel_values': np.stack(flat)})[0]
                prob = 1.0 / (1.0 + np.exp(-(((emb - mu) / sd) @ coef + icpt)))
            k = 0
            with open(WM_OUT, 'a', encoding='utf-8') as f:
                for ag, ph in zip(batch, photos):
                    p = [float(x) for x in prob[k:k + len(ph)]] if ph else []; k += len(ph)
                    if not p: continue                                       # no photo could be downloaded: leave undecided, retried on the next run
                    f.write(json.dumps({'id': str(ag['id']), 'v': local_verdict(p, a, b), 'note': 'p=' + ','.join('%.2f' % x for x in sorted(p, reverse=True)), 'model': 'local-siglip', 'at': int(time.time())}) + '\n')
            n += len(batch); print('progress', n, flush=True)
    print('DONE', n, flush=True)


def main():
    if not WM_IN or not WM_OUT: sys.exit('WM_IN / WM_OUT not set')
    if ENGINE == 'ai' and not DRY and not KEY: print('no ANTHROPIC_API_KEY set', file=sys.stderr, flush=True); sys.exit(3)
    todo = json.load(open(WM_IN, encoding='utf-8'))
    done = set()
    if os.path.exists(WM_OUT):
        for l in open(WM_OUT, encoding='utf-8'):
            if l.strip():
                try: done.add(str(json.loads(l)['id']))
                except Exception: pass
    todo = [a for a in todo if str(a['id']) not in done and a.get('imgs')][:MAXN]
    print('to judge:', len(todo), '| already done:', len(done), '| engine:', ENGINE, '| dry:', DRY, flush=True)
    if ENGINE == 'local': return local_main(todo, len(done))
    os.makedirs(SHEETS, exist_ok=True); n = 0
    for i in range(0, len(todo), PER):
        batch = todo[i:i + PER]; ids = [str(a['id']) for a in batch]
        jpeg, seen = make_sheet(batch)
        if KEEP or DRY: open(os.path.join(SHEETS, 'sheet_%05d.jpg' % (i // PER)), 'wb').write(jpeg)
        if DRY: n += len(batch); print('progress', n, flush=True); continue
        if not seen: print('sheet %d: no photo could be downloaded, skipped' % (i // PER), file=sys.stderr, flush=True); continue
        got = None
        for _ in range(2):                                                  # one retry if the answer is not usable JSON for these ids
            got = parse(ask(jpeg, ids), set(ids))
            if got and len(got) == len(ids): break
        if not got: print('sheet %d: no usable answer, skipped (will be retried on the next run)' % (i // PER), file=sys.stderr, flush=True); continue
        with open(WM_OUT, 'a', encoding='utf-8') as f:
            for aid in ids:
                if aid in got and got[aid][0] in ('Y', 'P', 'N'): f.write(json.dumps({'id': aid, 'v': got[aid][0], 'note': got[aid][1], 'model': MODEL, 'at': int(time.time())}) + '\n')
        n += len(batch); print('progress', n, flush=True)
    print('DONE', n, flush=True)


if __name__ == '__main__': main()
