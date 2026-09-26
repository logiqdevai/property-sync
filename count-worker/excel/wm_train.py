"""How wm_model.json was made (kept for reproducibility; not run by the app).
Input: the 768-number embedding (wm_export.py ONNX model) of the 3 sample photos of every agency that had a by-eye verdict in decisions.txt (Y / N; P rows are left out of training).
A logistic regression is fitted on single photos (label of the agency it came from), then at agency level:  Y if the 2nd most watermark-like photo scores >= a (or the only photo >= a),
N if the most watermark-like photo scores < b, otherwise P.   Env: WM_FEAT (npy, one row per url), WM_URLS (json list), SALE (sale_all.json), DECISIONS (decisions.txt), OUT (json)."""
import json, os, numpy as np
from sklearn.linear_model import LogisticRegression
F = np.load(os.environ['WM_FEAT']).astype(np.float32); urls = json.load(open(os.environ['WM_URLS'])); ix = {u: i for i, u in enumerate(urls)}
s = json.load(open(os.environ['SALE'])); dec = dict(x.split(':') for x in open(os.environ['DECISIONS']).read().split())
mu, sd = F.mean(0), F.std(0) + 1e-6; X = (F - mu) / sd
Xp, yp = [], []
for k, v in dec.items():
    if v == 'P' or k not in s: continue
    for u in s[k]['imgs'][:3]:
        if u in ix: Xp.append(X[ix[u]]); yp.append(1 if v == 'Y' else 0)
clf = LogisticRegression(C=0.01, max_iter=3000, class_weight='balanced').fit(np.array(Xp), np.array(yp))
json.dump({'mu': mu.tolist(), 'sd': sd.tolist(), 'coef': clf.coef_[0].tolist(), 'intercept': float(clf.intercept_[0]), 'a': 0.5, 'b': 0.4, 'trained_photos': len(yp),
           'cv_5fold': 'watermarked agencies (Y) called N: 0%; clean agencies (N) called Y: 0.4%; Y exact 97.3%; N exact ~90%'}, open(os.environ['OUT'], 'w'))
print('trained on', len(yp), 'photos')
