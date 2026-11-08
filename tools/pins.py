#!/usr/bin/env python3
"""Pinterest pins for coordigo.com, sent by RSS (founder 2026-11-08, RDM-co-pinterest-rss).
Two boards, one feed each; Pinterest auto-publishes each feed's new items to its board.
  ws  Mystery Picture Worksheets  pins/worksheets.xml    image: the two sheets + the picture  link: /library/<id>/
  xs  Free Cross Stitch Patterns  pins/cross-stitch.xml  image: pattern + chart + the hoop     link: /cross-stitch/<id>/
Each link carries utm_campaign=web-co-pin-<board>; the pages use it as the App Store ct for the visit (tools/library-pages.py).

  tools/pins.py render [--board ws|xs] [--ids a,b] [--force]   pin images (1000x1500 JPEG) in pins/<board>/<id>.jpg, from the built pages
  tools/pins.py plan [--start YYYY-MM-DD] [--force]             pins/plan.json: the day each pin goes out (kept once made)
  tools/pins.py feed [--date YYYY-MM-DD]                        the two feeds: the pins of the last 3 days
  tools/pins.py check                                           PASS/FAIL: every planned pin has its image and page

Pace (founder 2026-11-08: 20-30 the first day, then 10-15 a day, not hundreds at once): 12 a board on day 1, then 10 a board a day (founder 2026-11-08: 6 was too slow).
Order: Christmas, winter, New Year, Thanksgiving and autumn first; then the site's order; Valentine's last. Halloween waits for
2027-09-01 so it goes out ahead of its season. The same picture's two pins are two days apart.
The mini runs tools/pins-daily.sh each morning: feed, commit, push. Run render after pictures or titles change."""
import concurrent.futures, datetime, hashlib, functools, html, http.server, json, pathlib, re, subprocess, sys, tempfile, threading
from email.utils import format_datetime

SITE = pathlib.Path(__file__).resolve().parent.parent
ORIGIN = 'https://coordigo.com'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
BOARDS = {'ws': {'dir': 'library', 'feed': 'worksheets.xml', 'name': 'Mystery Picture Worksheets'},
          'xs': {'dir': 'cross-stitch', 'feed': 'cross-stitch.xml', 'name': 'Free Cross Stitch Patterns'}}
FIRST, DAILY, DAYS = 12, 10, 3   # a feed lists only its last 3 days: Pinterest reads it daily, and an item already pinned is never touched again
SEASONS = [w.split() for w in (   # taken in turn, so the first days mix them
    'turkey pie roast cornucopia pilgrim-hat cranberry-sauce harvest-table',
    'xmas-tree santa-hat gingerbread reindeer sleigh stocking candy-cane wreath bauble gift-box holly bell snowman snowVillage iso-house fireplace',
    'harvest-moon maple-leaf rake-leaves squirrel genre-fox geese apple-branch wheat-sheaf corn pumpkin-patch chestnuts',
    'mittens scarf beanie sweater ice-skate polar-bear game-penguin penghy pine-cone mandarins',
    'clock fireworks popper party-hat cups-clinking sunrise tteokguk')]
VALENTINE = 'chocolate-box heart-cookies love-lock lovebirds ring-box heart-cake genre-love bow-quiver arrow-heart heart-balloon strawberries genre-rose'.split()
HALLOWEEN = 'treat-bag cauldron spider-web haunted-house jack-o-lantern witch-hat mummy slime skull broomstick genre-bat genre-ghost tombstone candy-corn witch-moon'.split()
HALLOWEEN_FROM = datetime.date(2027, 9, 1)
SMALL = {'a', 'an', 'the', 'on', 'of', 'and', 'in', 'with', 'at', 'through', 'to', 'over', 'its'}

def tagged(i, words): return any(i == w or i.endswith('-' + w) for w in words)
def ids(): return list(json.load(open(SITE / 'tools' / 'page-files.json'))['library'])
def page(board, i): return SITE / BOARDS[board]['dir'] / i / 'index.html'
def url(board, i): return f'{ORIGIN}/{BOARDS[board]["dir"]}/{i}/'
def img(board, i): return SITE / 'pins' / board / f'{i}.jpg'

