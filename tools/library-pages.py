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
# each picture's title in the 22 locales, from the same source as the messages (Coordigo rules/coord-16-v0
# Docs/library-messages.json, pictures[].titles; tools/library-sync.sh passes it as the seventh argument). It wins over
# the app catalog's few translated titles below.
RULE_TITLES = {}
if len(sys.argv) > 7:
    GRADE_TO_APP = {'library-game-ufo': 'game-ufo', 'library-game-penguin': 'game-penguin', 'founder-duck': 'duck'}
    for e in json.load(open(sys.argv[7]))['pictures']:
        if isinstance(e.get('titles'), dict): RULE_TITLES[GRADE_TO_APP.get(e['id'], e['id'])] = e['titles']
if len(sys.argv) > 5:
    cat = json.load(open(sys.argv[5]))['strings']
    for e in json.load(open(sys.argv[2])):
        tr = {l: u['stringUnit']['value'] for l, u in cat.get(e['title'], {}).get('localizations', {}).items() if u.get('stringUnit', {}).get('value')}
        if tr: OWN.setdefault(e['id'], {}).setdefault('t', {}); OWN[e['id']]['t'] = {**tr, **(OWN[e['id']].get('t') or {})}
for k, t in RULE_TITLES.items(): OWN.setdefault(k, {})['t'] = {**(OWN.get(k, {}).get('t') or {}), **t}
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
    # kept: the worksheet's own files and the cross stitch pattern's (library/stitch*: coordigo-engine export_web.py, stitch.js)
    if name not in ('worksheet.js', 'worksheet-words.js', 'worksheet-site-words.js', 'printmark.png', 'stitch.js', 'stitch-words.js', 'stitch-draw.js', 'stitch'):
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
  .seg.kind{margin:0 0 14px;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
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
  .also{margin:18px 0 0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .also a{color:var(--ink)}
  figure.hoop,.face.hoop{background:#fff}
  figure.hoop img,.face.hoop img{object-fit:contain}
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
    var cur = document.querySelector('.tabs [aria-current]'), bar = cur && cur.parentNode;   // a phone shows the current tab
    if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2;
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
    at = {'library': '/library/', 'stitch': '/cross-stitch/'}.get(cur)
    return n.replace(f'href="{at}">', f'href="{at}" aria-current="page">') if at else n

def tile(d):
    t = TIER.get(d['id'], '').lower()
    return (f'<a class="tile{" " + t if t else ""}" href="/library/{d["id"]}/"><div class="face"><img src="/library/img/{d["id"]}.png" width="600" height="600" '
            f'loading="lazy" alt="{esc(alt(d))}"></div><div class="t">{esc(title(d))}</div>'
            f'<div class="d">{badge(d)}{esc(d["message"] if d["theme"] == "messages" else KIND.get(d["theme"], length(d)))}</div></a>')

def body(inner, kind='library'):
    return f'''<body>
<main>
  {nav(kind)}
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

# MARK: Two kinds of page per picture (founder 2026-11-08, RDM-co-site-free-printables: each printable has its own pages that
# people searching for it land on, each found by its own free-download search; the Library and the worksheet pages were the
# same thing, so they are one):
# Named as equals (founder 2026-11-08): each section is an activity done on paper with the same picture, and each page names
# its format the way people search for it:
#   /library/<id>/       Coordinate graphing: "<Picture> Coordinate Graphing Worksheet · Free Printable Mystery Picture PDF"
#   /cross-stitch/<id>/  Cross stitch:        "<Picture> Cross Stitch Pattern · Free Printable PDF"
# and a hub for each (/library/, /cross-stitch/, paged).
SEC = {
    'library': {'path': '/library/', 'crumb': 'Coordinate graphing', 't': 'graphCaps'},
    'stitch': {'path': '/cross-stitch/', 'crumb': 'Cross stitch', 't': 'stitchCaps'},
}
LANG_ROW = '''          <div class="langrow" id="langSet" role="radiogroup" aria-label="Language" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><div class="seg"><label><input type="radio" name="lang" value="" id="langOwn"> <span id="langOwnName"></span></label><label><input type="radio" name="lang" value="en"> <span lang="en">English</span></label></div></div>
          <fieldset>
            <legend data-w="paper">Paper</legend>
            <div class="seg"><label><input type="radio" name="paper" value="letter"> <span data-w="letter">Letter</span></label><label><input type="radio" name="paper" value="a4"> <span data-w="a4">A4</span></label></div>
          </fieldset>
'''
WS_ONLY = '''          <div id="wsOnly"{hide}>
          <label class="check"><input type="checkbox" name="answer" checked> <span data-w="answerPage">Answer page in color</span></label>
          <label class="check"><input type="checkbox" name="fields"> <span data-ws="lines">Name and class lines</span></label>
          <div class="field names" id="fieldNames" hidden><input type="text" name="label1" maxlength="18" autocomplete="off" aria-label="1"><input type="text" name="label2" maxlength="18" autocomplete="off" aria-label="2"></div>
          <label class="field"><span data-ws="titleField">Title · optional, on the answer page</span><input type="text" name="title" maxlength="40" autocomplete="off"></label>
          <label class="field"><span data-ws="wordsField">Words · optional, on the answer page</span><textarea name="words" maxlength="120" rows="2"></textarea></label>
          </div>
'''
SWITCH = '          <div class="seg kind" id="kindSet" role="radiogroup" hidden><label><input type="radio" name="kind" value="worksheet" checked> <span data-w="worksheet">Worksheet</span></label><label><input type="radio" name="kind" value="stitch"> <span data-st="menu">Cross stitch pattern</span></label></div>\n'

def menu(kind, d):
    if kind == 'library':
        top, form_head, extra = '<h2>Print the worksheet</h2>', '', f'''
        <div class="acts quiet">
          <a class="act" href="/library/img/{d['id']}.png" download="{file_stem(d)}.png">Save picture (PNG)</a>
          <button class="act" id="solveHere" type="button">Solve it here</button>
        </div>'''
    else:
        top = '<h2>Get the pattern</h2>'
        form_head = '          <input type="hidden" name="kind" value="stitch">\n' if kind == 'stitch' else ''
        extra = ''
    return f'''      <div class="menu">
        <div class="menu-head">{top}</div>
        <form id="sheetForm" onsubmit="return false">
{form_head}{LANG_ROW}{WS_ONLY.format(hide=' hidden' if kind == 'stitch' else '')}        </form>
        <div class="acts">
          <button class="act primary" id="sheetPrint" type="button" data-w="print">Print</button>
          <button class="act" id="sheetPDF" type="button" data-w="sharePDF">Share as PDF</button>
        </div>{extra}
      </div>'''

def stitch_facts(d):
    p = json.load(open(os.path.join(ROOT, 'library', 'stitch', d['id'] + '.json')))
    xs, ys = [], []
    for c in p['cells']: xs += [c[0], c[0] + 1]; ys += [c[1], c[1] + 1]
    for s in p['lines']:
        for a, b in s: xs.append(a); ys.append(b)
    return {'W': max(xs) - min(xs), 'H': max(ys) - min(ys), 'colors': len(p['colors']), 'cells': len(p['cells'])}

def sheet_page(kind, d, prev, nxt):
    sec = SEC[kind]; path = f'{sec["path"]}{d["id"]}/'; T = d['title']; t = T[0].lower() + T[1:] if T[:2] != T[:2].upper() else T
    link = lambda e, label: f'<a href="{sec["path"]}{e["id"]}/">{label}: {esc(title(e))}</a>' if e else '<span></span>'
    words = f'<p class="words">“{esc(message(d))}”</p>' if message(d) else ''
    attrs = f'''data-picture="{d['id']}" data-number="{number.get(d['id'], 0)}" data-title="{esc(d['title'])}" data-tier="{TIER.get(d['id'], '')}" data-file="{file_stem(d)}" data-payload="{esc(d['payload'])}"'''
    pic = f'<figure class="{TIER.get(d["id"], "").lower()}"><img src="/library/img/{d["id"]}.png" width="600" height="600" alt="{esc(alt(d))}"></figure>'

    if kind == 'library':
        h1 = f'{esc(T)} coordinate graphing worksheet'
        count = f'''{badge(d)}Free printable PDF · {len(d['segments'])} lines · {points(d)} points{'' if d['theme'] == 'messages' else ' · ' + esc(length(d))}'''
        lead = (f'<p class="free">Plot the points on the 16 × 16 coordinate grid, join each line in order and a {esc(t)} appears. '
                f'The answer page comes with it. Letter or A4, in your language or English: download, print or share it free, or solve it here.</p>')
        page_title = f'{T} Mystery Picture · Free Coordinate Graphing Worksheet (PDF) · Coordigo'
        desc = (f'Free printable {t} coordinate graphing worksheet, a mystery picture (PDF): plot the points on a 16 × 16 grid and join them to reveal '
                f'the picture. Answer page included. Letter or A4, in your language or English.')
        image = f'/library/img/{d["id"]}.png'
        ld_main = {'@type': ['CreativeWork', 'LearningResource'], 'name': f'{T} coordinate graphing worksheet', 'url': ORIGIN + path,
                   'image': ORIGIN + image, 'description': desc, 'isAccessibleForFree': True, 'learningResourceType': 'Worksheet',
                   'educationalUse': 'Coordinate graphing', 'encodingFormat': 'application/pdf', 'inLanguage': LANGS,
                   'publisher': {'@id': 'https://swiftian.com/#org'}, 'isPartOf': {'@id': 'https://coordigo.com/#site'}}
    else:
        f = stitch_facts(d)
        h1 = f'{esc(T)} cross stitch pattern'
        count = f'Free PDF · {f["W"]} × {f["H"]} stitches · {f["colors"]} DMC colours + black backstitch · {f["cells"]} crosses'
        lead = (f'<p class="free">A small counted cross stitch pattern: the chart with a symbol for every colour, the DMC floss key and '
                f'how to stitch it. It comes out about {f["W"] / 14 * 2.54:.1f} × {f["H"] / 14 * 2.54:.1f} cm on 14 count Aida, '
                f'small enough for a 10 cm hoop. The PDF is free, for Letter or A4, in your language or English.</p>')
        page_title = f'{T} Cross Stitch Pattern · Free PDF Chart · Coordigo'
        desc = (f'Free {t} cross stitch pattern (PDF): {f["W"]} × {f["H"]} stitches, {f["colors"]} DMC colours plus black backstitch, '
                f'a chart with symbols and a floss key. Letter or A4, in your language or English.')
        image = f'/cross-stitch/img/{d["id"]}.jpg'
        pic = f'<figure class="hoop"><img src="{image}" width="600" height="648" alt="{esc(T)} cross stitch pattern, stitched in a hoop"></figure>'
        words = ''
        ld_main = {'@type': 'CreativeWork', 'name': f'{T} cross stitch pattern', 'url': ORIGIN + path, 'image': ORIGIN + image,
                   'description': desc, 'isAccessibleForFree': True, 'genre': 'Cross stitch pattern', 'encodingFormat': 'application/pdf',
                   'inLanguage': LANGS, 'publisher': {'@id': 'https://swiftian.com/#org'}, 'isPartOf': {'@id': 'https://coordigo.com/#site'}}
    graph = ([ld_main] if ld_main else []) + [{'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': sec['crumb'], 'item': ORIGIN + sec['path']},
        {'@type': 'ListItem', 'position': 2, 'name': h1.replace('&amp;', '&'), 'item': ORIGIN + path}]}]
    inner = f'''
  <section class="pic-page" {attrs}>
    <p class="crumb"><a href="{sec['path']}" data-t="{sec['t']}">{sec['crumb']}</a></p>
    <h1>{h1}</h1>
    <p class="count">{count}</p>
    {words}
    {lead}
    <div class="pic-grid">
      {pic}
{menu(kind, d)}
    </div>
    <div class="sheets" id="sheetPreview" aria-live="polite"></div>
    {'<iframe id="player" title="Mystery picture" hidden></iframe>' if kind == 'library' else ''}
    <nav class="pn" aria-label="More pictures">{link(prev, 'Newer')}{link(nxt, 'Older')}</nav>
  </section>
'''
    out = os.path.join(ROOT, path.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    page = head(page_title, desc, path, image, {'@context': 'https://schema.org', '@graph': graph}) + body(inner, kind)
    stitch_js = STITCH and kind == 'stitch'
    page = page.replace('<script src="/mystery/strings.js"></script>',
                        '<script src="/mystery/strings.js"></script>\n<script src="/mystery/engine.js"></script>\n'
                        + (f'<script type="application/json" id="faces">{json.dumps(FACES[d["id"]], separators=(",", ":"))}</script>\n' if d['id'] in FACES else '')
                        + (f'<script type="application/json" id="picture-words">{json.dumps(OWN[d["id"]], ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")}</script>\n' if d['id'] in OWN else '')
                        + '<script src="/library/worksheet-words.js"></script>\n<script src="/library/worksheet-site-words.js"></script>\n<script src="/library/worksheet.js"></script>'
                        + ('\n<script src="/library/stitch-words.js"></script>\n<script src="/library/stitch-draw.js"></script>\n<script src="/library/stitch.js"></script>' if stitch_js else ''), 1)
    # the worksheet's typefaces (Latin; other scripts use the reader's own fonts)
    page = page.replace('</head>', '<link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Karla:wght@400;700&family=JetBrains+Mono:wght@500;600&family=Silkscreen&display=swap" rel="stylesheet">\n</head>', 1)
    open(out, 'w').write(page)

def hub_tile(kind, d):
    if kind == 'library': return tile(d)
    if kind == 'stitch':
        f = stitch_facts(d)
        return (f'<a class="tile" href="/cross-stitch/{d["id"]}/"><div class="face hoop"><img src="/cross-stitch/img/{d["id"]}.jpg" width="600" height="648" '
                f'loading="lazy" alt="{esc(d["title"])} cross stitch pattern"></div><div class="t">{esc(d["title"])}</div><div class="d">{f["W"]} × {f["H"]} stitches · {f["colors"]} colours</div></a>')
    return (f'<a class="tile" href="/worksheets/{d["id"]}/"><div class="face"><img src="/library/img/{d["id"]}.png" width="600" height="600" '
            f'loading="lazy" alt="{esc(d["title"])} mystery picture worksheet"></div><div class="t">{esc(d["title"])}</div><div class="d">Free worksheet · {esc(length(d))}</div></a>')

HUB = {
    # each section in its own words for its own readers; no count (founder 2026-11-08: the number is no boast and will grow,
    # and the two need not advertise that they share their pictures)
    'library': {'h1': 'Mystery pictures to plot',
                'sub': 'Each worksheet hides a picture in a list of coordinates. Plot the points on the grid, join them in order and watch it '
                       'appear; the answer is on the back page. Print it free on Letter or A4, in your language or English.',
                'title': 'Free Mystery Picture Worksheets · Coordinate Graphing PDFs · Coordigo',
                'desc': 'Free printable mystery picture worksheets: plot coordinates on a 16 × 16 grid, join the points and a picture appears. '
                        'Answer page included. PDF for Letter or A4, in your language or English.'},
    'stitch': {'h1': 'Small cross stitch patterns',
               'sub': 'Little designs that fit in a 10 cm hoop, about 5 cm across on 14 count Aida. Every pattern comes with a symbol chart, '
                      'a DMC floss key and a short stitch guide. Free PDF for Letter or A4, in your language or English.',
               'title': 'Free Cross Stitch Patterns · Small PDF Charts with DMC Key · Coordigo',
               'desc': 'Free small counted cross stitch patterns: symbol charts, DMC floss keys and a stitch guide, about 5 cm on 14 count Aida. '
                       'PDF for Letter or A4, in your language or English.'},
}
def hub_page(kind, k):
    sec = SEC[kind]; base = sec['path']; path = base if k == 1 else f'{base}{k}/'
    items = newest[(k - 1) * PER: k * PER]
    pager = ''.join(f'<a href="{base if i == 1 else f"{base}{i}/"}"{" aria-current=\"page\"" if i == k else ""}>{i}</a>' for i in range(1, pages + 1))
    h = HUB[kind]
    inner = f'''
  <section>
    <h1 style="font-size:28px;margin:6px 0 4px">{h['h1']}</h1>
    <p class="sub">{h['sub']}</p>
    <div class="grid" style="margin-top:16px">{''.join(hub_tile(kind, d) for d in items)}</div>
    <nav class="pager" aria-label="Pages">{pager}</nav>
  </section>
'''
    first = items[0]['id']
    image = f'/cross-stitch/img/{first}.jpg' if kind == 'stitch' else f'/library/img/{first}.png'
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': h['h1'], 'url': ORIGIN + path, 'description': h['desc'],
          'isPartOf': {'@id': 'https://coordigo.com/#site'}}
    out = os.path.join(ROOT, path.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write(head(h['title'] + ('' if k == 1 else f' · page {k}'), h['desc'], path, image, ld) + body(inner, kind))

# the two sections are made again from nothing each time (the hoop images stay: tools/stitch-hoops.py makes them)
shutil.rmtree(os.path.join(ROOT, 'worksheets'), ignore_errors=True)   # merged into /library/ (founder 2026-11-08)
for sec in ('cross-stitch',):
    base = os.path.join(ROOT, sec); os.makedirs(base, exist_ok=True)
    for name in os.listdir(base):
        if name != 'img':
            q = os.path.join(base, name); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)

order = newest + messages
for i, d in enumerate(order):
    sheet_page('library', d, order[i - 1] if i > 0 else None, order[i + 1] if i + 1 < len(order) else None)
for k in range(1, pages + 1): hub_page('library', k)
for kind in (('stitch',) if STITCH else ()):
    for k in range(1, pages + 1): hub_page(kind, k)
    for i, d in enumerate(newest):
        sheet_page(kind, d, newest[i - 1] if i > 0 else None, newest[i + 1] if i + 1 < len(newest) else None)

# MARK: Sitemap — every Library page, each picture's page with its image
sm_path = os.path.join(ROOT, 'sitemap.xml'); sm = open(sm_path).read()
sm = re.sub(r'\s*<url><loc>https://coordigo\.com/(?:library|worksheets|cross-stitch|postcards)/[^<]*</loc>.*?</url>', '', sm, flags=re.S)
if 'xmlns:image' not in sm:
    sm = sm.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"', 1)
urls = [f'  <url><loc>{ORIGIN}/library/</loc></url>'] + [f'  <url><loc>{ORIGIN}/library/{k}/</loc></url>' for k in range(2, pages + 1)]
urls += [f'  <url><loc>{ORIGIN}/library/{d["id"]}/</loc><image:image><image:loc>{ORIGIN}/library/img/{d["id"]}.png</image:loc></image:image></url>' for d in order]
for base, img in ([('cross-stitch', lambda i: f'/cross-stitch/img/{i}.jpg')] if STITCH else []):
    urls += [f'  <url><loc>{ORIGIN}/{base}/</loc></url>'] + [f'  <url><loc>{ORIGIN}/{base}/{k}/</loc></url>' for k in range(2, pages + 1)]
    urls += [f'  <url><loc>{ORIGIN}/{base}/{d["id"]}/</loc><image:image><image:loc>{ORIGIN}{img(d["id"])}</image:loc></image:image></url>' for d in newest]
sm = sm.replace('</urlset>', '\n'.join(urls) + '\n</urlset>')
open(sm_path, 'w').write(sm)
print(f'{len(data)} pictures · {pages} Library pages · {len(order)} picture pages · cross stitch: {pages} hub pages and {len(newest)} pages')
