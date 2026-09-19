# Machine integration roadmap

Agreed 2026-08-31, after the research in this folder.

The rest of this folder describes what is *possible*. This file is the decision
about what we are actually going to build, in what order, and why that order and
not another. It is the document to argue with; the issues it names are stubs
that get fleshed out with the brainstorming skill when their turn comes.

Nothing here has a date attached, and milestones are deliberately unnumbered so
scope can move between them without the roadmap going stale.

## The end state

One app where a recipe you wrote is a recipe you can brew. You edit it here,
write it to a card or send it straight to the machine, watch the brew happen,
note how it tasted, and — if and only if you choose to — find it in your xBloom
account too. Every one of those steps except the last works with no account, no
network, and no data leaving the device.

That end state is a single package, but it is emphatically not a single project.
It is six.

## Decisions taken

Three decisions shape everything below. They were the genuine forks; the rest
follows from them.

### Both account models, for different jobs

Issue #56 asked us to choose between a service account and per-user credentials.
The answer is both, because they serve different users.

**Sharing runs on a service account.** A user who wants to hand a recipe to a
friend should not have to log in to anything. Recipes shared this way originate
from XBRW++ rather than from the individual, which is a fair trade for requiring
nothing of them. Volume is expected to be small — on the order of ten recipes a
month — so a free-tier serverless function is adequate.

**Library features run on the user's own credentials**, and are entirely
optional. There is no way around this: reaching someone's library means being
them. The obligations that creates are in "Trust" below.

**Neither is ever a precondition.** Everything the app does today keeps working
for someone who never logs in and never shares.

### Two-way sync is the right end state, and not the right next step

The obvious objection to full two-way sync is that xBloom's API cannot support
it: list responses carry no timestamps, no ETags and no version, and the one
reference client matches recipes *by name*, so renaming a recipe silently forks
it into a duplicate.

That objection is wrong, and it is worth writing down why so nobody re-derives
it. Name matching is a limitation of that client, not of the API. Every recipe
has a `tableId`, and list returns full recipe bodies. Store the `tableId`
locally and match on it, keep a hash of the last-synced body, and you get
three-way conflict detection without any server support: local changed only,
push; remote changed only, pull; both changed, ask.

So we will build toward it — but not first. Manual push (M6) is a strict subset
of automatic sync: it builds the same `tableId` mapping and the same local
shadow copy that full sync needs. Stopping there is a usable waypoint on the
same road, and it means the conflict UI gets designed against a real library
rather than a guessed one.

### Brew, then manage, then sync

Each milestone makes the next one worth doing. Brewing from the app makes your
local library valuable. A valuable library makes management worth building. A
well-managed library is what makes sync worth its privacy cost.

Ordering the machine work ahead of the cloud work also puts the least-encumbered
block first. BLE is the only large piece with no external dependency at all — no
account decision, no server, no privacy tradeoff, and no dependence on the
unanswered question of what xBloom considers your library. It fits the current
"collects nothing" stance without amending it, and it is the block most likely
to still be buildable if xBloom changes something on their side.

That leaves cloud identity — the riskiest and least understood work — for last,
by which point we will have a real account to test against.

## Milestones

### M1 · Sharper cards

| Issue | |
|---|---|
| #52 | Grind-size guidance in the recipe editor |

Small, self-contained, and it fixes something live. Cards carry grind 40–80
while the cloud speaks 1–80, and our importer passes cloud values straight
through — so importing an espresso-band recipe today yields one that saves
happily and then fails card validation with no explanation of why. #52 covers
both the guidance and that edge case.

### M2 · Share your recipe

| Issue | |
|---|---|
| #57 | Mint an xBloom share link for a recipe |
| #69 | Service-account function: abuse control and graceful degradation |
| #70 | Amend the privacy claim for sharing |

The low-hanging fruit, and the first thing that makes XBRW++ useful to someone
who does not own it yet. There is no anonymous mint API: creating a share link
means POSTing to `tuRecipeAdd.tuhtml` as an authenticated member, taking the
integer `tableId` back, and constructing the URL client-side.

Resolves only the service-account half of #56. User credentials are untouched
here.

The risk in M2 is not load. It is that an open-source client pointing at our
endpoint means anyone can call that endpoint directly, and if the service
account gets rate-limited or suspended, sharing breaks for every user at once.
That needs minimal abuse control and a path that degrades rather than dies.

Both are built. `api/_lib/rateLimit.ts` caps per IP per hour and globally per day
and holds an idempotency lock, and `hooks/useShareRecipe.ts` turns every refusal
into a named state rather than a thrown error, so a failed mint is a sentence and
not a crash.

