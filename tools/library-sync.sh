#!/bin/sh
# The site's Library is a copy of the app's, made again by this script — run it after the Library changes in Coordigo.
#   tools/library-sync.sh [Coordigo repo] <ref>       (ref "--worktree": the repo folder as it is, to stage ahead of a commit)
# It exports <ref> clean (never the working tree), builds each picture's code with the app's own Swift (scripts/web-library.py),
# reads them with the site's engine, takes the answer's colour faces from the app's code (tools/worksheet-ref.py) and the
# worksheet's words from the app's catalog (tools/worksheet-words.py), and rewrites library/ (PNGs, pages, sitemap).
# Then: tools/worksheet-parity.py, review, commit, push.
set -e
REPO=${1:-$HOME/Projects/Coordigo}; REF=${2:?name the Coordigo ref, e.g. main}
SITE=$(cd "$(dirname "$0")/.." && pwd); TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/src" "$TMP/out"
if [ "$REF" = "--worktree" ]; then (cd "$REPO" && tar -c Sources Tests/Web scripts) | tar -x -C "$TMP/src"
else git -C "$REPO" archive "$REF" Sources Tests/Web scripts | tar -x -C "$TMP/src"; fi
(cd "$TMP/src" && python3 scripts/web-library.py "$TMP/out" >/dev/null)
node "$SITE/tools/library-data.mjs" "$TMP/out/library.js" > "$TMP/lib.json"
python3 "$SITE/tools/worksheet-ref.py" "$TMP/src" faces "$TMP/faces.json"
python3 "$SITE/tools/worksheet-words.py" "$TMP/src/Sources/Resources/Localizable.xcstrings"
python3 "$SITE/tools/library-pages.py" "$TMP/lib.json" "$TMP/src/Sources/Resources/Mystery/library.json" "$TMP/faces.json" \
  "$TMP/src/Sources/Resources/Mystery/messages.json" "$TMP/src/Sources/Resources/Localizable.xcstrings"
echo "from $( [ "$REF" = "--worktree" ] && echo "$REPO working tree at $(git -C "$REPO" rev-parse --short HEAD)" || git -C "$REPO" rev-parse --short "$REF") ($REF)"