def words(i):
    """What a pin says, read from the built pages, so the pin and its page never disagree."""
    ws, xs = page('ws', i).read_text(), page('xs', i).read_text()
    h1 = html.unescape(re.search(r'<h1[^>]*>(.*?)</h1>', ws).group(1))
    name = re.sub(r'^#\d+\s+', '', h1[:-len(' coordinate graphing worksheet')] if h1.endswith(' coordinate graphing worksheet') else h1)
    name = ' '.join(w if (k and w.lower() in SMALL) or w.isupper() else w[:1].upper() + w[1:] for k, w in enumerate(name.split()))
    pts = re.search(r'(\d+) lines · (\d+) points', ws)
    meta = lambda h, n: html.unescape(re.search(rf'<meta name="{n}" content="([^"]*)"', h).group(1))
    title = lambda h: html.unescape(re.search(r'<title>(.*?)</title>', h).group(1)).replace(' · Coordigo', '')
    st = re.search(r'(\d+) × (\d+) stitches, (\d+) DMC', meta(xs, 'description'))
    w, h, c = map(int, st.groups())
    return {'name': name, 'points': int(pts.group(2)) if pts else 0, 'w': w, 'h': h, 'colours': c,
            'cm': round(max(w, h) / 14 * 2.54), 'ws_title': title(ws), 'xs_title': title(xs),
            'ws_desc': meta(ws, 'description'), 'xs_desc': meta(xs, 'description')}

# ---------- images ----------
CSS = '''*{box-sizing:border-box;margin:0} html,body{width:1000px;height:1500px;overflow:hidden}
body{font-family:Karla,sans-serif;color:#1b1917;display:flex;flex-direction:column}
.top{padding:70px 72px 0;text-align:center}
.kicker{font:700 22px/1 Karla;letter-spacing:.22em;text-transform:uppercase;color:#d02670}
h1{font:400 84px/1.02 "Young Serif",serif;margin:22px 0 0;letter-spacing:-.01em} h1.m{font-size:68px} h1.s{font-size:56px}
.sub{font:500 29px/1.35 Karla;color:#5f584c;margin:20px auto 0;max-width:780px}
.stage{flex:1;position:relative;display:flex;align-items:center;justify-content:center}
.comp{position:relative;width:1000px;height:820px}
.foot{display:flex;align-items:center;justify-content:center;gap:14px;padding:0 0 58px;font:700 27px Karla;letter-spacing:.02em}
.foot img{width:40px;height:40px;border-radius:10px}
.free{display:inline-block;margin-top:26px;background:#1b1917;color:#fff;font:700 24px/1 Karla;letter-spacing:.14em;padding:14px 26px;border-radius:999px}
.page{position:absolute;background:#fff;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,.12),0 26px 60px rgba(60,45,20,.22)}
.card{position:absolute;background:#fff;padding:12px;border-radius:10px;box-shadow:0 2px 4px rgba(0,0,0,.14),0 22px 50px rgba(40,30,10,.25)}
.card img{display:block;width:100%}
/* the hoop JPEG is on white: cut it out along the hoop's circle (the brass hanger's gaps are white, so it goes), not multiply-blended (that showed the page through the fabric) */
.hoop{position:absolute;width:290px;transform:rotate(-8deg);filter:drop-shadow(0 2px 3px rgba(0,0,0,.18)) drop-shadow(0 18px 30px rgba(40,30,10,.25))}
.hoop img{display:block;width:100%;-webkit-mask:radial-gradient(48.4% 44.8% at 50% 53.2%,#000 99%,transparent 100%);mask:radial-gradient(48.4% 44.8% at 50% 53.2%,#000 99%,transparent 100%)}'''

