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
| #55 | Post-brew notes and rating *(moved out of deferred)* |
| #72 | Library management: tags, filtering and search |
| #73 | Browse the community recipe hub |

All local, all offline, all available to someone who never logs in. This is the
milestone that improves on the official app rather than catching up to it —
xBloom's own library management is thin.

The community hub at `collective.xbloom.com` is **unauthenticated**, so browsing
and importing public recipes needs no account and belongs here rather than in
M6.

M5 also carries the one refactor on this roadmap. `RecipeDatabase.ts` stores
each recipe as an opaque JSON blob keyed by uuid, which cannot support filtering
or tags, and has nowhere to put M6's sync state. Doing that migration here —
promoting filterable fields to columns and adding a side table for sync — means
doing it once rather than twice.

### M6 · Your xBloom library

| Issue | |
|---|---|
| #74 | Spike: what does xBloom actually consider "your library"? |
| #75 | Keychain-backed xBloom authentication |
| #58 | Import your xBloom cloud library |
| #59 | Push edited recipes back to the xBloom cloud library |
| #76 | "What leaves this device" screen |

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