The third option considered was an XBRW++-to-XBRW++ link, which needs no account
and no network, offered when a mint fails. **Decided against.** The value of a
share link here is that it opens in the *official* app, which is what makes the
recipe useful to someone who does not own XBRW++. A link only another XBRW++ user
can open serves a much smaller audience, and it is a second share format to keep
working forever: its own payload, its own parser, its own migrations, and a
second answer to "why did this link not open". Recipes already travel between
XBRW++ installs through backup files. When a mint fails, the honest answer is to
say so and let the user try again.

### M3 · Brew from the app

| Issue | |
|---|---|
| #60 | BLE foundation: connect to the machine |
| #61 | Brew a recipe over BLE |
| #62 | Write the three Easy Mode slots |

The largest single block and the biggest differentiator. No account, no server,
no data leaving the device.

#60 is the foundation the others stand on. Note that the three Easy Mode slots
are the *only* recipe storage on the machine itself; the real library is
cloud-side, which is why #62 is a small feature rather than a library one.

### M4 · Watch it brew

| Issue | |
|---|---|
| #63 | Live brew telemetry over BLE |
| #71 | iOS Live Activity for an in-progress brew |

Depends on M3. The Live Activity is something the official app does not do: your
brew's progress on the lock screen, and a notification when it finishes.

One protocol trap to carry forward: the machine grinds **silently** for around
twenty seconds after commit, emitting no status frames at all. A client that
treats that gap as a stall will report a failure that did not happen.

### M5 · A library worth keeping

| Issue | |
|---|---|
| #72 | Library management: tags, filtering and search |
| #106 | Library groups: manual shelves and automatic ones |
| #73 | Browse the community recipe hub |
| #111 | Shelf ordering *(deferred out of the design, deliberately)* |

**Designed.** [`2026-09-16-library-shelves-design.md`][m5-design] is the full
design, and [`2026-09-16-library-shelves-visual.html`][m5-visual] is the drawn
version written for the beta tester group.
Implementation has not started and no plan has been written yet. This is the
current position on the roadmap.

[m5-design]: ../superpowers/specs/2026-09-16-library-shelves-design.md
[m5-visual]: ../superpowers/specs/2026-09-16-library-shelves-visual.html

The design resolves #72 and #106 into one mechanism: **every shelf is a query.**
An automatic shelf queries index columns, a manual shelf queries a tag, and
there is no shelf table at all. It also settles sorting, favourites, what a row
says about itself, and a third deck on the recipe screen for everything that is
neither a brew parameter nor a stage.

One question was deliberately left to testers: what a shelf's mark looks like.
Three candidates shipped behind a LABS row, and the answer came back as a glyph
for an automatic shelf and a mosaic of its recipes for a manual one. The row is
gone with the question.

#55 was the original post-brew notes and rating issue. It was closed as not
planned on 14 September, superseded by the #95 chain, which owns rating capture
properly. This design consumes a rating and does not capture one, except for the
hand-entered case, where rating a recipe writes a brew the app did not watch so
that a card-only user is not locked out of every rating-derived feature.

All local, all offline, all available to someone who never logs in. This is the
milestone that improves on the official app rather than catching up to it —
xBloom's own library management is thin.

The community hub at `collective.xbloom.com` is **unauthenticated**, so browsing
and importing public recipes needs no account and belongs here rather than in
M6.

#106 is the tester-suggested extension of #72: groups as playlists, manual and
automatic. It shares #72's refactor and its surface, and it borrows the media
player's *organisation* without its *transport* — a playlist plays in sequence
and a recipe group does not.

M5 also carries the one refactor on this roadmap. `RecipeDatabase.ts` stores
each recipe as an opaque JSON blob keyed by uuid, and you cannot filter, sort or
group a blob. The migration promotes filterable fields to real columns while the
blob stays the only source of truth, every column being a cache rebuildable from
it.

Note that cloud sync state needed no side table in the end. M6 put `cloudId` and
`cloudFingerprint` on `Recipe`, so they live in the blob with everything else and
ride through backup for free. An earlier draft of this roadmap expected a side
table; the blob-is-truth rule turned out to cover that case too.

**The index is built but unmerged.** `main` still carries the plain blob table,
so it is M5's first phase, but the phase is a rebase rather than a build. The
work is on the `recipe-index` branch: 28 commits, around 4,300 insertions, with
the descriptor array, the tag table, the hash-triggered rebuild and a real-SQLite
test harness all in place. It had never been pushed, which is why it was briefly
believed lost; it is on the remote now.