def pin_html(board, i, B):
    w = words(i); e = html.escape
    files = json.load(open(SITE / 'tools' / 'page-files.json'))['library' if board == 'ws' else 'stitch'][i]['img']
    size = '' if len(w['name']) <= 16 else ' class="m"' if len(w['name']) <= 24 else ' class="s"'
    if board == 'ws':
        bg, top = '#ece5d7', (f'<div class="kicker">Mystery picture worksheet</div><h1{size}>{e(w["name"])}</h1><div class="sub">Plot '
                              f'{w["points"]} points on a 16 × 16 grid, join the lines and the picture appears. Answer page included.</div>')
        comp = (f'<img class="page" src="{B}{files[0]}" style="width:470px;left:70px;top:20px;transform:rotate(-4deg)">'
                f'<img class="page" src="{B}{files[1]}" style="width:470px;right:70px;top:80px;transform:rotate(3deg)">'
                f'<div class="card" style="width:220px;left:50px;top:560px;transform:rotate(-6deg)"><img src="{B}/library/img/{i}.png"></div>'
                '<div style="position:absolute;right:90px;top:720px"><span class="free">FREE PDF · LETTER / A4</span></div>')
    else:
        bg, top = '#e9e2d3', (f'<div class="kicker">Free cross stitch pattern</div><h1{size}>{e(w["name"])}</h1><div class="sub">Symbol chart and '
                              f'DMC floss key. {w["w"]} × {w["h"]} stitches, {w["colours"]} colours, about {w["cm"]} cm on 14-count Aida.</div>')
        comp = (f'<img class="page" src="{B}{files[0]}" style="width:450px;left:70px;top:50px;transform:rotate(-3deg)">'
                f'<img class="page" src="{B}{files[1]}" style="width:480px;right:60px;top:20px;transform:rotate(2.5deg)">'
                f'<div class="hoop" style="left:40px;top:500px"><img src="{B}/cross-stitch/img/{i}.jpg"></div>'
                '<div style="position:absolute;right:90px;top:720px"><span class="free">FREE PDF CHART</span></div>')
    return (f'<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Karla:wght@400;500;700&display=swap" rel="stylesheet">'
            f'<style>{CSS} body{{background:{bg}}}</style><div class="top">{top}</div><div class="stage"><div class="comp">{comp}</div></div>'
            f'<div class="foot"><img src="{B}/art/icon-512.png">coordigo.com</div>')

def render(args):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    B = f'http://127.0.0.1:{srv.server_address[1]}'
    boards = [args[args.index('--board') + 1]] if '--board' in args else list(BOARDS)
    only = set(args[args.index('--ids') + 1].split(',')) if '--ids' in args else None
    todo = [(b, i) for b in boards for i in ids() if (not only or i in only) and ('--force' in args or not img(b, i).exists())]
    tmp = pathlib.Path(tempfile.mkdtemp())
    def one(job):
        b, i = job; h = tmp / f'{b}-{i}.html'; png = tmp / f'{b}-{i}.png'
        h.write_text(pin_html(b, i, B))
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp / ("u-" + b + i)}',
                        '--window-size=1000,1500', '--virtual-time-budget=10000', f'--screenshot={png}', f'file://{h}'],
                       capture_output=True, timeout=180)
        if not png.exists(): return f'FAIL {b} {i}'
        img(b, i).parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', str(png), '--out', str(img(b, i))], capture_output=True)
        return None
    n = 0
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        for r in ex.map(one, todo):
            n += 1
            if r: print(r, file=sys.stderr)
            if n % 20 == 0 or n == len(todo): print(f'render {n}/{len(todo)}', file=sys.stderr)
    srv.shutdown()
    check([])

# ---------- plan and feeds ----------
def plan(args):
    p = SITE / 'pins' / 'plan.json'
    if p.exists() and '--force' not in args: sys.exit(f'{p} is kept once made (it says which pins went out); --force to remake')
    start = datetime.date.fromisoformat(args[args.index('--start') + 1]) if '--start' in args else datetime.date.today()
    all_ = ids()
    hold = [i for i in all_ if tagged(i, HALLOWEEN)]
    groups = [[i for i in all_ if tagged(i, g) and i not in hold] for g in SEASONS]
    first = []
    for k in range(max(map(len, groups))): first += [g[k] for g in groups if k < len(g) and g[k] not in first]
    late = [i for i in all_ if tagged(i, VALENTINE) and i not in hold + first]
    mid = [i for i in all_ if i not in first + late + hold]
    order = first + mid + late
    queues = {'ws': order, 'xs': order[FIRST:len(first)] + order[:FIRST] + order[len(first):]}   # the same picture two days apart
    def days(q, d0):
        out = []
        for k, i in enumerate(q):
            day = 0 if k < FIRST else 1 + (k - FIRST) // DAILY
            out.append({'id': i, 'date': (d0 + datetime.timedelta(days=day)).isoformat()})
        return out
    data = {'made': datetime.date.today().isoformat(), 'first': FIRST, 'daily': DAILY,
            'boards': {b: days(q, start) + days(hold, HALLOWEEN_FROM) for b, q in queues.items()}}
    p.parent.mkdir(exist_ok=True); p.write_text(json.dumps(data, indent=1) + '\n')
    for b, q in data['boards'].items():
        print(f'{b}: {len(q)} pins, {q[0]["date"]} to {q[len(order) - 1]["date"]}; Halloween {len(hold)} from {HALLOWEEN_FROM}')

