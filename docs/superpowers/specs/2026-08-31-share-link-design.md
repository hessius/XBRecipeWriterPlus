# Share a recipe as an xBloom link

**Milestone:** M2 · Share your recipe
**Issues:** #57 (mint the link), #69 (abuse control and degradation), #70 (privacy claim)
**Status:** approved

## The problem

A recipe made in XBRW++ cannot leave the app. It can be written to a card, and
it can be backed up as a file that only XBRW++ can read. There is no way to hand
one to another person.

xBloom has a sharing surface — `share-h5.xbloom.com/?id=…` — and XBRW++ already
*reads* it on import. Writing to it is the missing half, and it is the first
thing that makes this app useful to someone who does not own it yet.

## What we are building

A **Share** action in the recipe editor. It produces an xBloom share link, which
the system share sheet then hands wherever the user wants. The link opens in the
official xBloom app for people who have never heard of XBRW++.

There is no anonymous mint API. Creating a share link means POSTing a recipe to
`tuRecipeAdd.tuhtml` as an authenticated member, taking back an integer
`tableId`, and constructing the URL client-side.

Which means sharing needs an account. The decision recorded in the roadmap is
that this is a **service account** belonging to XBRW++ — nobody should have to
log in to hand a friend a recipe. The user's own credentials are not involved
here at all; that is M6.

## Decisions

These were settled in discussion. They are recorded with their reasoning because
the reasoning is the part that is expensive to reconstruct.

### An xBloom link, and only an xBloom link

A self-contained XBRW++ link — the recipe encoded in the URL itself — was
considered and rejected. It would work offline, need no account, and never
break, but it only means anything to someone who already has this app, and
reach is the entire point of the feature.

**Consequence:** there is no fallback artefact. When minting fails there is
nothing to hand over, so degradation is a messaging problem rather than a
second code path. See *Failure* below.

### The function proxies the whole mint

The client cannot build the request. The payload carries the account's
`memberId` and `token`, and anything shipped inside an open-source app is public
knowledge. A vended token would be worse than an embedded one: the same
credentials that add a recipe can also **delete** every recipe in the account.

So the app sends a recipe; the function adds credentials, encrypts, posts, and
returns a link. The recipe passes through our infrastructure. That is a fact
about the design, not a choice, and `PRIVACY.md` has to say so.

Note that the encryption is RSA with xBloom's **public** key, so encryption is
not what requires the server. The session is.

### Per-IP limiting plus a global ceiling

The risk is not load. Ten shares a month is nothing. The risk is that the
endpoint is public knowledge, so anyone can call it in a loop without installing
the app, and if the service account is rate-limited or suspended then sharing
dies for every user at once.

Rejected alternatives:

- **A global daily cap alone** fails shut: one abuser exhausts the day and
  everybody else is denied.
- **App attestation** (App Attest / Play Integrity) is genuinely strong — a
  `curl` loop cannot pass it — but it is more machinery and more third-party
  dependency than the thing it protects, and there is an irony in adding device
  attestation to an app whose pitch is that it identifies nobody. It can be
  added later without redesigning anything.
- **Nothing at all** leaves the failure undetectable until it has already
  happened to everyone.

Nobody has tested whether xBloom rate-limits recipe creation, so this is
designed against an unknown ceiling. It is deliberately conservative.

### Re-sharing remembers, and re-mints only on change

Every mint creates a real recipe inside the XBRW++ account, and nothing ever
deletes from it. Minting on every press means one recipe shared with three
friends becomes three cloud recipes and three different links, and the account
grows without bound — which feeds straight back into the suspension risk above.

Updating the cloud recipe in place was rejected for a different reason: a link
someone already holds would silently change under them. The recipe your friend
brewed last week would not be the one at that URL today. A link is a snapshot.

So: store what was minted, hand back the same link when nothing has changed, and
mint afresh when it has.

**Secondary benefit.** M6 needs exactly this substrate — a `tableId` plus a
record of what was last sent — to detect conflicts without server support.
Building it here, under a share button where being wrong is cheap, is much safer
than building it for the first time under a two-way sync.

