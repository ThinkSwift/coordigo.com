#!/usr/bin/env python3
"""The turn player's Library: id -> number, tier, code, colours, title and message (English for now), made from the app.
   tools/turn-library.py [Coordigo repo] [ref]   (default ~/Projects/Coordigo, co-6.3) -> turn/library.js
Run it when the Library changes in Coordigo, then tools/turn-check.mjs. Never edit turn/library.js by hand."""
import json, subprocess, sys, os
repo = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Projects/Coordigo')
ref = sys.argv[2] if len(sys.argv) > 2 else 'co-6.3'
show = lambda p: json.loads(subprocess.check_output(['git', '-C', repo, 'show', f'{ref}:{p}']))
lib = show('Sources/Resources/Mystery/library.json')
msgs = show('Sources/Resources/Mystery/messages.json')
out = {}
for e in lib:
    m = msgs.get(e['id'], {})
    out[e['id']] = [e['number'], e['tier'], e['d'], e['c'], (m.get('t') or {}).get('en-US') or e['title'], (m.get('m') or {}).get('en-US') or '']
sha = subprocess.check_output(['git', '-C', repo, 'rev-parse', '--short', ref]).decode().strip()
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'turn', 'library.js')
with open(here, 'w') as f:
    f.write(f'// Made by tools/turn-library.py from Coordigo {ref} @ {sha} — do not edit. id: [number, tier, code, colours, title, message]\n')
    f.write('window.TURN_LIBRARY = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'turn/library.js: {len(out)} pictures from {ref} @ {sha}')
