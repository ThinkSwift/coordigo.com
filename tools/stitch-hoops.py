#!/usr/bin/env python3
"""Each cross stitch pattern's stitched hoop as cross-stitch/img/<id>.jpg (600 x 648, white), drawn by the engine's own
drawing (library/stitch-draw.js) in headless Chrome. Re-run after coordigo-engine export_web.py.
  tools/stitch-hoops.py [--ids a,b]"""
import base64, functools, http.server, json, pathlib, re, subprocess, sys, tempfile, threading, urllib.parse
SITE = pathlib.Path(__file__).resolve().parent.parent
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE))); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
args = sys.argv[1:]
ids = args[args.index('--ids') + 1].split(',') if '--ids' in args else sorted(p.stem for p in (SITE / 'library/stitch').glob('*.json'))
out = SITE / 'cross-stitch' / 'img'; out.mkdir(parents=True, exist_ok=True)
done = 0
for k in range(0, len(ids), 12):
    chunk = ids[k:k + 12]
    for attempt in range(3):
        url = f'http://127.0.0.1:{port}/tools/stitch-hoops.html?' + urllib.parse.urlencode({'ids': ','.join(chunk)})
        dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={tempfile.mkdtemp()}', '--virtual-time-budget=60000',
                              '--dump-dom', url], capture_output=True, text=True, timeout=600).stdout
        m = re.search(r'<pre id="out">RESULT (.*?) END</pre>', dom, re.S)
        if m: break
    if not m: sys.exit(f'no hoops for {chunk}')
    for id, data in json.loads(m.group(1).replace('&quot;', '"').replace('&amp;', '&')).items():
        (out / f'{id}.jpg').write_bytes(base64.b64decode(data.split(',', 1)[1])); done += 1
    print(f'{done}/{len(ids)}', file=sys.stderr)
print(f'PASS {done}/{len(ids)} hoops -> {out}')
