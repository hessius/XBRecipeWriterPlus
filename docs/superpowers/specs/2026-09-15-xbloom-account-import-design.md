# Design: your xBloom account, and importing the recipes you made

**Issues:** #75 (authentication), #58 (import). Milestone M6.
**Spike that gates this:** #74, run 2026-09-15 against a real account.
**Status:** approved 2026-09-15.

## 1. What this is

Sign in to xBloom from XBRW++, and bring the recipes you authored there into
your local library so you can put one on a card without re-typing it.

It is optional, revocable, and never a precondition for anything the app can
already do. Card writing, the local library and brewing continue to work for a
user who never signs in, and must never come to depend on this.

### 1.1 What the spike changed

Four findings from #74 shape everything below. They are facts from a live
account, not inferences from endpoint names.

- **The library is authored-only.** `tuMyTeaRecipeCreated.tuhtml` returns the
  recipes the account created. Recipes opened from a share link and brewed are
  not in it, confirmed by eye against the official app. So this feature is
  "import my xBloom **recipes**", not "my library", and the UI must say so.
- **The list rows are complete recipes.** Every field
  `library/XBloomRecipe.ts` reads is present on each row, so an import is one
  request and needs no new mapper.
- **Pagination works.** The response carries `totalCount` and `totalPage`, and
  later pages return distinct rows. Every surveyed client hardcodes
  `countPerPage: 100` and would silently truncate a larger library.
- **There is no modification timestamp.** Only `createTimeStamp`. The server
  cannot tell us whether a recipe changed since we last saw it.

The last one is why two-way sync is not in this design and #59 is re-scoped to
"publish a local recipe as a **new** cloud recipe", which has no conflict to
resolve.

### 1.2 The standing risk

This is an undocumented API. It can change or close without notice, and using
personal credentials against it carries some account risk that is not ours to
wave away. The user is told this **before** the password field, not after.

## 2. Architecture

### 2.1 `library/cloud/` — five files, no React

Mirrors `library/machine/` and `library/brew/`: plain TypeScript domain code,
one concern per file, testable without a renderer.

| File | Owns | Knows nothing about |
|---|---|---|
| `transport.ts` | RSA-PKCS#1 envelope, one `post()`, the base URL | recipes, credentials-at-rest |
| `session.ts` | login, the `memberId` + token pair, `expo-secure-store` | recipes |
| `cloudLibrary.ts` | the paged fetch, walking `totalPage` | storage, React |
| `importPlan.ts` | **pure** classification of cloud rows against the local library | network, database, React |
| `accentMatch.ts` | nearest accent in OKLab within a beverage group | everything else |

**Mapping is not new code.** Each row is wrapped as `{recipeVo: row}` and handed
to the existing `XBloomRecipe`, which already parses that exact shape and is
hardened against real-world nulls. One mapper, one place to fix a field.

`importPlan.ts` being pure is the load-bearing decision: "what will this import
do to my library" becomes a function call, so every branch is testable without a
network or a database. The subtle bugs in this feature live there.

### 2.2 The line that must not move

**Credentials never touch our server.** Login goes device-to-xBloom directly.
The M2 serverless function holds only the service account and never sees a
user's credential.

Routing cloud calls through `api/` was considered and rejected. It would be
convenient — one place to fix a changed endpoint — and it would make the privacy
claim unverifiable, which is the whole thing #75 exists to protect. This is
recorded here so it is not re-proposed as a simplification.

### 2.3 New dependencies

`expo-secure-store` for the token, and `expo-crypto` for the random bytes of
PKCS#1 padding. Both installed with `npx expo install`. They are native
additions, so `expo.version` in `app.json` needs a bump
(`runtimeVersion.policy` is `appVersion`).

### 2.4 RSA on the device

The app has never encrypted anything. The only RSA in the repo is
`api/_lib/xbloom.ts`, which uses `node:crypto` — unavailable in Hermes — and
which `library/` may not import anyway.

So `transport.ts` carries its own RSA-PKCS#1 v1.5 public encrypt: a DER walk
for the modulus and exponent, and `BigInt` modular exponentiation. This was
prototyped before being written down and its ciphertext matches
`node:crypto`'s `publicEncrypt` byte for byte on a fixed padded block, so it is
a verified approach rather than a hopeful one. It is roughly sixty lines and
adds no dependency.

A JS RSA library was considered and rejected: `node-forge` and `jsencrypt` are
each an order of magnitude more code than the one operation we need, and both
carry their own ASN.1 and BigInteger implementations that we would ship and
never otherwise use.