### No consent prompt

Sharing is documented in `PRIVACY.md` and on the About screen, not prompted at
the moment of use. A one-time explanation sheet was considered and rejected as
friction: pressing a button labelled Share is not ambiguous about whether
something is being sent.

### Sharing is not gated on card validity

The cloud accepts the full 1–80 grind scale; a card stores 40–80. An imported
espresso recipe — the exact case M1 built guidance for — cannot be written to a
card but shares perfectly well.

Reusing the card-write gate would block something that works. The two limits are
genuinely different and the app should not pretend otherwise.

### The editor only

No library affordance, no marker on shared recipes, no "things you have shared"
view. The state a recipe now carries is visible where it is acted on. A shared
view is deferred to M5, where library management, tags and filtering are already
scoped and it would have something to hang from.

## Architecture

Four units, each testable alone.

### `library/shareLink.ts` — pure

No React, no network. Two jobs:

- Map a `Recipe` onto the wire shape.
- Canonicalise that shape to a stable string.

It is the only place that knows the payload's field names. Being pure and
plain-TypeScript puts it with the rest of the domain logic and makes the
mapping — the part most likely to be subtly wrong — testable without a server.

Field mapping of note:

| Wire | Source | Note |
|---|---|---|
| `theName` | `recipe.displayName()` | Recipient's first impression; already resolves name → xbloomName → fallback |
| `dose` | `recipe.dosage` | |
| `grandWater` | `recipe.ratio` | **The ratio, not a water volume** |
| `grinderSize` | `recipe.grindSize` | Full 1–80; not clamped to the card range |
| `isSetGrinderSize` | `recipe.grinder` | `1` on, `2` off |
| `cupType` | `recipe.cupType` | 1 xPod, 2 Omni, 3 Other, 4 Tea |
| `pourDataJSONStr` | `recipe.pours` | JSON string, not an array |

Tea inverts several of these (`cupType: 4`, grinder off, `pausing` as steep
time), so tea is a first-class case in this module rather than an afterthought.

### `api/share.ts` — the function

Deployed to Vercel from this repo. A `vercel.json` declares no framework and
builds only `api/`, or Vercel will try to build the Expo app.

Sequence: validate shape and limits → check rate limits → ensure a live session
→ build and RSA-encrypt → POST `tuRecipeAdd.tuhtml` → look the new row up in
`tuMyTeaRecipeCreated.tuhtml` to read its `shareRecipeLink` → return
`{tableId, url}`.

> **Amended 2026-08-31 by the live spike.** The design originally said the URL
> is built client-side as `btoa(String(tableId))`, following the community
> sources. That is wrong: the `?id=` value is an opaque server-issued token, so
> the link must be read back from the list endpoint. See
> `docs/machine-integration/cloud-api.md` § C-bis. The spike also settled
> `adaptedModel: 1`, `bypassVolume: 0.0`, and confirmed a recipient sees the
> recipe attributed to the service account as `XBRW++`.

- **Secrets:** `XBLOOM_EMAIL` / `XBLOOM_PASSWORD` as Vercel environment
  variables, marked Sensitive. Read from the environment only — never a default,
  never a fallback, never a log line.
- **Session:** the token is cached in KV and re-fetched on rejection, so a
  normal share costs one upstream call rather than two.
- **Rate limiting:** a small KV store. Per-IP per hour, plus a global daily
  ceiling. Both keyed to a window and TTL'd, so nothing outlives its window. The
  IP is hashed with a server-side salt, so the store never contains an address.
- **Logging:** counts and error classes only. No recipe bodies, ever. This
  constraint appears in `PRIVACY.md`, so it has to be true in the code.

### `hooks/useShareRecipe.ts`

The state machine — idle → minting → done/failed — the re-mint decision, and
error mapping. Screens stay layout.

### `Recipe` — three persisted fields

