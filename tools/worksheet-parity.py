#!/usr/bin/env python3
"""The site's worksheet against the app's (RDM-co-site-worksheet-app-words): the same pictures and settings drawn by the
app's own WorksheetPage (tools/worksheet-ref.py) and by library/worksheet.js (headless Chrome), compared pixel by pixel.

  tools/worksheet-parity.py <Coordigo source dir> [out dir]

PASS when every page differs from the app's in under 1.5 % of its pixels (the wordmark, coordigo vs coordigo.com, is masked;
fonts can differ by a hair between Core Text and the browser). Writes <out>/<case>-<page>.png: app | web | difference.
"""
import base64, http.server, io, json, pathlib, re, subprocess, sys, tempfile, threading, functools
from PIL import Image, ImageChops
SITE = pathlib.Path(__file__).resolve().parent.parent
SRC = sys.argv[1]; OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp()); OUT.mkdir(parents=True, exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
lib = {e['id']: e for e in json.loads((pathlib.Path(SRC) / 'Sources/Resources/Mystery/library.json').read_text())}
CASES = [  # id, paper, name line, words under the fold, answer
    ('genre-samurai-helmet', 'letter', 1, 0, 1), ('genre-greek-helmet', 'a4', 0, 0, 1), ('genre-mushrooms', 'letter', 0, 0, 1),
    ('founder-theEmeraldCity', 'a4', 1, 0, 1),
]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
worst, fails = 0, []
for id, paper, name, words, answer in CASES:
    title = f"#{lib[id]['number']} {lib[id]['title']}"
    app = OUT / 'app'; app.mkdir(exist_ok=True)
    subprocess.run([sys.executable, str(SITE / 'tools/worksheet-ref.py'), SRC, 'pages', str(app), id, paper, title, str(name), str(words), str(answer)],
                   check=True, capture_output=True)
    url = f'http://127.0.0.1:{port}/tools/parity.html?id={id}&paper={paper}&title=1&name={name}&words={words}&answer={answer}&lang=en'
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={tempfile.mkdtemp()}', '--virtual-time-budget=15000', '--dump-dom', url],
                         capture_output=True, text=True, timeout=120).stdout
    pages = json.loads(re.search(r'PAGES (.*) END', dom).group(1).replace('&quot;', '"'))
    for i, data in enumerate(pages):
        a = Image.open(app / f'{id}-{i + 1}.png').convert('RGB')
        w = Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))).convert('RGB').resize(a.size)
        d = ImageChops.difference(a, w).convert('L').point(lambda v: 255 if v > 48 else 0)
        if i == 0: d.paste(0, (int(a.width * 0.72), 0, a.width, int(a.height * 0.09)))       # the wordmark
        share = sum(d.histogram()[255:]) / (a.width * a.height)
        worst = max(worst, share)
        if share >= 0.015: fails.append(f'{id} page {i + 1}: {share:.2%}')
        side = Image.new('RGB', (a.width * 3, a.height), 'white'); side.paste(a, (0, 0)); side.paste(w, (a.width, 0)); side.paste(d.convert('RGB'), (a.width * 2, 0))
        side.resize((side.width // 3, side.height // 3)).save(OUT / f'{id}-{i + 1}.png')
        print(f'{id} page {i + 1}: {share:.2%} of pixels differ')
srv.shutdown()
print(('FAIL ' + '; '.join(fails)) if fails else f'PASS {len(CASES)} pictures, worst page {worst:.2%}', '·', OUT)
sys.exit(1 if fails else 0)