The padding's random bytes are the one thing we do not write ourselves.
`Math.random` is not a source for them, SDK 57 ships no `crypto.getRandomValues`
polyfill, and `expo-crypto.getRandomBytes` is synchronous and native — hence
the dependency above.

## 3. Data model

Two new fields on `Recipe`:

- **`cloudId: number`** — xBloom's `tableId` for this recipe **in your own
  account library**. `0` when the recipe did not come from there.

#### 3.0.1 Three ids that are not each other

`Recipe` already carries two id fields pointing in different directions, and
`Recipe.ts:120-130` warns about confusing them. `cloudId` is a third. The doc
comment on the new field must state all three, because picking the wrong one is
a silent bug:

| Field | Direction | Meaning |
|---|---|---|
| `shareId` | inbound | the id a recipe was **imported from** via a share link |
| `sharedTableId` | outbound | the id a share link was **minted from**, for a recipe we published |
| `cloudId` | inbound | the id of this recipe **in your own account library** |

Reusing `sharedTableId` for import would make a minted link look like an import
origin, which is the exact failure its existing comment was written to prevent.
- **`cloudFingerprint: string`** — a hash of the recipe's **brew-defining
  fields as imported**.

### 3.1 What the fingerprint covers, and why it matters

The fingerprint makes "you have edited this locally" a fact rather than a guess:
re-hash the recipe and compare. Equal means untouched since import. Different
means the user has done work, which is never overwritten without an explicit
act.

It is computed over exactly the fields the cloud owns — name, cup type, dose,
ratio, grind size, grinder RPM, bypass settings, and every pour's volume,
temperature, pattern, agitation and pause — in a fixed field order, so the hash
is stable across serialisation changes.

It deliberately **excludes** `uuid`, `key`, `accent`, `tags`, `backup`,
`offline_backup`, `cloudId`, `checksum`, `shareSnapshot` and `xbloomName`.
Three reasons, and all are bugs avoided:

- We assign the accent ourselves at import (§5). A fingerprint taken over the
  whole recipe would differ from the cloud's the moment it was stored, marking
  every imported recipe as "edited here" before the user had touched it.
- `backup` and `offline_backup` hold raw card bytes and change when a recipe is
  written to a card. Writing a card is not editing a recipe, and it must not
  make one look edited.

- `xbloomName` is the cloud's cached title and is not hand-edited: the user
  types into `name`, and a refresh rewrites `xbloomName` from xBloom. A field
  the app rewrites for itself can only report an edit nobody made, never catch
  one. `checksum` and `shareSnapshot` are excluded on the same ground -- one is
  derived from the card bytes, the other is rewritten when a share link is
  minted, and sharing a recipe is not editing it.

Tags are excluded for the same reason: they are ours, the cloud has no concept
of them, and tagging an imported recipe should not cost the user their ability
to refresh it.

`cloudId: 0` must never match anything. A hand-made recipe colliding as "already
imported" is the one bug in this design that would quietly destroy work.

### 3.2 Backup and restore

Both fields are carried through backup and restore, which means entries in
`backup.ts`'s validator map. That file is a declared trust boundary, so they are
validated like everything else: `cloudId` a finite non-negative number or
absent, `cloudFingerprint` a string or absent.

A malformed value **skips that recipe**, which is what every other entry in the
map already does. An earlier draft of this section said such a value should be
*dropped* rather than rejected, "matching how tags are handled" — that was
wrong twice over. Tags are lenient because they are **absent** from the map and
so are never validated at all, not because the map has a lenient mode; and a
special case at a trust boundary is worth more than the one recipe it saves,
because the next reader has to work out which fields are strict and which are
not. The recipe is skipped and the rest of the backup restores.

## 4. The user's path

### 4.1 Two doors, one destination

Per the existing convention that import has several doors and one sheet:

**In `ImportSheet`**, one row below the paste face, visible only while
`state.status === "idle"`:

```
 ─────────────────────────────────────────
   YOUR XBLOOM ACCOUNT              ›
   Bring in the recipes you've made
```

A rule, a dot-matrix label in the sheet's own chrome register, a one-line
caption, and a chevron. The chevron promises *departure*, so the row does not
read as a third thing that might expand in place. It hides once a lookup is
resolving, has failed or has found something: the sheet then has one subject,
and a second import route competing with a found recipe is noise at the moment
of decision.

**In Settings**, an `xBloom account` section. Signed out: a single `Sign in`
row. Signed in: the account email, `Import recipes`, and `Sign out`. This is
where someone goes looking to disconnect, which the import sheet should never
carry.