Both documents survive —
[`2026-09-14-recipe-index-design.md`][idx-design] and
[`2026-09-14-recipe-index.md`][idx-plan] — and the plan's header explains how to
land the branch. Read §0 of the design first: M6 and M5 between them add four
descriptors the original does not name, and the two that M5 introduces
(`favourite`, `hasDescription`) are the reason the rebase and the shelves work
belong to the same release.

[idx-design]: ../superpowers/specs/2026-09-14-recipe-index-design.md
[idx-plan]: ../superpowers/plans/2026-09-14-recipe-index.md

### M6 · Your xBloom library

| Issue | | |
|---|---|---|
| #74 | Spike: what does xBloom actually consider "your library"? | open |
| #75 | Keychain-backed xBloom authentication | **done** |
| #58 | Import your xBloom cloud library | **done** |
| #59 | Push edited recipes back to the xBloom cloud library | open |
| #76 | "What leaves this device" screen | open, blocks 2.0.0 |

Resolves the user-credential half of #56.

The spike comes first and is cheap. The list endpoint is
`tuMyTeaRecipeCreated.tuhtml` — *Created* — and across all eleven surveyed
projects there is no favourites endpoint, no shared-with-me endpoint and no brew
history endpoint. So the strong inference is that "your library" means recipes
you authored, and that the share links you have opened and brewed are not in it.
That is `inferred`, and it changes what M6 is worth building, so it gets
confirmed against a real account before the rest of M6 is designed.

Push is deliberately create-only against name clashes rather than an update, so
M6 has no conflict cases to resolve at all. Resolving them is the next project,
not this one.

**Built, gated, then switched on.** #112 landed M6 in `main` behind
`cloudAccountEnabled`, a settings key defaulting to `false`, reachable only
through the LABS section. The gate existed for one reason: importing a whole
cloud library into a list with no search, no filter and no sort is a firehose
pointed at an unorganised screen. M5 is what made that survivable, so once M5
landed the gate had nothing left to protect and the key was deleted rather than
flipped. A switch that is on for everybody and cannot be turned off is not a
setting, it is a branch nobody took.

The import selection screen was virtualised at the same time. Pagination caps
at twenty pages of a hundred, so an account can hand that screen two thousand
rows, and it had been laying out every one of them.

`labsUnlocked` remains, revealed by seven taps on the version line in About,
and still does not ride in a backup. It is a general mechanism, not this
feature's front door.

It was built before M5, inverting the order this roadmap assumed, and it is
released after it. See **Release order** below.

One cost was avoided and one was paid. Avoided: three values exist only in the
xBloom response at the moment of import — `shareMemberName`, `shareMemberHead`
and `podsVo.imagePath` — and a recipe imported without them has lost them
permanently, short of re-fetching every share link. They were captured during
M6 as `sharedBy`, `sharedByAvatar` and `imageURL`, and they are deliberately
*not* gated, because they are ordinary recipe content that M5 builds author
shelves and the pod section on. Paid: the index migration will now run twice
rather than once. `INDEX_REVISION` exists for exactly that and will handle it.

## Release order

Build order and release order are not the same thing here, on purpose.

| Version | Carries | State |
|---|---|---|
| 1.6.0 | M1 to M4, the create-recipe work, the grind-off fix | **shipped to TestFlight**, build 12, cut before M6 landed |
| 2.0.0 | M5, and M6 ungated with it | next |

M6 is gated rather than branched because a branch that size parallel to an M5
rewrite of the library screen is a merge conflict with a countdown on it.

It was held back until M5 because **M6 is a firehose pointed at an unorganised
list**. Importing an entire xBloom library is the fastest way to turn a
twenty-recipe library into a hundred-recipe one, and before M5 that landed in a
screen with no search, no filter, no sort and no shelves. M5 is what makes M6
survivable, not merely nicer, so the two ship together rather than a version
apart: there is no longer a release in which M5 is present and M6 is withheld.

2.0.0 rather than 1.8.0 because the major number marks the trust boundary
moving. Up to and including M5 this app has never sent a user's credentials
anywhere; M6 is the first version that does, which is what #76 exists to
explain and what deserves the version number that makes people read it.

`expo-updates` is not a dependency, so there is no OTA path and every change
ships as a build. It is to be adopted before M5 reaches testers, since M5 is
almost entirely JavaScript and shelf art needs iteration.

#69, #62 and #71 are each a milestone's last open issue. They ride whichever
release they happen to be finished for; holding a release for one is how
milestones stop meaning anything.

## Not scheduled

Tagged, so it is clear they were left undone on purpose.

