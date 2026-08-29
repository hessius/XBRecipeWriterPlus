# Machine integration research

XBRW++ reads and rewrites xBloom recipe cards. It does not talk to the machine.
This folder is a desk study of whether it should, what that would take, and what
becomes possible if it does.

**Researched 2026-08-29. Nothing here is hardware-verified.**

## Read this first

Everything in this folder describes a **reverse-engineered** protocol for
hardware and a cloud service nobody here controls. Three consequences follow,
and ignoring any of them will waste someone's time later.

**It can be wrong.** The best source available — `brAzzi64/xbloom-ble` — contains
two places where its own author had to correct an earlier reading after
capturing real traffic. The recipe tail byte was believed to be
`grand_water / 10` and is actually `ratio × 10`. Timing byte 2 was believed to
be bloom hold time and is actually grinder RPM. Both were confidently documented
before they were corrected. Assume more such errors are still in here.

**It can go stale.** These notes track a moving target: firmware, an Android APK,
and an undocumented HTTP API. Every file is dated. If you are reading this
long after that date, re-check before relying on it.

**It is not permission.** See "Provenance" below.

## Confidence levels

Every substantive claim carries one. They are not decoration — they are how you
decide whether to build on a statement or go and verify it first.

| Tag | Meaning |
|---|---|
| `spec` | Documented in `brAzzi64/xbloom-ble`'s MIT `PROTOCOL.md`, the canonical source |
| `corroborated` | Two or more independent projects agree |
| `single-source` | Exactly one project claims it |
| `inferred` | Deduced from reading code, not stated anywhere |
| `verified` | We have personally observed it. **Currently applies to nothing.** |

An issue derived from an `inferred` claim must say so on its face, so that
whoever picks it up knows the first task is confirmation rather than
implementation.

## Provenance

Eleven third-party projects were surveyed. **Six are MIT. Five carry no licence
at all**, which in law means all rights reserved — the same position XBRW++'s own
upstream left it in, and the reason this repo has a `NOTICE` file.

The working rule for this research:

- **Facts are free.** That command `8102` sets bypass water and dose is a fact
  about a protocol. Facts are not copyrightable and are reported freely here.
- **Expression is not.** No source code has been copied out of any surveyed
  project into this repo. Short illustrative snippets in these documents are
  quotation for the purpose of explanation.
- **Obvious implementations are fine.** Where there is only one sensible way to
  do something, doing it that way is not derivation.
- **Non-obvious borrowings get flagged.** Anything distinctive we would want to
  lean on is named — repo and author — in the landscape document, so permission
  can be sought directly rather than assumed. Most of these projects almost
  certainly omitted a licence by accident rather than intent, and asking is
  cheap.

## The files

Start with `opportunities.md` — it is the synthesis, and the other files are its
evidence.

| File | What it covers |
|---|---|
| `opportunities.md` | **Start here.** What the research changed, the opportunity list, dependency map, and my read on each |
| `identity-and-privacy.md` | The account models, and what each would cost our no-account promise |
| `recipe-overlap.md` | How much of XBRW++'s existing card encoder is already a BLE encoder |
| `ble-protocol.md` | BLE capability inventory, command tables, and where sources contradict each other |
| `cloud-api.md` | Cloud endpoints, authentication, and how share links are actually minted |
| `platform-ble.md` | BLE feasibility on Expo SDK 57 — library choice, permissions, review surface |
| `app-survey.md` | The eleven-project landscape, product patterns, and provenance flags |

The four survey files were produced by separate research passes and each defines
its own confidence vocabulary at its head. Those vocabularies are near-equivalents
of the table above rather than exact matches — `observed-in-code` and
`code-verified`, for instance, both mean "read in source", which is evidence of
intent but not of behaviour. None of them means the same as `verified` above.


## What this research is not

It does not decide anything. Sequencing, and whether any of this gets built at
all, is a separate conversation informed by these findings. Issues opened from
this work are deliberately thin stubs; they get fleshed out through
brainstorming if and when they are picked up.