Both lead to one route, `app/importCloud.tsx`, with `hooks/useCloudImport.ts`
holding the state machine. Screens stay close to layout.

### 4.2 Why a route and not a nested sheet

`XbrwSheet` is deliberately non-modal and renders in place rather than through a
Portal, so a sheet opened from inside a sheet is a sibling-layout problem — the
class of bug that made "Delete all recipes" do nothing for an entire release. A
scrollable multi-select of arbitrary length also wants a screen, not a
fixed-percentage sheet.

### 4.3 Signed out

The sign-in form: email, password, and — **before** the fields — the notice that
these endpoints are unofficial and carry some account risk.

The password exists only for the seconds the login takes. It is never written
anywhere.

### 4.4 Signed in

Your recipes in three groups, each row a checkbox:

- **New here** — checked by default. The common case is "bring in everything",
  and it should take one tap.
- **Already imported, unchanged** — unchecked, dimmed, "already in your
  library". Visible rather than filtered out so the count reconciles: six in
  xBloom, six on screen, no mystery about the missing ones.
- **Edited here since importing** — unchecked, labelled plainly, with a caption
  stating that importing replaces the changes you made. Ticking the box **is**
  the consent; there is no second dialog, because the row already states the
  consequence at the point of decision.

One button: `Import 4 recipes`, the count following the selection, disabled at
zero.

### 4.5 What it never does

It never deletes anything.

- A recipe deleted locally reappears as new. Correct — you can decline it.
- A recipe deleted upstream stays in your library untouched. This is an
  offline-first app; the cloud is not authoritative over your phone.

On completion the existing toast reports what happened and the library
refreshes. Imported recipes take their accent by nearest match from `theColor`.

## 5. Accents

Every cloud recipe carries `theColor` as plain `#RRGGBB`, in the same muted
register as our palette. Observed values, with OKLab distance to the winner:

| xBloom | Recipe | Nearest | Distance |
|---|---|---|---|
| `#B8C9A2` | coffee | Sage `#B4D6A8` | 0.033 |
| `#DEC3AF` | coffee | Peach `#F0B98E` | 0.045 |
| `#ABACD1` | coffee | Lilac `#BDB2E8` | 0.044 |
| `#ADBDDB` | coffee | Sky `#9FC3F0` | 0.032 |
| `#A2C0C2` | **tea** | *no match* | 0.093 |

Matching is in **OKLab**, not raw RGB: RGB distance is not perceptual and would
pick visibly wrong neighbours among pastels this close together.

The match is taken **within the beverage's group** — eight coffee accents, four
tea. Tea must be detected with `isTea()` / `CUP_TYPE.TEA`, never by reading
`cupType` against a legacy value: the `0x13` → `0x03` fold lives only in the
JSON constructor, so a legacy byte on an in-memory object reads as coffee. A tea
recipe matched against the coffee accents would be wrong in a way nobody notices
until a tea card looks odd.

### 5.1 Nearest is not always near — the threshold

**`MAX_ACCENT_DISTANCE = 0.06`**, beyond which there is no match and the recipe
gets an accent the ordinary way, from the existing least-used assignment.

The tea row above is why. All four of our tea accents are warm yellows and
pinks; `#A2C0C2` is a blue-green with no neighbour among them. Every candidate
sits at 0.093–0.105 — roughly three times any coffee match — and they are
clustered within 0.013 of each other, so "nearest" is decided by noise. The
winner would be Hibiscus, a pink, chosen confidently and wrongly.

A threshold of 0.06 separates the two populations with room on both sides: the
worst real match is 0.045, the best non-match 0.093. Being obviously
unremarkable beats being confidently wrong, and the fallback is the behaviour
every other new recipe already gets.

Collisions are allowed. Two of the observed recipes already share `#DEC3AF`, so
duplicate accents are normal upstream, and nearest-match deliberately overrides
the usual least-used assignment when it does match.

### 5.2 What the matcher returns

`accentIndex` on a `Recipe` is an **index into the beverage's accent array**,
not a hex string (`Recipe.ts:118`). So `accentMatch.ts` returns
`number | null` — the index of the nearest accent, or `null` when nothing is
within `MAX_ACCENT_DISTANCE`. On `null` the caller falls back to the existing
`assignAccent(recipe, others)` from `library/accent.ts`.

## 6. Credentials and failure

### 6.1 What is stored

One entry in `expo-secure-store`: `memberId` and token. Nothing else.

