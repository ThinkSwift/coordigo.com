#!/usr/bin/env python3
"""The Library as plain pages, every picture open (founder 2026-11-04, RDM-co-site-open-library): the finished pictures as
image files Google can find, a grid of them in pages (newest number first), and one page per picture with its worksheet
(settings, PDF), its PNG and solving it here.

  node tools/library-data.mjs [library.js] > co-lib.json && python3 tools/library-pages.py co-lib.json [Coordigo library.json] [faces.json]
(tools/library-sync.sh runs the whole chain from a Coordigo ref.)

The app's whole Library (242 in Coordigo 6.2) comes from Coordigo scripts/web-library.py <dir> → <dir>/library.js.

Writes library/img/<id>.png, library/index.html (+ library/<n>/ for later pages), library/<id>/index.html and the image
sitemap entries in sitemap.xml. The head, tabs, site buttons, footer and the App Store bar come from index.html, so the
pages look like the rest of the site. Re-run whenever library.js changes (Coordigo scripts/web-library.py).
"""
import base64, html, io, json, os, re, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = 'https://coordigo.com'
PER = 24
data = json.load(open(sys.argv[1]))
# each picture's rarity, from the app's index (Coordigo Sources/Resources/Mystery/library.json), shown as the app does
TIER = {e['id']: e['tier'] for e in json.load(open(sys.argv[2]))} if len(sys.argv) > 2 else {}
# the answer's colours as the app fills them (tools/worksheet-ref.py faces), carried by each picture's page
FACES = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
# each picture's own message and title in the app's 22 languages (Coordigo Sources/Resources/Mystery/messages.json), and
# the titles the app translates in its catalog (Localizable.xcstrings): the answer page prints them in the worksheet's language
OWN = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
# the answer page's description under each message, in the app's 22 locales, from the one source the app imports too:
# Coordigo rules/coord-16-v0 Docs/library-descriptions.json ({"pictures": [{"id", "descriptions": {locale: text}}]}),
# given as the sixth argument (tools/library-sync.sh passes it); without it, whatever the app's messages.json carries as d
# (founder 2026-11-07, RDM-co-library-descriptions-one-source: one source, never a copy per place)
if len(sys.argv) > 6:
    for e in json.load(open(sys.argv[6]))['pictures']:
        if e.get('descriptions'): OWN.setdefault(e['id'], {})['d'] = e['descriptions']
if len(sys.argv) > 5:
    cat = json.load(open(sys.argv[5]))['strings']
    for e in json.load(open(sys.argv[2])):
        tr = {l: u['stringUnit']['value'] for l, u in cat.get(e['title'], {}).get('localizations', {}).items() if u.get('stringUnit', {}).get('value')}
        if tr: OWN.setdefault(e['id'], {}).setdefault('t', {}); OWN[e['id']]['t'] = {**tr, **(OWN[e['id']].get('t') or {})}
def message(d, loc='en-US'): return ((OWN.get(d['id']) or {}).get('m') or {}).get(loc) or d['message']
STR = json.loads(re.search(r'MYSTERY_STRINGS\s*=\s*(\{.*\})', open(os.path.join(ROOT, 'mystery/strings.js')).read(), re.S).group(1))['en']
esc = lambda s: html.escape(s, quote=True)
# the cross stitch pattern rides along only where its renderer is (founder: public after M1-M3 and a look at the patterns)
STITCH = os.path.exists(os.path.join(ROOT, 'library', 'stitch.js'))
LANGS = ['en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pt-BR', 'ru', 'sv', 'th', 'tr', 'vi', 'zh-Hans', 'zh-Hant']

home = open(os.path.join(ROOT, 'index.html')).read()
HEAD = home[:home.index('</style>')]
NAV = re.search(r'<nav class="tabs-bar".*?</nav>', home, re.S).group(0)
SITES = re.search(r'<section class="sites".*?</section>', home, re.S).group(0)
FOOT = re.search(r'  <footer>.*?</footer>', home, re.S).group(0)
BAR = re.search(r'<div class="appbar".*?</a></div>', home).group(0).replace('web-co-home', 'web-co-library')

