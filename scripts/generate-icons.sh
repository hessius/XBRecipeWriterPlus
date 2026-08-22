#!/usr/bin/env bash
# Regenerates the raster app assets from assets/branding/xbrw-icon.svg.
#
# Requires rsvg-convert (brew install librsvg). The outputs are committed, so
# this only needs running when the SVG changes.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/branding/xbrw-icon.svg"
OUT="assets/images"

if ! command -v rsvg-convert >/dev/null 2>&1; then
    echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
    exit 1
fi

render() {
    local size="$1" dest="$2" src="${3:-$SRC}"
    rsvg-convert -w "$size" -h "$size" -b "#000000" "$src" -o "$OUT/$dest"
    echo "  $dest (${size}x${size})"
}

# Android masks an adaptive icon's foreground: only the middle ~66% is
# guaranteed to survive, and the mark fills almost the whole canvas. Rendering
# the same file for both would crop the outer ring of dots off on Android, so
# the foreground is inset into that safe zone first.
SAFE_ZONE=0.66
ADAPTIVE_SVG="$(mktemp -t xbrw-adaptive).svg"
trap 'rm -f "$ADAPTIVE_SVG"' EXIT

python3 - "$SRC" "$ADAPTIVE_SVG" "$SAFE_ZONE" <<'PYTHON'
import re, sys

source, destination, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
svg = open(source).read()

opening = re.match(r"<svg[^>]*>", svg)
if opening is None:
    raise SystemExit("no <svg> element in " + source)

box = re.search(r'viewBox="([\d.\-\s]+)"', opening.group(0))
if box is None:
    raise SystemExit("no viewBox in " + source)
_, _, width, height = (float(n) for n in box.group(1).split())

body = svg[opening.end():svg.rindex("</svg>")]
offset_x = width * (1 - scale) / 2
offset_y = height * (1 - scale) / 2

open(destination, "w").write(
    f"{opening.group(0)}"
    f'<g transform="translate({offset_x:g} {offset_y:g}) scale({scale:g})">'
    f"{body}</g></svg>"
)
PYTHON

echo "Rendering from $SRC:"
render 1024 icon.png
render 1024 adaptive-icon.png "$ADAPTIVE_SVG"
render  512 splash-icon.png
render   48 favicon.png
echo "Done."