| | |
|---|---|
| Full two-way sync | The end state, gated on M6 |
| #64 | Machine settings and standalone grinder over BLE |
| #42 | Editor: drag the pour profile to shape a recipe |
| #25 | Whether the app should author a recipe from scratch |
| #5 | Android has never been verified on SDK 57 |
| #53, #54 | Tea and iced recipe templates |

## Architecture

**The three-layer separation holds.** Everything new is plain TypeScript in
`library/`. `BLE.ts` becomes a transport sibling of `NFC.ts` — connection and
framing only, no recipe knowledge. `XBloomCloud.ts` joins `XBloomRecipe.ts` as
the cloud client. `Recipe.ts` gains encoders and never learns which transport is
calling it.

**Grind size gets one module.** There are four representations of the same
number in play:

| Context | Encoding | "Off" |
|---|---|---|
| Card | `value − 40`, range 40–80 | byte `41` |
| Cloud | raw 1–80 | `isSetGrinderSize: 2` |
| BLE recipe blob | raw | `0xFE` on the wire |
| BLE machine info | `uint8 − 30` | — |

Four offsets and three different "off" encodings, and every one of them fails
*silently* rather than erroring — on the wire, `0x00` means grind at the finest
setting, not "do not grind". These conversions live in one module with named
functions and tests, not scattered across call sites.

**Share the pour encoder, not the framing.** The per-pour block is byte-identical
between card and BLE, so `Recipe.getData()` is already most of a BLE encoder.
But the divergences are exactly where a careless reuse misbehaves without
complaining: the ratio byte is raw on a card and `×10` over BLE, and must be
`ceil` rather than `round` or the machine skips grinding with no error at all;
grind-off differs as above; and grind and no-grind are distinct opcodes (8001
and 8004). So: one shared pour serializer, explicit and separate framing per
transport, and BLE fixtures written as an independent reimplementation the way
`library/__tests__/cardFixtures.ts` already is.

That convention has a known blind spot worth not repeating. `cardFixtures.ts` is
meant to make round-trip tests non-tautological, but it applies the same `− 40`
offset the encoder does, so both sides of the round trip shared the assumption
under test. It was true, but the suite could not have told us if it were not.

**BLE library: `react-native-ble-manager` 12.5.1.** `react-native-ble-plx` is
bridge-mode only and unusable on SDK 57 — its New Arch rewrite is still a draft
PR. `expo-bluetooth` is an abandoned 2021 placeholder.

**Credentials never touch our server.** User login goes device → xBloom directly
and is stored in the device keychain. The serverless function holds only the
service credential and never sees a user's. This is a hard architectural line,
not a preference.

## Trust

The privacy claim currently reads: XBRW++ "collects nothing. There are no
accounts, no analytics, no advertising, no tracking, and no crash reporting."

**That stops being true at M2, not M6.** The moment sharing works, a user's
recipe leaves the device and lands in xBloom's cloud — no login required, but
data has moved. So amending `PRIVACY.md` and revisiting the App Store privacy
label are part of M2's definition of done. Discovering this during a submission
review would be the worst possible time to discover it.

**Consent is per-capability and per-action.** Sharing is self-evident consent —
you pressed share. Login is a separate, explicit, revocable decision, and
logging out purges stored credentials and any cached cloud data. Neither is ever
required for anything the app can already do.

**The serverless function is the weak point of the claim**, because it is the
one piece a user cannot verify by watching their own device. So it has to be
deliberately boring: no recipe bodies logged, nothing retained, only the service
credential held, and its source in this repo so the claim can be checked against
the code.

**Inspectability made concrete.** Being open source means a user *could* audit
us. The "what leaves this device" screen in M6 means they do not have to be a
developer to: every outbound request the app is capable of making, what triggers
it, and where it goes, in one list.

**The honest caveat.** These endpoints are unofficial and undocumented. They can
break without notice, and using personal credentials against an unofficial API
carries some account risk that is not ours to wave away. Users are told this
before they log in, not after.

## Open questions

Carried forward rather than resolved. Each is cheap to answer at the point it
matters and expensive to guess at now.

- **What is in "your library"?** Created recipes only, most likely. Gates M6.
- **Does a service-account share link show our account's name to recipients?**
  `inferred`, unknown. Affects how M2 is presented to users.
- **Does xBloom rate-limit recipe creation?** Nobody tested. Affects M2's abuse
  control.
- **Command 40518 may start or un-start a brew depending on state.** Sources
  contradict each other. The most dangerous gap in the protocol, and it lands in
  M3.
- **Tea over BLE is the least-verified area** of the protocol.
- **Should we simply ask xBloom?** The friendly outcome — a blessed integration,
  or at least a "we don't mind" — would retire most of the risk in M2 and M6 at
  once.
