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
#     npm run generate-licences
#
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PYTHON'
import json, pathlib, re

root = pathlib.Path(".")

# package-lock.json's "packages" map is npm's own record of the resolved
# tree: one entry per installed directory, keyed by its real path under
# node_modules (nested where npm could not hoist it), each carrying the
# version and licence field npm read out of *that* directory's manifest.
#
# A hand-rolled walk that only ever looks at node_modules/<name>/package.json
# cannot see a package nested under its dependent (node_modules/expo/node_modules/
# @expo/cli, for instance) and silently drops its whole subtree — that is the
# bug this generator used to have. The lockfile has already done real Node
# module resolution once, at install time; reading it back is simpler and more
# robust than reimplementing that walk here, and it is what npm itself
# considers authoritative.
lock_path = root / "package-lock.json"
if not lock_path.is_file():
    raise SystemExit("package-lock.json not found — run npm install first.")
lock = json.loads(lock_path.read_text())

LICENCE_FILE_GLOBS = ("LICEN[CS]E*", "COPYING*")

# Recognises the shape of a licence file's body when the manifest omits the
# `license` field, which is common among hand-published scoped packages (the
# Tamagui family in particular: MIT on disk, nothing in package.json).
# Ordered so a more specific match (naming a version or clause count) is tried
# before the generic boilerplate it is built from.
_TITLE_LICENCES = (
    ("blue oak model license", "BlueOak-1.0.0"),
    ("mozilla public license", "MPL-2.0"),
    ("bsd 3-clause", "BSD-3-Clause"),
    ("bsd 2-clause", "BSD-2-Clause"),
    ("gnu lesser general public license", "LGPL"),
    ("gnu general public license", "GPL"),
    ("the unlicense", "Unlicense"),
)
_BODY_LICENCES = (
    ("neither the name", "BSD-3-Clause"),
    ("redistribution and use in source and binary forms", "BSD"),
    ("permission is hereby granted, free of charge", "MIT"),
    ("permission to use, copy, modify, and/or distribute this software", "ISC"),
)


def licence_from_text(text):
    """Best-effort SPDX identifier from a LICENSE file's own wording."""
    low = text[:4000].lower()
    if "apache license" in low and "2.0" in low.split("apache license", 1)[1][:40]:
        return "Apache-2.0"
    if "creative commons" in low and "cc0" in low:
        return "CC0-1.0"
    for needle, spdx in _TITLE_LICENCES:
        if needle in low:
            return spdx
    if "mit license" in low:
        return "MIT"
    for needle, spdx in _BODY_LICENCES:
        if needle in low:
            return spdx
    return None


_COPYRIGHT_RE = re.compile(r"copyright\s*(?:\([cC]\)|©)?\s*[0-9][0-9, \-\u2013]*\s+.{0,120}", re.IGNORECASE)


def copyright_from_text(text):
    """The first copyright line, for the notice MIT and BSD both require."""
    match = _COPYRIGHT_RE.search(text)
    if not match:
        return None
    line = match.group(0).splitlines()[0].strip()
    return re.sub(r"\s+", " ", line)


def find_licence_file(directory):
    for pattern in LICENCE_FILE_GLOBS:
        matches = sorted(directory.glob(pattern))
        if matches:
            return matches[0]
    return None


def licence_field(data):
    """npm has used three shapes for this field over the years."""
    value = data.get("license") or data.get("licenses")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("type")
    if isinstance(value, list) and value:
        first = value[0]
        return first.get("type") if isinstance(first, dict) else str(first)
    return None


# name -> list of {version, licence, copyright}, one per resolved install
# location. A name can legitimately resolve more than once (two consumers
# wanting incompatible major versions, so npm could hoist only one) — every
# instance is kept here and merged, rather than the first one seen winning
# and the rest going unattributed.
by_name = {}
for path_str in sorted(lock.get("packages", {})):
    if not path_str.startswith("node_modules/"):
        continue  # the root package itself
    info = lock["packages"][path_str]
    if info.get("dev"):
        continue  # devDependencies are not shipped, so carry no obligation
    directory = root / path_str
    if not directory.is_dir():
        # Declared but not present: an optional peer, or (as with lightningcss's
        # per-platform natives) one of several mutually exclusive optional
        # variants, of which only the one matching this machine was installed.
        # Not recording a "not installed" placeholder for these: they were never
        # a candidate for this platform, which is different from a lookup that
        # failed.
        continue

    name = path_str.split("node_modules/")[-1]
    manifest_path = directory / "package.json"
    try:
        data = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError):
        data = {}

    licence = licence_field(data)
    licence_file = find_licence_file(directory)
    licence_text = None
    if licence_file is not None:
        try:
            licence_text = licence_file.read_text(errors="ignore")
        except OSError:
            licence_text = None

    if not licence and licence_text:
        licence = licence_from_text(licence_text)
    if not licence:
        licence = "See package"

    copyright_notice = copyright_from_text(licence_text) if licence_text else None

    by_name.setdefault(name, []).append({
        "version": info.get("version") or data.get("version") or "unknown",
        "licence": licence,
        "copyright": copyright_notice
    })

lines = [
    "/**",
    " * Open-source licences, for the About screen.",
    " *",
    " * GENERATED FILE — do not edit by hand.",
    " * Regenerate with `npm run generate-licences` after changing dependencies.",
    " */",
    "",
    "export type Licence = {",
    "    name: string;",
    "    version: string;",
    "    licence: string;",
    "    /** The notice MIT and BSD both require reproducing, when one was found. */",
    "    copyright?: string;",
    "};",
    "",
    "export const LICENCES: readonly Licence[] = ["
]
for name in sorted(by_name):
    instances = by_name[name]
    # Multiple installed versions of one package are merged into a single row
    # — the type keeps `name` unique, per the coverage test below — rather
    # than the non-hoisted copy being dropped on the floor.
    versions = sorted({instance["version"] for instance in instances})
    licences = sorted({instance["licence"] for instance in instances})
    copyrights = sorted({
        instance["copyright"] for instance in instances if instance["copyright"]
    })

    entry_version = ", ".join(versions)
    entry_licence = " / ".join(licences)
    entry_copyright = "; ".join(copyrights) if copyrights else None

    fields = [
        "name: %s" % json.dumps(name),
        "version: %s" % json.dumps(entry_version),
        "licence: %s" % json.dumps(entry_licence)
    ]
    if entry_copyright:
        fields.append("copyright: %s" % json.dumps(entry_copyright))
    lines.append("    {%s}," % ", ".join(fields))
lines.append("];")
lines.append("")

pathlib.Path("constants/licences.ts").write_text("\n".join(lines))
print("Wrote constants/licences.ts with %d packages." % len(by_name))
PYTHON
