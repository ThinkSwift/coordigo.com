#!/usr/bin/env python3
"""Each printable's two pages as WebP, so search sees them (founder 2026-11-08): the worksheet's and the pattern's pages,
English, Letter, drawn in headless Chrome by the pages' own code (tools/page-files.html). Where they go comes from
tools/page-files.json, which tools/library-pages.py writes; it puts the files in the pages once they are there.
  tools/page-files.py [--kind library|stitch] [--ids a,b] [--force]
Only missing files are made unless --force: re-run with --force after the pictures, their words or the sheets' design change,
then tools/library-sync.sh again so the pages carry them."""
import base64, functools, http.server, json, pathlib, re, subprocess, sys, tempfile, threading, urllib.parse
SITE = pathlib.Path(__file__).resolve().parent.parent
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE))); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
args = sys.argv[1:]
plan = json.load(open(SITE / 'tools' / 'page-files.json'))
kinds = [args[args.index('--kind') + 1]] if '--kind' in args else ['library', 'stitch']
only = set(args[args.index('--ids') + 1].split(',')) if '--ids' in args else None
Q = {'library': 0.82, 'stitch': 0.74}   # WebP quality: the patterns' colour fields take more bytes
done = fail = 0
for kind in kinds:
    files = {i: f for i, f in plan[kind].items() if (not only or i in only)}
    todo = [i for i, f in files.items() if '--force' in args or not all((SITE / u.strip('/')).exists() for u in f['img'])]
    for k in range(0, len(todo), 6):
        chunk = todo[k:k + 6]
        for attempt in range(3):
            url = f'http://127.0.0.1:{port}/tools/page-files.html?' + urllib.parse.urlencode({'kind': kind, 'ids': ','.join(chunk), 'q': Q[kind]})
            dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={tempfile.mkdtemp()}', '--virtual-time-budget=180000',
                                  '--dump-dom', url], capture_output=True, text=True, timeout=900).stdout
            m = re.search(r'<pre id="out">RESULT (.*?) END</pre>', dom, re.S)
            if m: break
        got = json.loads(m.group(1).replace('&quot;', '"').replace('&amp;', '&')) if m else {}
        for i in chunk:
            r = got.get(i) or {'error': 'no result'}
            if 'error' in r or len(r.get('imgs', [])) != 2: print(f'FAIL {kind} {i}: {r.get("error", "pages %d" % len(r.get("imgs", [])))}', file=sys.stderr); fail += 1; continue
            f = files[i]
            for u, data in zip(f['img'], r['imgs']):
                p = SITE / u.strip('/'); p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(base64.b64decode(data.split(',', 1)[1]))
            done += 1
        print(f'{kind} {min(k + 6, len(todo))}/{len(todo)}', file=sys.stderr)
# the count is what is on disk, not what this run wrote
want = [u for kind in kinds for i, f in plan[kind].items() if not only or i in only for u in f['img']]
missing = [u for u in want if not (SITE / u.strip('/')).exists()]
for u in missing: print(f'missing {u}', file=sys.stderr)
print(f'{"PASS" if not missing and not fail else "FAIL"} {len(want) - len(missing)}/{len(want)} page images on disk (this run made {done} pictures\' files, failures {fail})')