`session.ts` is the only file that reads or writes it, so "we never store your
password" is checkable by reading one short file rather than auditing five.

### 6.2 Expiry we cannot see

The token is opaque, 96 characters, not a JWT, with no readable expiry, and **no
refresh endpoint exists** in any of eleven surveyed projects. Staleness surfaces
only as a rejected call.

**A rejection anywhere means signed out.** Clear the stored token and put the
sign-in form back on the screen the user is already on, with their selection
preserved. No silent retry loop, and no prompt appearing over an unrelated
screen.

Evidence suggests tokens are durable — one surveyed project uses the password
once and keeps only the token with a self-imposed one-year TTL. A durability
probe is running. If it shows short-lived tokens, §6.1 is the one section that
changes.

### 6.3 Logging

**`transport.ts` must never log a request body.** The login body *is* the
credential. Caught errors are not dumped either, because a fetch failure can
carry the request that caused it.

This is stated as a rule with its reason because the reason is non-obvious, and
someone will otherwise add a helpful `console.log` while debugging.

### 6.4 Logout

Clears the secure-store entry and nothing else.

Recipes stay, keeping `cloudId` and `cloudFingerprint`, so signing back in
recognises them instead of importing duplicates. An imported recipe is not
"cached cloud data" — it is a local recipe that may have been edited and written
to cards. Deleting it on an action that reads as "sign out" would be the app
destroying user data.

### 6.5 Failure modes

Each gets a plain sentence, inline, in the app's own vocabulary. No native
alerts.

| Failure | What the user sees |
|---|---|
| Offline | Cannot reach xBloom, with a retry |
| Login rejected | Email or password not accepted |
| Signed in, list call fails | Could not load your recipes, with a retry |
| Partial import | The recipes written are kept, and the count is reported |

A partial import keeps what it managed to write — those recipes are valid.

### 6.6 No dependency on the index branch

An earlier draft of this design assumed the import needed
`RecipeDatabase.atomically`, which lives on the unmerged `recipe-index` branch.
It does not: `insertRecipes` on `main` already wraps its loop in
`withTransactionSync`, so a mid-import failure rolls back cleanly.

M6 can therefore be built and shipped independently of `recipe-index`.

## 7. What this makes possible in #76

Two entries for the "what leaves this device" screen:

- **Signing in** — sends your email and password directly to xBloom. Never to
  us.
- **Importing** — sends your session token, receives your recipes. Never to us.

Both state that our serverless function is not involved. That is the line §2.2
draws, and saying it in the app is what makes the claim inspectable rather than
asserted.

## 8. Testing

The pure core carries the weight.

- **`importPlan.ts`** — exhaustive: new, unchanged, edited-locally, a recipe
  deleted locally reappearing as new, a recipe deleted upstream staying put,
  and `cloudId: 0` never matching. Plus the two fingerprint traps from §3.1: a
  freshly imported recipe must read as unchanged despite our own accent
  assignment, and writing a recipe to a card must not make it look edited.
- **`accentMatch.ts`** — golden tests on the five observed colours, including
  the tea one falling back rather than matching, the `MAX_ACCENT_DISTANCE`
  boundary, the tea-group constraint and the `0x13` trap.
- **`transport.ts`** — the DER walk recovering the known 1024-bit modulus and
  exponent `65537`; a padded block encrypting to a ciphertext that matches a
  golden vector; 117-byte chunking, so a 200-byte plaintext yields 256 bytes of
  ciphertext in two blocks. No network.
- **`cloudLibrary.ts`** — a fake transport proving it walks `totalPage` rather
  than assuming one page.
- **`session.ts`** — a mocked secure store, with one test asserting that after a
  login the store was written exactly once and the password appears nowhere in
  what was written. **That test is the executable form of the privacy claim.**
- **One fixture from real data**, names replaced, driven through `XBloomRecipe`
  to prove `{recipeVo: row}` produces a correct recipe — pours, dose, grind,
  bypass, cup type. The whole design rests on that assumption, so it is pinned
  rather than assumed.
- **Component tests** for the screen, via `renderWithProviders`, asserting on
  text, test IDs and accessible labels — RNTL v14 removed the APIs for
  inspecting a child's props.

**No test touches the network.** The spike scripts stay outside the repo.

## 9. Out of scope

- Two-way sync. There is nothing to order edits by.
- Favourites or shared-with-me recipes. They do not exist in the API.
- Brew history. No endpoint found in eleven projects.
- Auto-import on launch, and background refresh. Import is something you ask
  for.