def feed(args):
    today = args[args.index('--date') + 1] if '--date' in args else datetime.date.today().isoformat()
    data = json.load(open(SITE / 'pins' / 'plan.json'))
    for b, cfg in BOARDS.items():
        since = (datetime.date.fromisoformat(today) - datetime.timedelta(days=DAYS - 1)).isoformat()
        due = sorted([x for x in data['boards'][b] if since <= x['date'] <= today and not x.get('sent')], key=lambda x: x['date'], reverse=True)   # sent: pinned by hand, not by the feed
        items = []
        slot = {}   # an item's minute within its own day, from the plan's order: it never changes once the item is out
        for x in data['boards'][b]: slot[x['id']] = sum(1 for y in slot if y != x['id'] and next(z for z in data['boards'][b] if z['id'] == y)['date'] == x['date'])
        for x in due:
            n = slot[x['id']]
            i = x['id']; w = words(i); f = img(b, i)
            if not f.exists(): sys.exit(f'FAIL no image {f} — run tools/pins.py render first')
            v = x.get('v', 1)   # v2+: sent again after its pin was deleted (a new guid and link, or Pinterest skips it)
            link = f'{url(b, i)}?utm_source=pinterest&amp;utm_medium=social&amp;utm_campaign=web-co-pin-{b}' + (f'&amp;utm_content=v{v}' if v > 1 else '')
            when = datetime.datetime.fromisoformat(x['date'] + 'T07:00:00+09:00') - datetime.timedelta(minutes=n)
            # Pinterest keeps the first image it fetched for an address (2026-11-09: re-made pins came back with the old hoop),
            # so an image's address carries its content hash: a re-made image is always a new address. Items before 11-09 keep theirs.
            src = f'{ORIGIN}/pins/{b}/{i}.jpg' + (f'?v={hashlib.md5(f.read_bytes()).hexdigest()[:8]}' if x['date'] >= '2026-11-09' else '')
            items.append(f'''  <item>
   <title>{html.escape(w[b + "_title"])}</title>
   <link>{link}</link>
   <guid isPermaLink="false">coordigo-pin-{b}-{i}{"-v" + str(v) if v > 1 else ""}</guid>
   <pubDate>{format_datetime(when)}</pubDate>
   <description>{html.escape(w[b + "_desc"])}</description>
   <enclosure url="{src}" length="{f.stat().st_size}" type="image/jpeg"/>
   <media:content url="{src}" medium="image" type="image/jpeg" width="1000" height="1500"/>
  </item>''')
        xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/pins/feed.xsl"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n <channel>\n'
               f'  <title>Coordigo · {cfg["name"]}</title>\n  <link>{ORIGIN}/{cfg["dir"]}/</link>\n'
               f'  <description>{cfg["name"]} from coordigo.com: free printable PDFs.</description>\n  <language>en</language>\n'
               + '\n'.join(items) + '\n </channel>\n</rss>\n')
        out = SITE / 'pins' / cfg['feed']
        if not out.exists() or out.read_text() != xml: out.write_text(xml)
        total = len([x for x in data['boards'][b] if x['date'] <= today])
        print(f'{b} {cfg["feed"]}: {total}/{len(data["boards"][b])} out by {today}, feed lists {len(items)}')

def check(args):
    data = json.load(open(SITE / 'pins' / 'plan.json')) if (SITE / 'pins' / 'plan.json').exists() else None
    want = [(b, x['id']) for b in BOARDS for x in data['boards'][b]] if data else [(b, i) for b in BOARDS for i in ids()]
    bad = [f'{b} {i}' for b, i in want if not img(b, i).exists() or not page(b, i).exists()]
    for x in bad[:10]: print('missing', x, file=sys.stderr)
    print(f'{"PASS" if not bad else "FAIL"} pins {len(want) - len(bad)}/{len(want)} with image and page')
    if bad: sys.exit(1)

if __name__ == '__main__':
    a = sys.argv[1:] or ['check']
    {'render': render, 'plan': plan, 'feed': feed, 'check': check}[a[0]](a[1:])