solve = [d for d in data if d['theme'] != 'messages']
messages = [d for d in data if d['theme'] == 'messages']
# the app's number when the Library carries one (6.2: #1 … #242), else the order of the site's list
number = {d['id']: d.get('number') or i + 1 for i, d in enumerate(solve)}
newest = sorted(solve, key=lambda d: -number[d['id']])
KIND = {'animals': 'Animals', 'objects': 'Things', 'food-drink': 'Food & drink', 'celebration': 'Celebrations', 'fantasy-scifi': 'Fantasy & sci-fi',
        'places': 'Places', 'fashion': 'Fashion', 'plants-nature': 'Plants & nature', 'tech-games': 'Tech & games', 'vehicles': 'Vehicles',
        'arms-battle': 'Arms & armour', 'sky-space': 'Sky & space', 'art-pattern': 'Art & patterns'}
pages = max(1, -(-len(newest) // PER))

def badge(d):
    t = TIER.get(d['id']); return f'<span class="tier {t.lower()}">{t}</span>' if t else ''
def title(d): return (f"#{number[d['id']]} " if d['id'] in number else '') + d['title']
def points(d): return sum(len(s) for s in d['segments'])
def length(d):
    n = points(d); return STR['quick' if n < 40 else 'medium' if n < 90 else 'long']
def alt(d):
    what = d['title'] + (f" — “{d['message']}”" if d['message'] else '')
    return f"{what}: a Coordigo mystery picture, drawn by joining points on a 16 × 16 grid"
def file_stem(d): return 'coordigo' + (f"-{number[d['id']]}" if d['id'] in number else '') + '-' + d['id']

# MARK: The pictures as PNGs — the fills at their raster cells, the lines drawn smooth at 3x and filtered down.
def render(d, size=600, pad=30):
    S = 3; W = size * S
    im = Image.new('RGB', (W, W), (255, 253, 248))
    side = (size - 2 * pad) * S; ox = oy = pad * S; u = side / 15
    if d['pixels']:
        raw = base64.b64decode(d['pixels'])
        fills = Image.frombytes('RGBA', (d['w'], d['h']), raw).resize((int(side), int(side)), Image.NEAREST)
        im.paste(fills, (ox, oy), fills)
    dr = ImageDraw.Draw(im)
    lw = max(2, int(0.2 * u)); r = lw / 2
    for seg in d['segments']:
        pts = [(ox + x * u, oy + y * u) for x, y in seg]
        if len(pts) == 1:
            x, y = pts[0]; dr.ellipse((x - lw * 0.9, y - lw * 0.9, x + lw * 0.9, y + lw * 0.9), fill=(27, 25, 23)); continue
        dr.line(pts, fill=(27, 25, 23), width=lw)
        for x, y in pts: dr.ellipse((x - r, y - r, x + r, y + r), fill=(27, 25, 23))
    return im.resize((size, size), Image.LANCZOS)

import shutil
for name in os.listdir(os.path.join(ROOT, 'library')):
    if name not in ('worksheet.js', 'worksheet-words.js', 'worksheet-site-words.js', 'printmark.png'):
        q = os.path.join(ROOT, 'library', name); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
os.makedirs(os.path.join(ROOT, 'library/img'), exist_ok=True)
for d in data:
    render(d).save(os.path.join(ROOT, 'library/img', d['id'] + '.png'), optimize=True)

# MARK: Pages
CSS = '''
  /* the Library, open (founder 2026-11-04): pictures as images, a page per picture with its worksheet */
  .tile{display:block;text-decoration:none;color:inherit}
  .tile .face img{position:absolute;inset:0;width:100%;height:100%;display:block}
  /* rarity as in the app (Coordigo Theme.swift): the frame in its colour, a chip with its name */
  .tier{display:inline-block;font:600 11.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:3px 7px;border-radius:999px;margin-right:6px;vertical-align:1px;
    background:#efebe4;color:#3d3a37}
  .tier.rare{background:#d6e8ff;color:#00468f} .tier.epic{background:#e2e0fa;color:#2f2a8f} .tier.legendary{background:#ffe2bd;color:#6b3a00}
  .tile.rare .face, .pic-grid figure.rare{border:2px solid #007aff} .tile.epic .face, .pic-grid figure.epic{border:2px solid #5952de}
  .tile.legendary .face, .pic-grid figure.legendary{border:3px solid #ff9400}
  .pager{display:flex;justify-content:center;gap:8px;margin:22px 0 0}
  .pager a{min-width:44px;height:44px;display:grid;place-items:center;border-radius:12px;border:1px solid var(--line);background:var(--mat);color:var(--ink);
    text-decoration:none;font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .pager a[aria-current]{border-color:var(--ink);background:var(--ink);color:var(--paper)}
  .crumb{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted);margin:22px 0 0}
  .crumb a{color:inherit}
  .pic-page h1{margin:6px 0 4px}
  .pic-page .count{color:var(--muted);margin:0}
  .pic-page .words{font-style:italic;margin:8px 0 0}
  .pic-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start;margin:18px 0 0}
  .pic-grid figure{margin:0;background:var(--mat);border:1px solid var(--hair);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
  .pic-grid figure img{display:block;width:100%;height:auto}
  .menu{background:var(--mat);border:1px solid var(--hair);border-radius:16px;box-shadow:var(--shadow);padding:18px}
  .menu h2{font-size:19px;margin:0 0 10px}
  .menu fieldset{border:0;padding:0;margin:0 0 12px;display:grid;gap:8px;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .menu legend{font-weight:600;margin-bottom:4px}
  .menu label{display:flex;gap:8px;align-items:center}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;width:max-content}
  .seg label{padding:6px 14px;cursor:pointer}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .menu select{font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);width:max-content}
  .seg label:has(input:checked){background:var(--ink);color:var(--paper)}
  .menu-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}
  .menu-head h2{margin:0}
  .seg.kind{margin:0 0 14px}
  .seg.kind[hidden],#wsOnly[hidden]{display:none}
  .langrow{display:flex;align-items:center;gap:8px;margin:0 0 14px;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .langrow[hidden]{display:none}
  .langrow svg{width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:1.6}
  .menu .check{display:flex;gap:8px;align-items:center;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0 0 12px}
  .menu .field{display:grid;gap:5px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted);margin:0 0 12px}
  .menu .field input,.menu .field textarea{font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);
    border:1px solid var(--line);border-radius:10px;padding:8px 10px;resize:vertical;width:100%;box-sizing:border-box}
  .menu .field.names{grid-template-columns:1fr 1fr;gap:8px;margin-top:-4px}
  .menu .field.names[hidden]{display:none}
  .acts.quiet{margin-top:8px}
  .acts.quiet .act{border-color:var(--line);font-weight:500}
  .sheets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;margin:24px 0 0}
  .sheets canvas{display:block;width:100%;height:auto;background:#fff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.12)}
  .acts{display:flex;flex-wrap:wrap;gap:8px}
  .act{font:600 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;border:1px solid var(--ink);border-radius:999px;
    padding:10px 16px;background:none;color:var(--ink);text-decoration:none;display:inline-block}
  .act.primary{background:var(--ink);color:var(--paper)}
  .act[disabled]{opacity:.5;cursor:default}
  #player{display:block;width:100%;height:640px;border:0;margin:22px 0 0}
  #player[hidden]{display:none}
  .free{color:var(--muted);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:4px 0 14px}
  .pn{display:flex;justify-content:space-between;gap:12px;margin:26px 0 0;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .pn a{color:var(--ink)}
  @media (max-width:760px){ .pic-grid{grid-template-columns:1fr} .pic-grid figure{width:100%;max-width:420px;margin:0 auto} }
'''

I18N = '''<script src="/store.js"></script>
<script src="/mystery/strings.js"></script>
<script>
  (function () {   // the site's words in the reader's language, and the App Store bar on Apple devices once Coordigo 6.2 is in the store
    var table = window.MYSTERY_STRINGS || {}, lang = (navigator.language || 'en').toLowerCase(), L = 'en';
    if (lang.indexOf('zh') === 0) L = /hant|tw|hk|mo/.test(lang) ? 'zh-Hant' : 'zh-Hans';
    else if (lang.indexOf('pt') === 0) L = 'pt-BR'; else if (table[lang.split('-')[0]]) L = lang.split('-')[0];
    document.querySelectorAll('[data-t]').forEach(function (el) { var s = (table[L] || {})[el.dataset.t]; if (s && s.indexOf('%') < 0) el.textContent = s; });
    document.querySelectorAll('[data-store]').forEach(function (a) { a.href = 'https://apps.apple.com/app/id1486330879?ct=' + a.dataset.store; });
    var apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent), preview = /[?&]store=preview/.test(location.search);
    if (!preview && (!apple || window.CO_STORE !== true)) document.querySelectorAll('[data-apple]').forEach(function (e) { e.hidden = true; });
  })();
</script>'''

def head(page_title, desc, path, image=None, ld=None):
    h = re.sub(r'<title>.*?</title>', f'<title>{esc(page_title)}</title>', HEAD, count=1)
    h = re.sub(r'<!-- hreflang:start -->.*?<!-- hreflang:end -->\n', '', h, flags=re.S)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', h, count=1)
    h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{ORIGIN}{path}">', h, count=1)
    h = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{ORIGIN}{path}">', h, count=1)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(page_title)}">', h, count=1)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', h, count=1)
    if image: h = re.sub(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{ORIGIN}{image}">', h, count=1)
    if ld: h = h.replace('</script>', '</script>\n<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>', 1)
    return h + CSS + '</style>\n</head>\n'

def nav(cur):
    n = NAV.replace(' aria-current="page"', '')
    return n.replace('href="/library/">', 'href="/library/" aria-current="page">') if cur == 'library' else n

def tile(d):
    t = TIER.get(d['id'], '').lower()
    return (f'<a class="tile{" " + t if t else ""}" href="/library/{d["id"]}/"><div class="face"><img src="/library/img/{d["id"]}.png" width="600" height="600" '
            f'loading="lazy" alt="{esc(alt(d))}"></div><div class="t">{esc(title(d))}</div>'
            f'<div class="d">{badge(d)}{esc(d["message"] if d["theme"] == "messages" else KIND.get(d["theme"], length(d)))}</div></a>')

def body(inner):
    return f'''<body>
<main>
  {nav('library')}
{inner}
  {SITES}
{FOOT}
</main>
{BAR}
{I18N}
<script type="module" src="/trace/track.js"></script>
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{{"token": "644eea6fa19b4175b7160496dfbd77a8"}}'></script>
</body>
</html>
'''

def grid_page(k):
    path = '/library/' if k == 1 else f'/library/{k}/'
    items = newest[(k - 1) * PER: k * PER]
    pager = ''.join(f'<a href="{"/library/" if i == 1 else f"/library/{i}/"}"{" aria-current=\"page\"" if i == k else ""}>{i}</a>' for i in range(1, pages + 1))
    inner = f'''
  <section>
    <div class="caps" data-t="libCaps">Library</div>
    <h1 style="font-size:28px;margin:6px 0 4px">{len(solve)} free printable mystery pictures</h1>
    <p class="sub">Coordinate graphing worksheets, every one open: see the picture, or print its worksheet — the empty grid and the code to join the points — in Letter or A4, with an answer page. Free to download, print and pass on.</p>
    <div class="grid" style="margin-top:16px">{''.join(tile(d) for d in items)}</div>
    <nav class="pager" aria-label="Pages">{pager}</nav>
  </section>
''' + (f'''
  <section>
    <div class="caps" data-t="msgCaps">Messages to send</div>
    <p class="sub" data-t="msgSub">Solve one here. In the app, send it with your own words.</p>
    <div class="grid">{''.join(tile(d) for d in messages)}</div>
  </section>
''' if k == 1 and messages else '')
    t = f'{len(solve)} Free Printable Mystery Pictures · Coordinate Graphing Worksheets (PDF) · Coordigo' + ('' if k == 1 else f' · page {k}')
    d = (f'{len(solve)} free printable mystery pictures: coordinate graphing worksheets on a 16 × 16 grid, each with an answer page. '
         'Letter or A4 PDF, in your language or English.')
    out = os.path.join(ROOT, path.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write(head(t, d, path, f'/library/img/{items[0]["id"]}.png') + body(inner))

def picture_page(d, prev, nxt):
    path = f'/library/{d["id"]}/'
    words = f'<p class="words">“{esc(message(d))}”</p>' if message(d) else ''
    link = lambda e, label: f'<a href="/library/{e["id"]}/">{label}: {esc(title(e))}</a>' if e else '<span></span>'
    SWITCH = '          <div class="seg kind" id="kindSet" role="radiogroup" hidden><label><input type="radio" name="kind" value="worksheet" checked> <span data-w="worksheet">Worksheet</span></label><label><input type="radio" name="kind" value="stitch"> <span data-st="menu">Cross stitch pattern</span></label></div>\n' if STITCH else ''
    inner = f'''
  <section class="pic-page" data-picture="{d['id']}" data-number="{number.get(d['id'], 0)}" data-title="{esc(d['title'])}" data-tier="{TIER.get(d['id'], '')}" data-file="{file_stem(d)}" data-payload="{esc(d['payload'])}">
    <p class="crumb"><a href="/library/" data-t="libCaps">Library</a></p>
    <h1>{esc(title(d))}</h1>
    <p class="count">{badge(d)}{esc(KIND[d['theme']]) + ' · ' if d['theme'] in KIND else ''}{len(d['segments'])} lines · {points(d)} points{'' if d['theme'] == 'messages' else ' · ' + esc(length(d))}</p>
    {words}
    <p class="free">A free printable mystery picture: print the worksheet, join the points and see it appear. Letter or A4, with an answer page.</p>
    <div class="pic-grid">
      <figure class="{TIER.get(d['id'], '').lower()}"><img src="/library/img/{d['id']}.png" width="600" height="600" alt="{esc(alt(d))}"></figure>
      <div class="menu">
        <div class="menu-head"><h2 data-w="worksheet" id="menuTitle">Worksheet</h2></div>
        <form id="sheetForm" onsubmit="return false">
{SWITCH}          <div class="langrow" id="langSet" role="radiogroup" aria-label="Language" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><div class="seg"><label><input type="radio" name="lang" value="" id="langOwn"> <span id="langOwnName"></span></label><label><input type="radio" name="lang" value="en"> <span lang="en">English</span></label></div></div>
          <fieldset>
            <legend data-w="paper">Paper</legend>
            <div class="seg"><label><input type="radio" name="paper" value="letter"> <span data-w="letter">Letter</span></label><label><input type="radio" name="paper" value="a4"> <span data-w="a4">A4</span></label></div>
          </fieldset>
          <div id="wsOnly">
          <label class="check"><input type="checkbox" name="answer" checked> <span data-w="answerPage">Answer page in color</span></label>
          <label class="check"><input type="checkbox" name="fields"> <span data-ws="lines">Name and class lines</span></label>
          <div class="field names" id="fieldNames" hidden><input type="text" name="label1" maxlength="18" autocomplete="off" aria-label="1"><input type="text" name="label2" maxlength="18" autocomplete="off" aria-label="2"></div>
          <label class="field"><span data-ws="titleField">Title · optional, on the answer page</span><input type="text" name="title" maxlength="40" autocomplete="off"></label>
          <label class="field"><span data-ws="wordsField">Words · optional, on the answer page</span><textarea name="words" maxlength="120" rows="2"></textarea></label>
          </div>
        </form>
        <div class="acts">
          <button class="act primary" id="sheetPrint" type="button" data-w="print">Print</button>
          <button class="act" id="sheetPDF" type="button" data-w="sharePDF">Share as PDF</button>
        </div>
        <div class="acts quiet">
          <a class="act" href="/library/img/{d['id']}.png" download="{file_stem(d)}.png">Save picture (PNG)</a>
          <button class="act" id="solveHere" type="button">Solve it here</button>
        </div>
      </div>
    </div>
    <div class="sheets" id="sheetPreview" aria-live="polite"></div>
    <iframe id="player" title="Mystery picture" hidden></iframe>
    <nav class="pn" aria-label="More pictures">{link(prev, 'Newer')}{link(nxt, 'Older')}</nav>
  </section>
'''
    # The words people search for a sheet like this: free printable, mystery picture, coordinate graphing, worksheet, PDF
    # (founder 2026-11-07, RDM-co-site-free-printables)
    t = f'{d["title"]} Mystery Picture · Free Printable Worksheet (PDF) · Coordigo #{number.get(d["id"], "")}'
    desc = (f'Free printable coordinate graphing mystery picture: join the points on a 16 × 16 grid and a {d["title"].lower()} appears. '
            f'Letter or A4 PDF with an answer page, in your language or English. Download, print and share.')
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': ['CreativeWork', 'LearningResource'], 'name': f'{d["title"]} mystery picture worksheet', 'url': ORIGIN + path,
         'image': f'{ORIGIN}/library/img/{d["id"]}.png', 'description': desc, 'isAccessibleForFree': True,
         'learningResourceType': 'Worksheet', 'educationalUse': 'Coordinate graphing', 'encodingFormat': 'application/pdf',
         'inLanguage': LANGS, 'publisher': {'@id': 'https://swiftian.com/#org'}, 'isPartOf': {'@id': 'https://coordigo.com/#site'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Library', 'item': ORIGIN + '/library/'},
            {'@type': 'ListItem', 'position': 2, 'name': title(d), 'item': ORIGIN + path}]}]}
    out = os.path.join(ROOT, 'library', d['id'], 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    page = head(t, desc, path, f'/library/img/{d["id"]}.png', ld) + body(inner)
    page = page.replace('<script src="/mystery/strings.js"></script>',
                        '<script src="/mystery/strings.js"></script>\n<script src="/mystery/engine.js"></script>\n'
                        + (f'<script type="application/json" id="faces">{json.dumps(FACES[d["id"]], separators=(",", ":"))}</script>\n' if d['id'] in FACES else '')
                        + (f'<script type="application/json" id="picture-words">{json.dumps(OWN[d["id"]], ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")}</script>\n' if d['id'] in OWN else '')
                        + '<script src="/library/worksheet-words.js"></script>\n<script src="/library/worksheet-site-words.js"></script>\n<script src="/library/worksheet.js"></script>'
                        + ('\n<script src="/library/stitch-words.js"></script>\n<script src="/library/stitch-draw.js"></script>\n<script src="/library/stitch.js"></script>' if STITCH else ''), 1)
    # the worksheet's typefaces (Latin; other scripts use the reader's own fonts)
    page = page.replace('</head>', '<link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Karla:wght@400;700&family=JetBrains+Mono:wght@500;600&family=Silkscreen&display=swap" rel="stylesheet">\n</head>', 1)
    open(out, 'w').write(page)

for k in range(1, pages + 1): grid_page(k)
order = newest + messages
for i, d in enumerate(order):
    picture_page(d, order[i - 1] if i > 0 else None, order[i + 1] if i + 1 < len(order) else None)

# MARK: Sitemap — every Library page, each picture's page with its image
sm_path = os.path.join(ROOT, 'sitemap.xml'); sm = open(sm_path).read()
sm = re.sub(r'\s*<url><loc>https://coordigo\.com/library/[^<]*</loc>.*?</url>', '', sm, flags=re.S)
if 'xmlns:image' not in sm:
    sm = sm.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"', 1)
urls = [f'  <url><loc>{ORIGIN}/library/</loc></url>'] + [f'  <url><loc>{ORIGIN}/library/{k}/</loc></url>' for k in range(2, pages + 1)]
urls += [f'  <url><loc>{ORIGIN}/library/{d["id"]}/</loc><image:image><image:loc>{ORIGIN}/library/img/{d["id"]}.png</image:loc></image:image></url>' for d in order]
sm = sm.replace('</urlset>', '\n'.join(urls) + '\n</urlset>')
open(sm_path, 'w').write(sm)
print(f'{len(data)} pictures · {pages} Library pages · {len(order)} picture pages')
