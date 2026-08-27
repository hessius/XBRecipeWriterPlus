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
import hashlib, json, pathlib, re

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


# A notice line: one that opens with the word "copyright" *and* carries what a
# notice carries — a (c), a © or a year. The year/(c) test is not decoration.
# Licence prose wraps, and a wrapped line can begin with the word: GPL-2.0 §1
# breaks as "...keep intact all the\ncopyright notice and disclaimer of
# warranty...". Matching on the word alone deleted that line from the body,
# which is how "reproduced in full" quietly stopped being true.
_COPYRIGHT_LINE_RE = re.compile(
    r"^\s*copyright\b[^\n]*?(?:\([cC]\)|©|\b(?:19|20)[0-9]{2}\b)", re.IGNORECASE)


def copyright_from_text(text):
    """Every notice in the file, for the attribution MIT and BSD both require.

    All of them, not the first: the body has all of them lifted out of it (see
    below), so a file naming two holders and keeping one would drop the other
    from the screen entirely. Derived from the same predicate that does the
    lifting, so the two cannot disagree about what a notice is."""
    notices = []
    for line in text.splitlines():
        if _COPYRIGHT_LINE_RE.match(line):
            notice = re.sub(r"\s+", " ", line.strip())
            if notice not in notices:
                notices.append(notice)
    if not notices:
        return None
    return "; ".join(notices)


# A licence file's body is its text with the copyright lines lifted out. The
# copyright is what differs between two packages under the same licence — every
# MIT file names a different holder and year — so deduplicating on whole texts
# barely dedupes at all, while deduplicating on the body collapses all of MIT
# onto one entry. The permission notice, the BSD conditions and the warranty
# disclaimer all live in the body and are what the licence actually obliges us
# to reproduce; the copyright is kept per package, alongside it, in `copyright`.
def _strip_copyright_lines(text):
    return [line for line in text.splitlines() if not _COPYRIGHT_LINE_RE.match(line)]


def body_display(text):
    """The body as it will be shown: copyright removed, edges and runs of blank
    lines tidied, but paragraphs otherwise left as the package wrote them."""
    lines = [line.rstrip() for line in _strip_copyright_lines(text)]
    tidied = []
    for line in lines:
        if not line and (not tidied or not tidied[-1]):
            continue  # collapse the gap the copyright left, and any other run
        tidied.append(line)
    while tidied and not tidied[0]:
        tidied.pop(0)
    while tidied and not tidied[-1]:
        tidied.pop()
    return "\n".join(tidied)


def body_key(text):
    """What two bodies must share to be treated as the same licence: the body
    with all whitespace flattened and case folded, so formatting and line-wrap
    differences between two copies of one licence do not split them apart."""
    joined = "\n".join(_strip_copyright_lines(text))
    return re.sub(r"\s+", " ", joined).strip().lower()


def text_id(text):
    """A short, content-derived id: the licence's own name where one can be told
    from the body, then six hex of the body's hash. Derived from the body and
    not the package, so two packages with the same body land on one id, and
    stable across regenerations, so adding a package does not renumber the rest."""
    key = body_key(text)
    if not key:
        return None
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:6]
    spdx = licence_from_text(text) or "lic"
    prefix = re.sub(r"[^a-z0-9]+", "-", spdx.lower()).strip("-") or "lic"
    return "%s-%s" % (prefix, digest)


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
# id -> licence body, deduplicated. One entry per distinct body across the whole
# tree, so the hundreds of MIT packages contribute a single MIT body here and
# each merely points at it by id, rather than the file shipping the same text
# hundreds of times over.
licence_texts = {}
# Scopes whose monorepo carries one licence at its root that some of its
# published packages forget to declare individually.
#
# Not a guess dressed up as a fact: nothing is inherited unless the scope's
# other packages overwhelmingly agree on the licence named here, and if they
# ever stop agreeing the generator fails rather than quietly keeps asserting it.
# Each row records where a human verified the root licence, so the claim can be
# re-checked rather than taken on trust.
INHERITED_BY_SCOPE = {
    "@tamagui": {
        "licence": "MIT",
        "source": "https://github.com/tamagui/tamagui/blob/main/LICENSE"
    }
}

