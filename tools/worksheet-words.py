#!/usr/bin/env python3
"""The worksheet's words in the app's 19 languages, from Coordigo's string catalog (Localizable.xcstrings), for
library/worksheet.js. Never typed by hand: re-run when the app's catalog changes (tools/library-sync.sh does).

  tools/worksheet-words.py <Localizable.xcstrings>   → library/worksheet-words.js
"""
import json, pathlib, sys
KEYS = {  # on the page (Print.swift WorksheetPage)
        'heading': 'Mystery Picture', 'key': 'Join the points in order: first digit across, second down. At | lift the pen and start a new line.',
        'code': 'Code', 'counts': '%lld lines · %lld points', 'yourPicture': 'Your picture',
        'common': 'Common', 'rare': 'Rare', 'epic': 'Epic', 'legendary': 'Legendary',
        # in the menu (the app's worksheet sheet and Settings › Worksheets)
        'worksheet': 'Worksheet', 'paper': 'Paper', 'letter': 'Letter', 'a4': 'A4', 'answerPage': 'Answer page in color',
        'noteField': 'Your words · optional, on the puzzle page (Class: Name:)',
        'print': 'Print', 'sharePDF': 'Share as PDF'}
cat = json.loads(pathlib.Path(sys.argv[1]).read_text())['strings']
out = {'en': {k: v.replace('%lld', '%@') for k, v in KEYS.items()}}
for k, src in KEYS.items():
    for lang, loc in cat[src].get('localizations', {}).items():
        u = loc.get('stringUnit') or {}
        if u.get('state', 'translated') in ('translated', 'needs_review') and u.get('value'):
            out.setdefault(lang, {})[k] = u['value'].replace('%lld', '%@').replace('$lld', '$@')
langs = sorted(out)
missing = [(l, k) for l in langs for k in KEYS if k not in out[l]]
if missing: sys.exit(f'missing: {missing}')
site = pathlib.Path(__file__).resolve().parent.parent
(site / 'library/worksheet-words.js').write_text(
    "// The worksheet's words as the app prints them (Coordigo Localizable.xcstrings via tools/worksheet-words.py).\n"
    "window.CO_WORKSHEET_WORDS = " + json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True) + ";\n")
print(f'worksheet words: {len(langs)} languages × {len(KEYS)}')
