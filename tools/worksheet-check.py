#!/usr/bin/env python3
"""The Library worksheets, every one: each picture's page opened headless (tools/worksheet-check.html) and its two pages
laid out in both papers and several languages, with the Name and Class lines on. PASS when, everywhere, the code clears
the foot at the design's grid, the message and description fit the answer page, and no line runs wider than its box.

  tools/worksheet-check.py [--langs en,ko,ja,ar,th,hi] [--ids a,b]
  tools/worksheet-check.py --shot <id> <letter|a4> <lang> <out.png> [--fields 1]   → the pages as PNG
  tools/worksheet-check.py --pdf <id> <letter|a4> <lang> <out.pdf> [--fields 1]    → the PDF the page makes
  add --base /worksheets/ (or /cross-stitch/) to check those pages instead of the Library's
  add --kind stitch to any of these for the cross stitch pattern (library/stitch.js): there every note is a failure

Replaced the pixel parity with the app's sheet (tools/worksheet-parity.py) when the site took its own design on
2026-11-07 (RDM-co-site-worksheet-redesign-19); the app's Print.swift follows in a later version. Notes that are not
failures (a smaller step of the code, words set a size smaller) are counted and listed.
"""
import base64, functools, http.server, json, pathlib, re, subprocess, sys, tempfile, threading, urllib.parse
SITE = pathlib.Path(__file__).resolve().parent.parent
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
args = sys.argv[1:]
def opt(k, d):
    return args[args.index(k) + 1] if k in args else d
LANGS = opt('--langs', 'en,ko,ja,ar,th,hi')
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(SITE))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

KIND = opt('--kind', 'worksheet')
BASE = opt('--base', '')   # /worksheets/ or /cross-stitch/: the free-download pages instead of the Library's
def run(query, budget=60000):
    if KIND == 'stitch': query = {**query, 'kind': 'stitch'}
    if BASE: query = {**query, 'base': BASE}
    url = f'http://127.0.0.1:{port}/tools/worksheet-check.html?{urllib.parse.urlencode(query)}'
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={tempfile.mkdtemp()}',
                          f'--virtual-time-budget={budget}', '--dump-dom', url], capture_output=True, text=True, timeout=900).stdout
    m = re.search(r'<pre id="out">(RESULT|PAGES) (.*?) END</pre>', dom, re.S)
    if not m: sys.exit('the check page did not finish: ' + dom[-400:])
    return json.loads(m.group(2).replace('&quot;', '"').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>'))

if '--pdf' in args:
    i = args.index('--pdf'); id, paper, lang, out = args[i + 1:i + 5]
    data = run({'pdf': id, 'paper': paper, 'lang': lang, 'fields': opt('--fields', '0')})[0]
    pathlib.Path(out).write_bytes(base64.b64decode(data.split(',', 1)[1])); print(out); sys.exit(0)
if '--shot' in args:
    i = args.index('--shot'); id, paper, lang, out = args[i + 1:i + 5]
    pages = run({'shot': id, 'paper': paper, 'lang': lang, 'fields': opt('--fields', '0')})
    for k, data in enumerate(pages):
        p = pathlib.Path(out.replace('.png', f'-{k + 1}.png')); p.write_bytes(base64.b64decode(data.split(',', 1)[1])); print(p)
    sys.exit(0)

ids = opt('--ids', '')
ids = ids.split(',') if ids else sorted(p.parent.name for p in (SITE / 'library').glob('*/index.html')
                                        if not p.parent.name.isdigit() and p.parent.name != 'img')
res = []
for k in range(0, len(ids), 20):
    chunk = ids[k:k + 20]
    res += run({'ids': ','.join(chunk), 'papers': 'letter,a4', 'langs': LANGS}, budget=120000)
    print(f'{min(k + 20, len(ids))}/{len(ids)}', file=sys.stderr)
# A batch of 20 can run out of headless Chrome's time budget before its last pictures load ("no worksheet"); those are
# checked again on their own, so a slow batch is never reported as a broken sheet (2026-11-07: 2-3 such per full run)
slow = sorted({r['id'] for r in res if r.get('error') == 'no worksheet' or (KIND == 'stitch' and 'error' in r)})
if slow:
    res = [r for r in res if r['id'] not in slow]
    for id in slow:
        res += run({'ids': id, 'papers': 'letter,a4', 'langs': LANGS}, budget=120000)
    print(f'rechecked alone: {len(slow)} ({", ".join(slow)})', file=sys.stderr)
fails, notes, cases = [], {}, 0
for r in res:
    cases += 1
    tag = f"{r['id']} {r.get('paper')} {r.get('lang')}"
    if 'error' in r: fails.append(f'{tag}: {r["error"]}'); continue
    for n, pg in enumerate(r['pages'], 1):
        for s in pg['notes']:
            kind = s.split(':')[0]
            if KIND == 'stitch' or kind in ('code', 'overflow', 'kicker') or s.startswith('answer: runs'): fails.append(f'{tag} p{n}: {s}')
            else: notes.setdefault(kind, []).append(f'{tag} p{n}: {s}')
    if len(r['pages']) != 2: fails.append(f'{tag}: {len(r["pages"])} pages')
want = len(ids) * 2 * len(LANGS.split(','))
print(f"{'PASS' if not fails and cases == want else 'FAIL'} {cases - len({f.split(' p')[0].split(':')[0] for f in fails})}/{want} "
      f"(pictures {len(ids)} × letter, a4 × {LANGS}), failures {len(fails)}")
for f in fails[:40]: print('  FAIL', f)
for kind, xs in notes.items():
    print(f'  note {kind}: {len(xs)}'); [print('    ', x) for x in xs[:6]]
sys.exit(1 if fails or cases != want else 0)
