#!/bin/sh
# The site's Library is a copy of the app's, made again by this script — run it after the Library changes in Coordigo.
#   tools/library-sync.sh [Coordigo repo] <ref>
# It exports <ref> clean (never the working tree), builds each picture's code with the app's own Swift (scripts/web-library.py),
# reads them with the site's engine, takes the answer's colour faces from the app's code (tools/worksheet-ref.py) and the
# worksheet's words from the app's catalog (tools/worksheet-words.py), and rewrites library/ (PNGs, pages, sitemap).
# Then: tools/worksheet-parity.py, review, commit, push.
set -e
REPO=${1:-$HOME/Projects/Coordigo}; REF=${2:?name the Coordigo ref, e.g. main}
SITE=$(cd "$(dirname "$0")/.." && pwd); TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/src" "$TMP/out"
git -C "$REPO" archive "$REF" Sources Tests/Web scripts | tar -x -C "$TMP/src"
# until Coordigo fixes it (INC-2026-11-04-co-web-library-script-stale): the script's source list lacks Faces.swift
grep -q Faces.swift "$TMP/src/scripts/web-library.py" || sed -i '' 's|"Sources/CoordigoKit/Palette.swift"\]|"Sources/CoordigoKit/Palette.swift", "Sources/CoordigoKit/Faces.swift"]|' "$TMP/src/scripts/web-library.py"
(cd "$TMP/src" && python3 scripts/web-library.py "$TMP/out" >/dev/null)
node "$SITE/tools/library-data.mjs" "$TMP/out/library.js" > "$TMP/lib.json"
python3 "$SITE/tools/worksheet-ref.py" "$TMP/src" faces "$TMP/faces.json"
python3 "$SITE/tools/worksheet-words.py" "$TMP/src/Sources/Resources/Localizable.xcstrings"
python3 "$SITE/tools/library-pages.py" "$TMP/lib.json" "$TMP/src/Sources/Resources/Mystery/library.json" "$TMP/faces.json" \
  "$TMP/src/Sources/Resources/Mystery/messages.json" "$TMP/src/Sources/Resources/Localizable.xcstrings"
echo "from $(git -C "$REPO" rev-parse --short "$REF") ($REF)"
