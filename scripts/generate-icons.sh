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

# Insets the whole drawing into a centred <g transform>, writing a new SVG.
#
# One helper for every output that needs a margin, so each names its own inset
# in exactly one place below rather than repeating the geometry.
#
#   fill  <fraction>  the mark's *dots* should span this fraction of the canvas.
#                     The helper measures their real bounding box and derives the
#                     scale, so the target is stated in the terms it is judged in
#                     ("the mark fills ~84% of the tile") and not as a raw factor.
#   scale <factor>    apply the factor to the raw drawing directly.
#
# The glow around the dots is a soft halo that already bleeds past them by
# design, so `fill` is measured against the crisp geometry, not the blur; the
# halo stays a halo and simply falls off a little sooner.
inset() {
    local dest="$1" mode="$2" value="$3"
    python3 - "$SRC" "$dest" "$mode" "$value" <<'PYTHON'
import re, sys

source, destination, mode, value = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
svg = open(source).read()

opening = re.match(r"<svg[^>]*>", svg)
if opening is None:
    raise SystemExit("no <svg> element in " + source)

box = re.search(r'viewBox="([\d.\-\s]+)"', opening.group(0))
if box is None:
    raise SystemExit("no viewBox in " + source)
_, _, width, height = (float(n) for n in box.group(1).split())

# The mark's real extent, from the dots themselves: the widest circle edge in
# each axis. This is what "the mark fills N% of the canvas" is measured against.
radii = [float(r) for r in re.findall(r'\br="([\d.]+)"', svg)]
xs = [float(x) for x in re.findall(r'\bcx="([\d.]+)"', svg)]
ys = [float(y) for y in re.findall(r'\bcy="([\d.]+)"', svg)]
if not xs or not ys:
    raise SystemExit("no circles to measure in " + source)
r = max(radii)
span = max(max(xs) - min(xs), max(ys) - min(ys)) + 2 * r
extent = span / max(width, height)

if mode == "fill":
    scale = value / extent
elif mode == "scale":
    scale = value
else:
    raise SystemExit("unknown mode " + mode)

body = svg[opening.end():svg.rindex("</svg>")]
# The mark is centred on the canvas, so scaling about the viewBox centre keeps
# it centred: a point at width/2 maps to itself under this transform.
offset_x = width * (1 - scale) / 2
offset_y = height * (1 - scale) / 2

open(destination, "w").write(
    f"{opening.group(0)}"
    f'<g transform="translate({offset_x:g} {offset_y:g}) scale({scale:g})">'
    f"{body}</g></svg>"
)

sys.stderr.write(
    f"    mark spans {extent * 100:.1f}% of the raw canvas; "
    f"applied scale {scale:.4f} -> {extent * scale * 100:.1f}% of the tile\n"
)
PYTHON
}

WORK="$(mktemp -d -t xbrw-icons)"
trap 'rm -rf "$WORK"' EXIT

ICON_SVG="$WORK/icon.svg"
ADAPTIVE_SVG="$WORK/adaptive.svg"

# The home-screen tile. At full bleed the mark crowded the rounded edges; inset
# so the dots fill ~76% of the tile, leaving a calmer margin.
inset "$ICON_SVG" fill 0.76

# Android masks an adaptive icon's foreground: only the middle ~66% is
# guaranteed to survive. The mark is scaled to 0.66 of the raw drawing so it
# lands well inside that safe circle. This is rendered from the raw SVG at the
# same factor as before, not from the inset tile above -- insetting an already
# inset drawing would compound to a visibly tiny Android icon.
inset "$ADAPTIVE_SVG" scale 0.66

echo "Rendering from $SRC:"
render 1024 icon.png          "$ICON_SVG"
render 1024 adaptive-icon.png "$ADAPTIVE_SVG"
# Splash and favicon keep the full mark. The splash floats on a black full
# screen with margin to spare -- expo draws it at a fixed 200 px -- and the
# 48 px favicon wants every pixel it can get, so neither shares the tile's inset.
render  512 splash-icon.png
render   48 favicon.png
echo "Done."