# How much of a scope must agree before a silent sibling inherits from it.
INHERITANCE_AGREEMENT = 0.9

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

    text_key = None
    if licence_text:
        text_key = text_id(licence_text)
        if text_key is not None and text_key not in licence_texts:
            licence_texts[text_key] = body_display(licence_text)

    by_name.setdefault(name, []).append({
        "version": info.get("version") or data.get("version") or "unknown",
        "licence": licence,
        "copyright": copyright_notice,
        "text": text_key,
        "note": None
    })

for scope, rule in INHERITED_BY_SCOPE.items():
    siblings = [
        instance
        for name, instances in by_name.items() if name.startswith(scope + "/")
        for instance in instances
    ]
    declared = [i for i in siblings if i["licence"] != "See package"]
    if not declared:
        continue
    agreeing = [i for i in declared if i["licence"] == rule["licence"]]
    share = len(agreeing) / len(declared)
    if share < INHERITANCE_AGREEMENT:
        raise SystemExit(
            "%s: only %d of %d packages declare %s, so the root licence can no "
            "longer be assumed for the silent ones. Re-check %s and update "
            "INHERITED_BY_SCOPE." % (scope, len(agreeing), len(declared),
                                     rule["licence"], rule["source"])
        )
    for instance in siblings:
        if instance["licence"] == "See package":
            instance["licence"] = rule["licence"]
            instance["note"] = (
                "Ships no licence of its own. Recorded as %s because that is "
                "the licence at the root of its monorepo (%s), and because %d "
                "of the %d packages under %s that do state a licence all state "
                "that one." % (rule["licence"], rule["source"], len(agreeing),
                               len(declared), scope)
            )

lines = [
    "/**",
    " * Open-source licences, for the About screen.",
    " *",
    " * GENERATED FILE — do not edit by hand.",
    " * Regenerate with `npm run generate-licences` after changing dependencies.",
    " */",
    "",
    "/**",
    " * The licence bodies, deduplicated and keyed by a content-derived id. A",
    " * `Licence.text` is a key into this table; the body is the licence with its",
    " * copyright lines lifted out (those are per package, in `copyright`), which is",
    " * what lets every MIT package share one entry here instead of shipping the",
    " * same paragraph hundreds of times.",
    " */",
    "export const LICENCE_TEXTS: Readonly<Record<string, string>> = {"
]
for text_key in sorted(licence_texts):
    lines.append("    %s: %s," % (json.dumps(text_key), json.dumps(licence_texts[text_key])))
lines.append("};")
lines.append("")
lines.extend([
    "export type Licence = {",
    "    name: string;",
    "    version: string;",
    "    licence: string;",
    "    /** The notice MIT and BSD both require reproducing, when one was found. */",
    "    copyright?: string;",
    "    /**",
    "     * Why this package's licence is recorded as it is, when the package",
    "     * itself did not say. Present only where the answer was inferred.",
    "     */",
    "    note?: string;",
    "    /**",
    "     * Key into `LICENCE_TEXTS` for the full body. Absent when the package",
    "     * shipped no licence file to reproduce.",
    "     */",
    "    text?: string;",
    "};",
    "",
    "export const LICENCES: readonly Licence[] = ["
])
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
    # One body per row: where merged instances point at different bodies (a rare
    # licence change between two installed versions) the first by id wins, which
    # is deterministic and, since they are overwhelmingly the same licence, the
    # same text anyway.
    texts = sorted({instance["text"] for instance in instances if instance.get("text")})

    entry_version = ", ".join(versions)
    entry_licence = " / ".join(licences)
    entry_copyright = "; ".join(copyrights) if copyrights else None
    notes = sorted({instance["note"] for instance in instances if instance.get("note")})
    entry_note = "; ".join(notes) if notes else None
    entry_text = texts[0] if texts else None

    fields = [
        "name: %s" % json.dumps(name),
        "version: %s" % json.dumps(entry_version),
        "licence: %s" % json.dumps(entry_licence)
    ]
    if entry_copyright:
        fields.append("copyright: %s" % json.dumps(entry_copyright))
    if entry_note:
        fields.append("note: %s" % json.dumps(entry_note))
    if entry_text:
        fields.append("text: %s" % json.dumps(entry_text))
    lines.append("    {%s}," % ", ".join(fields))
lines.append("];")
lines.append("")

pathlib.Path("constants/licences.ts").write_text("\n".join(lines))
print("Wrote constants/licences.ts with %d packages and %d distinct licence bodies."
      % (len(by_name), len(licence_texts)))
PYTHON
