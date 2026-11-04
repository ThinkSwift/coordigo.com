#!/usr/bin/env python3
"""Build tools/worksheet-ref.swift with Coordigo's sources (a clean export of a ref, never the working tree) and the
WorksheetPage part of Print.swift as it is, and run it.

  tools/worksheet-ref.py <Coordigo source dir> faces <out.json>
  tools/worksheet-ref.py <Coordigo source dir> pages <out dir> <id> <letter|a4> <title> <words> <answer> <label>
"""
import json, pathlib, re, subprocess, sys, tempfile
SRC = pathlib.Path(sys.argv[1]); HERE = pathlib.Path(__file__).resolve().parent
BIN = pathlib.Path(tempfile.gettempdir()) / 'co-worksheet-ref'

def build():
    print_swift = (SRC / 'Sources/Coordigo/Print.swift').read_text()
    part = print_swift[print_swift.index('enum PaperSize'):print_swift.index('// MARK: - The PDF')]
    # PrintOptions.for reads the app's Settings; the tool sets the options itself
    part = re.sub(r'\n    /// A picture\'s page as it first comes.*?\n    }\n', '\n', part, flags=re.S)
    # the app's icon from its asset catalog (a command-line tool has no bundle to name it from)
    mark = SRC / 'Sources/Resources/Assets.xcassets/PrintMark.imageset/printmark.png'
    part = part.replace('NSImage(named: "PrintMark")', f'NSImage(contentsOfFile: "{mark}")')
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / 'Worksheet.swift').write_text('import Foundation\nimport CoreText\nimport AppKit\nimport SwiftUI\n\n' + part)
    (tmp / 'main.swift').write_text((HERE / 'worksheet-ref.swift').read_text())
    srcs = sorted(map(str, (SRC / 'Sources/CoordigoKit/Mystery').glob('*.swift'))) + [str(SRC / p) for p in [
        'Sources/Coordigo/Paper.swift', 'Sources/Coordigo/Atoms.swift', 'Sources/Coordigo/MysterySegments.swift',
        'Sources/CoordigoKit/Drawing.swift', 'Sources/CoordigoKit/Palette.swift', 'Sources/CoordigoKit/Faces.swift']]
    subprocess.run(['swiftc', '-O', '-o', str(BIN), str(tmp / 'main.swift'), str(tmp / 'Worksheet.swift'), *srcs], check=True)

build()
mystery = str(SRC / 'Sources/Resources/Mystery')
if sys.argv[2] == 'faces':
    ids = [e['id'] for e in json.loads((SRC / 'Sources/Resources/Mystery/library.json').read_text())]
    out = subprocess.run([str(BIN), 'faces', mystery, *ids], check=True, capture_output=True).stdout
    pathlib.Path(sys.argv[3]).write_bytes(out)
    print(f'faces: {len(json.loads(out))} pictures')
else:
    subprocess.run([str(BIN), 'pages', mystery, *sys.argv[3:]], check=True)