- `sharedTableId?: number` — the `tableId` the mint returned
- `shareUrl?: string` — the share link the server issued for it
- `shareSnapshot?: string` — the canonical payload that produced it

> **Amended 2026-08-31.** Two changes, both forced by the spike.
>
> The first field was originally called `shareId`. `Recipe.shareId` already
> exists and holds the *imported* base64 share id; reusing it would make a mint
> look like an import origin. Renamed to `sharedTableId`.
>
> A third field, `shareUrl`, was added. The design assumed the URL could be
> rebuilt from `sharedTableId` at any time, so there was nothing to store. The
> `?id=` token turns out to be server-issued and not derivable, so the URL
> itself has to be persisted or the memoisation would not survive an app
> restart — every share after a relaunch would mint a duplicate.

Persistence-only, like `backup` and `uid`. **`getData` and `parseData` are
untouched**: no card byte changes. They must survive the legacy-migration path
in the `Recipe(json)` constructor, and `RecipeDatabase` stores whole JSON blobs
so no schema change is needed.

Storing the payload **verbatim rather than a hash** removes the collision
question, is debuggable when someone asks why a link changed, and gives M6 a
snapshot that supports a three-way merge where a hash only ever answers
"different". It costs a few hundred bytes per shared recipe.

Comparing against *what was sent* rather than the whole recipe means recolouring
or locally renaming a recipe does not needlessly mint a new link, while changing
a pour volume does.

## Failure

Named reasons, mirroring the existing `ImportErrorReason` vocabulary rather than
inventing a parallel one:

| Reason | What the user is told |
|---|---|
| `network` | Their connection. |
| `limited` | Sharing is busy; try again shortly. |
| `unavailable` | Sharing is temporarily unavailable — nothing else is affected. |
| `unusable` | This recipe cannot be shared, and why. |

Per #69 this can never be a hard error. It stays inside the editor, changes
nothing about the recipe, and leaves every other path untouched. A user who
never shares must still have an app that works entirely offline.

## Privacy (#70)

`PRIVACY.md` gains a section stating plainly:

- Sharing happens only on an explicit action.
- These fields leave the device (listed).
- They pass through our function, which retains nothing beyond a windowed
  rate-limit counter against a hashed IP.
- They are stored in xBloom's cloud indefinitely, and **the user cannot delete
  them**.
- These endpoints are unofficial and undocumented, and can break without notice.

The claim that survives — and should be stated, not implied — is that a user who
never shares still has an app that sends nothing anywhere.

**App Store label:** declare *User Content → Other User Content*, not linked to
identity, not used for tracking. Apple's "collect" test turns on retention
beyond servicing the request, and the recipe does persist in xBloom's cloud. The
transient IP counter is not declared. This is the account holder's call;
over-declaring is cheaper than explaining a discrepancy during review.

## Verification

The entire mint is `observed-in-code` in two independent projects and has never
been run from this repo.

**The first task is a throwaway local spike** against the XBRW++ account: log
in, add a recipe, open the link. It settles the `adaptedModel` 1-vs-2 and
`bypassVolume` discrepancies the research flagged. It either confirms the
milestone or reshapes it — before any UI exists.

The spike reads credentials from `.env.local`, which is gitignored. That pattern
is widened to `.env*`, because `.env.production.local` is one typo away from
being committed.

## Testing

- Payload mapping, including tea and grinder-off.
- Canonicalisation stability — the same recipe must produce the same string
  across runs, or every share re-mints.
- The re-mint decision: unchanged recipe reuses, changed recipe re-mints, and
  changes to fields that are not sent do not trigger a mint.
- Rate-limit logic and error mapping in the function.
- Where the shapes allow, a round-trip through the existing `XBloomRecipe`
  importer — the same independent-reimplementation trick `cardFixtures.ts` uses,
  so the test is not tautological.

## Out of scope

- User xBloom credentials, library sync, importing from an account (M6).
- A self-contained XBRW++ link.
- A "shared recipes" view, or any library marker (M5).
- Deleting or updating a previously shared recipe.
- App attestation.
