#!/usr/bin/env bash
#
# Writes constants/licences.ts from the installed dependency tree.
#
# Generated but committed, following scripts/generate-icons.sh: the build does
# not depend on this having been run, but this is the only sanctioned way to
# change the output. A hand-maintained list would be wrong within one dependency
# bump, and the obligation is legal rather than cosmetic.
#
# Run after any change to package.json's dependencies:
#
#     ./scripts/generate-licences.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PYTHON'
import json, os, pathlib

root = pathlib.Path(".")
pkg = json.loads((root / "package.json").read_text())

def manifest(name):
    """The installed package.json for a dependency, or None."""
    path = root / "node_modules" / pathlib.Path(*name.split("/")) / "package.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None

def licence_of(data):
    """npm has used three shapes for this field over the years."""
    value = data.get("license") or data.get("licenses")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("type", "See package")
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return first.get("type", "See package")
        return str(first)
    return "See package"

# Transitive closure over runtime dependencies only. devDependencies are not
# shipped, so they carry no distribution obligation.
seen = {}
queue = list(pkg.get("dependencies", {}).keys())
while queue:
    name = queue.pop()
    if name in seen:
        continue
    data = manifest(name)
    if data is None:
        # Not installed: an optional peer, or a platform-specific package that
        # this machine skipped. Recorded so a reader can tell the difference
        # between "no obligation" and "not looked at".
        seen[name] = {"version": "not installed", "licence": "unknown"}
        continue
    seen[name] = {
        "version": data.get("version", "unknown"),
        "licence": licence_of(data)
    }
    queue.extend(data.get("dependencies", {}).keys())

lines = [
    "/**",
    " * Open-source licences, for the About screen.",
    " *",
    " * GENERATED FILE — do not edit by hand.",
    " * Regenerate with ./scripts/generate-licences.sh after changing dependencies.",
    " */",
    "",
    "export type Licence = {",
    "    name: string;",
    "    version: string;",
    "    licence: string;",
    "};",
    "",
    "export const LICENCES: readonly Licence[] = ["
]
for name in sorted(seen):
    entry = seen[name]
    lines.append(
        '    {name: %s, version: %s, licence: %s},'
        % (json.dumps(name), json.dumps(entry["version"]), json.dumps(entry["licence"]))
    )
lines.append("];")
lines.append("")

pathlib.Path("constants/licences.ts").write_text("\n".join(lines))
print("Wrote constants/licences.ts with %d packages." % len(seen))
PYTHON
