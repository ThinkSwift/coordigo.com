#!/bin/sh
# The site's Library is a copy of the app's, made again by this script — run it after the Library changes in Coordigo.
#   tools/library-sync.sh [Coordigo repo] [ref]      (defaults: ~/Projects/Coordigo, the released branch you name)
# It exports <ref> clean (never the working tree), builds each picture's code with the app's own Swift (scripts/web-library.py),
# reads them with the site's engine and rewrites library/ (PNGs, pages, sitemap). Review, commit, push.
set -e
REPO=${1:-$HOME/Projects/Coordigo}; REF=${2:?name the Coordigo ref, e.g. main}
SITE=$(cd "$(dirname "$0")/.." && pwd); TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive "$REF" Sources Tests/Web scripts | tar -x -C "$TMP"
mkdir "$TMP/out"; (cd "$TMP" && python3 scripts/web-library.py "$TMP/out" >/dev/null)
node "$SITE/tools/library-data.mjs" "$TMP/out/library.js" > "$TMP/lib.json"
python3 "$SITE/tools/library-pages.py" "$TMP/lib.json" "$TMP/Sources/Resources/Mystery/library.json"
echo "from $(git -C "$REPO" rev-parse --short "$REF") ($REF)"
