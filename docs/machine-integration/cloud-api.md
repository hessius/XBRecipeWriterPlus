# xBloom Cloud API — Reverse-Engineering Findings
**Research date**: 2026-08-30  
**Produced for**: XBRW++ (hessius/XBRecipeWriterPlus)  
**Researcher**: AI subagent; code-reading only; no authenticated API calls made.

---

## Source corpus and licences

| Repo | Licence | Trust weight | Key file(s) read |
|------|---------|-------------|-----------------|
| `hgstrm/pourpilot` | **MIT** | HIGH | `src/lib/xbloom/client.ts`, `src/lib/xbloom/types.ts` |
| `KhalidOnzi/xbloom-app` | No licence | MEDIUM (facts only) | `BloomRecipe/Services/XBloomCloudClient.swift` |
| `denull0/xbloom-agent` | **MIT** (per README footer) | HIGH | `xbloom-mcp-remote/supabase/functions/xbloom-mcp/index.ts` |
| `HomoLand/xbloom-studio-web` | No licence | LOW (facts only) | `backend/routes/recipes.py`, `backend/bridge_client.py` |
| `Ahmad9077/xbloom-bean-to-bloom` | No licence | MEDIUM (facts only) | `README.md`, `src/recipe.ts`, `src/index.ts` |
| `brAzzi64/xbloom-ble` | **MIT** | HIGH | `PROTOCOL.md` |

**Licence note**: endpoint URLs, field names, and wire-format facts are not copyrightable; they can be cited freely. The RSA encryption *technique* (chunk-and-encrypt in 117-byte blocks with PKCS1 v1.5) is described identically in at least three MIT-licensed sources (pourpilot, denull0, brAzzi64). The RSA public-key string is a literal constant of the xBloom API — not copyrightable.

---

## A. Endpoint Map

### Base URLs
- **API base**: `https://client-api.xbloom.com`
- **Share-link base**: `https://share-h5.xbloom.com`

### Universal request mechanics
All authenticated, recipe-mutating calls:
- Method: `POST`
- Body: **base64-encoded RSA-PKCS1v1.5 encrypted JSON**, sent as a JSON-encoded string  
  (`Content-Type: application/json`)
- Required headers: `Referer: https://share-h5.xbloom.com/` and  
  `User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)` (`observed-in-code` — pourpilot, denull0, KhalidOnzi; identical across all three)

Unauthenticated read calls send **plain JSON** (no encryption) with the same Referer/UA headers.

### ①  Unauthenticated / No login required

| Endpoint | Method | Body fields | Returns | Auth |
|----------|--------|------------|---------|------|
| `RecipeDetail.html` | POST (plain JSON) | `tableIdOfRSA`, `interfaceVersion: 19700101`, `skey: "testskey"` | `recipeVo` object | **None** |
| `tRecipeDetailOfPods.thtml` | POST (plain JSON) | `xid`, `interfaceVersion`, `skey`, `languageType: 0`, `adaptedModel: 1`, `isRefreshScanTime: 1`, `appVersion: "2.1.2"` | `recipeVo` object | **None** |

`tableIdOfRSA` is the base64-encoded integer recipe ID (= the share-link `?id=` param).  
`xid` is the ≤7-char XID used for Pod/factory recipes.  
`observed-in-code`: XBRW++ `library/XBloomRecipe.ts`; cross-referenced with denull0 `index.ts` `fetchRecipe()`.

### ② Authentication required (RSA-encrypted body)

All authenticated requests share these boilerplate fields:

```
interfaceVersion: 20240918
skey: "testskey"
phoneType: "Android"  (or "iOS" in KhalidOnzi port — both appear to work)
clientType: 2
languageType: 1
memberId: <integer>
token: <string>
```
`observed-in-code`: pourpilot `client.ts:authBase()`, denull0 `index.ts:authBase()`, KhalidOnzi `XBloomCloudClient.swift:authForm()`.

| Endpoint | Method | Additional fields | Returns | Purpose |
|----------|--------|------------------|---------|---------|
| `tMemberLogin.thtml` | POST (**plain**, not encrypted) | `email`, `password`, `jpushId: ""` | `result: "success"`, `member.tableId`, `token` | **Login** — returns bearer token |
| `tuMyTeaRecipeCreated.tuhtml` | POST (encrypted) | `pageNumber: 1`, `countPerPage: 100`, `adaptedModel: 1` | `list[]` of recipe objects | List user's recipes |
| `tuRecipeAdd.tuhtml` | POST (encrypted) | see Recipe payload below | `result: "success"`, `tableId` | **Create recipe** |
| `tuRecipeUpdate.tuhtml` | POST (encrypted) | same as add + `tableId` | `result: "success"` | Update existing recipe |
| `tuRecipeDelete.tuhtml` | POST (encrypted) | `tableId` | `result: "success"` | Delete recipe |

`observed-in-code`: pourpilot `client.ts`, denull0 `index.ts`, KhalidOnzi `XBloomCloudClient.swift`.

### ③ BLE-related cloud encoding (additional undocumented endpoint)

| Endpoint (inferred name) | Purpose | Source |
|--------------------------|---------|--------|
| `getRecipeCodeJ15()` → HTTP call (exact URL unknown) | Returns `theCode` (hex blob), `theMax`, `theMin` for BLE recipe transmission | `brAzzi64/xbloom-ble` PROTOCOL.md `observed-in-code` (APK decompilation) |

This endpoint is called by the official xBloom app before BLE transmission to get the machine-executable recipe blob. **XBRW++ already handles BLE encoding locally; this endpoint is probably not needed for share-link creation.** The request includes `pourDataJSONStr`, `grinderSize`, `grandWater`, `rpm`, `cupType`, and optionally `tableId`. Exact URL not observed in any community source. `single-source`.

### ④ Share-link fetch endpoint (for reading, not creating)

XBRW++ already uses `RecipeDetail.html` (see §①). The `tableIdOfRSA` param is `btoa(String(recipeId))` — integer recipe ID converted to string, then base64-encoded. `observed-in-code`: denull0 `index.ts:fetchRecipe()`, pourpilot `client.ts:createRecipe()`.

---

## B. Authentication

### Login flow
1. POST to `tMemberLogin.thtml` with **plain JSON** (no RSA encryption on the login call itself).  
   `observed-in-code`: pourpilot `client.ts:login()` calls `postPlain`; denull0 `index.ts:loginXbloom()` likewise; KhalidOnzi `XBloomCloudClient.swift:login()` uses `postEncrypted` for login. **Discrepancy**: KhalidOnzi encrypts the login body; pourpilot/denull0 send it plain. Both appear to work — `single-source` on either being strictly required.
2. Response contains `result: "success"`, `member.tableId` (integer member ID), and a `token` string.
3. All subsequent requests carry `memberId` + `token` in the encrypted body — there is no Authorization HTTP header.

### Token type and lifetime
- The token is an opaque string returned by the login endpoint. No JWT structure observed.
- `observed-in-code` (denull0 README): "Your password is used once to log in, then thrown away. Session tokens are encrypted at rest." The token itself has no observed expiry mechanism in the API (no refresh endpoint found). Denull0 stores it with a 1-year TTL in its Supabase DB; this is the app's policy, not an API-enforced expiry.
- `inferred`: xBloom tokens may be very long-lived or indefinite. No refresh endpoint was observed in any source.

### Encryption: RSA public key
All authenticated write requests encrypt the JSON body with RSA-PKCS1v1.5 using xBloom's hardcoded public key. The key is **identical** across pourpilot, denull0, and KhalidOnzi:

```
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5
CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9
tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor
J1VBbCv90yBSOhVxO+QIDAQAB
```
`observed-in-code` (multi-source, MIT): pourpilot `client.ts`, denull0 `index.ts`, KhalidOnzi `XBloomCloudClient.swift`.

The JSON payload is split into 117-byte plaintext chunks, each independently RSA-encrypted and concatenated; the result is base64-encoded and then JSON-string-encoded as the POST body.  
`observed-in-code`: pourpilot `client.ts:rsaEncrypt()`, denull0 `index.ts:rsaEncrypt()`, KhalidOnzi `RSAFormEncryption.encrypt()`.

### App-level API key
`skey: "testskey"` appears in every request. `observed-in-code` (multi-source). This looks like a static app-level credential that was either left in from development or is intentionally fixed. No source documents what it validates.

### Rate limiting
The xBloom API itself: **no evidence of server-enforced rate limiting observed** in any source. No 429 handling was coded in any of the client libraries. The bean-to-bloom Worker implements its own per-user rate limiting (10 recipe generations/hour) on its own side, but this is unrelated to the xBloom API.  
`inferred` risk: unlimited calls against `client-api.xbloom.com` could result in undocumented throttling or account suspension. No evidence either way.

### User-agent and Referer
All sources set `Referer: https://share-h5.xbloom.com/` and `User-Agent: Mozilla/5.0 (iPhone; ...)`. These appear load-bearing — the unauthenticated endpoints also require the Referer. No source documents what happens without them.

---

## C. Share-Link Minting — Priority Question

### ★ The short answer: create a recipe, then construct the link client-side. No separate "mint" call.

**Step 1 — Authenticate** (once): POST to `tMemberLogin.thtml` → get `memberId` + `token`.

**Step 2 — Create recipe**: POST encrypted body to `tuRecipeAdd.tuhtml`.

**Recipe payload fields** (all `observed-in-code`: pourpilot `client.ts:createRecipe()`, denull0 `index.ts:createRecipe()`):

| Field | Type | Example / notes |
|-------|------|----------------|
| `theName` | string | Recipe display name |
| `dose` | number | Coffee dose in grams |
| `grandWater` | number | Brew ratio integer (e.g. `15` = 1:15); NOT total water volume |
| `grinderSize` | number | Grind size 1–80 |
| `rpm` | number | Grinder RPM 60–120 |
| `cupType` | number | 1=xPod, 2=Omni/Dripper, 3=Other, 4=Tea |
| `adaptedModel` | number | `1` in pourpilot/denull0; `2` in KhalidOnzi — discrepancy, `single-source` each |
| `isEnableBypassWater` | number | `2` = disabled |
| `isSetGrinderSize` | number | `1` = grinder on, `2` = off |
| `theColor` | string | Hex colour, e.g. `"#C9D5B8"` |
| `theSubsetId` | number | `0` |
| `bypassTemp` | number | `85.0` (default even when bypass disabled) |
| `bypassVolume` | number | `0.0` or `5.0` (varies across sources; `single-source` discrepancy) |
| `subSetType` | number | `2` |
| `appPlace` | array | `[4]` |
| `createTimeStamp` | number | `Date.now()` (ms since epoch) |
| `isShortcuts` | number | `2` |
| `pourDataJSONStr` | string | JSON-stringified array of pour objects (see below) |
| + auth boilerplate | — | `interfaceVersion`, `skey`, `phoneType`, `memberId`, `clientType`, `languageType`, `token` |

**Pour object fields** (inside `pourDataJSONStr`):

| Field | Type | Notes |
|-------|------|-------|
| `theName` | string | `"Bloom"` for index 0, `"Pour 2"` etc. for subsequent |
| `volume` | number | ml for this pour step |
| `temperature` | number | °C |
| `flowRate` | number | ml/s (3.0–3.5) |
| `pattern` | number | 1=centered, 2=spiral, 3=circular |
| `pausing` | number | pause seconds after this pour |
| `isEnableVibrationBefore` | number | 1=on, 2=off |
| `isEnableVibrationAfter` | number | 1=on, 2=off |

`observed-in-code`: pourpilot `client.ts:buildPourList()`, denull0 `index.ts:buildPourList()`, KhalidOnzi `XBloomCloudClient.swift:cloudRecipe()`.

**Step 3 — Response**: `{ result: "success", tableId: <integer> }`.

**Step 4 — Construct share URL client-side**:
```
shareId = btoa(String(tableId))   // base64-encode the integer ID
shareUrl = `https://share-h5.xbloom.com/?id=${encodeURIComponent(shareId)}`
```
`observed-in-code`: pourpilot `client.ts:createRecipe()`, denull0 `index.ts:createRecipe()` and `createTeaRecipe()`. Both independently derive the same algorithm.

There is **no separate "mint share link" API call** — the link is constructed locally from the `tableId` returned by `tuRecipeAdd.tuhtml`. The link is immediately readable by the `RecipeDetail.html` endpoint.

### Does the link work in the official xBloom app for a different user?

**Yes, it is designed to.** The `RecipeDetail.html` endpoint is publicly accessible without authentication and is already used by XBRW++ for reading. The share-h5.xbloom.com domain is the official sharing surface. There is no evidence of any recipient-side authentication requirement.  
`observed-in-code`: XBRW++ `XBloomRecipe.ts` reads public recipes unauthenticated. `inferred`: attribution of the recipe in the app would show the creating account's identity (name) — confirmed by `listRecipes` response which contains `shareRecipeLink` on each record, so server is aware of the link.

### Does the recipe need to be server-encoded first (BLE blob)?

**No** — for creating a share link, the recipe is stored in the xBloom cloud as field data (JSON). The BLE encoding (`getRecipeCodeJ15`) is only needed when sending the recipe to the machine via Bluetooth. Share-link creation is purely a cloud CRUD operation.  
`observed-in-code`: PROTOCOL.md documents `getRecipeCodeJ15` as a pre-BLE step, not a pre-share-link step.

### ID format

The share link `?id=` parameter is `btoa(String(tableId))` where `tableId` is a plain integer returned by the create/list APIs. Examples:
- `tableId = 12345` → `btoa("12345")` = `"MTIzNDU="` → `?id=MTIzNDU%3D`

`observed-in-code`: pourpilot `client.ts`, denull0 `index.ts`. Cross-referenced with XBRW++ `XBloomRecipe.ts` which parses this format on import.

### Tea recipes

Tea recipes use the **same** `tuRecipeAdd.tuhtml` endpoint but with `cupType: 4`, `isSetGrinderSize: 2` (grinder off), `grinderSize: 50`, `rpm: 60`. Pour objects use `pausing` as the steep duration (up to 360s).  
`observed-in-code`: denull0 `index.ts:createTeaRecipe()`.

---

## D. The Service-Account Model

### What BrewMind reportedly does
A service mints share links using **its own** xBloom account rather than the user's, so no user credentials are needed and all recipes are attributed to the service account. This is architecturally equivalent to what bean-to-bloom does.

### What bean-to-bloom (Ahmad9077) does
Bean-to-bloom does **NOT** use the xBloom cloud API to create recipes directly. Its architecture:
1. User authenticates to the bean-to-bloom Worker (its own username/password system — **not xBloom credentials**).
2. The Worker generates recipes and queues a "bridge job" in its D1 database.
3. A Mac running the official xBloom app polls the bridge endpoint and uses **Appium automation** to operate the official xBloom app — which then creates the recipe and mints the share link via the app's own UI.
4. The share URL (`https://share-h5.xbloom.com/...`) is returned to the user.

Key quote from bean-to-bloom README: *"After Appium saves the recipe, it asks the official xBloom app to create a share link. Only HTTPS links on `share-h5.xbloom.com` are accepted."*  
`observed-in-code` (README).

This means bean-to-bloom does NOT hold its own xBloom credentials in the Cloudflare Worker — it instead drives a logged-in app on a Mac. This approach is significantly more fragile and complicated than direct API use.

**By contrast**, pourpilot and denull0 call the API directly with the user's own xBloom credentials. This is the cleaner model.

### Can one account mint many recipes for many users?

**Yes, technically.** The `tuRecipeAdd.tuhtml` endpoint accepts any recipe payload with valid credentials and returns a `tableId` from which any share URL can be constructed. There is:
- No per-account recipe creation limit observed in any source.
- No rate limiting on create calls documented anywhere.
- No cryptographic binding of a recipe to a specific device or user identity in the share URL.
- `inferred`: Recipients see the recipe creator's xBloom display name when opening a link via the official app — this is the main attribution concern. No source definitively confirms what that display looks like.

### BrewMind-style feasibility assessment

| Question | Finding | Confidence |
|----------|---------|-----------|
| Can one account create recipes for many users? | No technical barrier observed | `inferred` |
| Rate limits? | None observed in code or source comments | `single-source` (absence of evidence) |
| Attribution visible to recipient? | Likely shows creator account name | `inferred` |
| ToS exposure? | Yes — all community projects acknowledge using an unofficial API | `documented` (pourpilot DISCLAIMER.md) |
| Account suspension risk? | Plausible but unquantified | `inferred` |

**Bottom line**: The service-account model is technically feasible using direct API calls. However, if xBloom objects to third-party use, a service account with high volume is a more visible target than individual user accounts.

---

## E. Library and Cloud Storage

### What lives in the cloud vs. on device

**On device (machine)**: Exactly 3 Easy Mode slots (A/B/C), confirmed by PROTOCOL.md command 11510 which sends one recipe per slot with `slot_index` 0/1/2. These are the "Easy Mode" press-and-brew presets.  
`observed-in-code`: `brAzzi64/xbloom-ble` PROTOCOL.md.

**In the xBloom cloud**: The full recipe library. `tuMyTeaRecipeCreated.tuhtml` returns a paginated list of all user recipes. KhalidOnzi's `syncRecipe()` reads the cloud list by name and either updates or creates — the cloud is treated as authoritative.  
`observed-in-code`: KhalidOnzi `XBloomCloudClient.swift:listRecipes()`.

**Conclusion**: The independent claim that "the real library is cloud-side" is **confirmed**. The 3 on-device slots are a separate hardware layer; the cloud library is unlimited (or at least up to 100 per page with no observed hard cap).

### Library CRUD

| Operation | Endpoint | Auth |
|-----------|----------|------|
| List | `tuMyTeaRecipeCreated.tuhtml` | Required |
| Read one (by share id) | `RecipeDetail.html` | **None** |
| Read one (by XID) | `tRecipeDetailOfPods.thtml` | **None** |
| Create | `tuRecipeAdd.tuhtml` | Required |
| Update | `tuRecipeUpdate.tuhtml` | Required |
| Delete | `tuRecipeDelete.tuhtml` | Required |

`observed-in-code`: pourpilot `client.ts`, denull0 `index.ts`, KhalidOnzi `XBloomCloudClient.swift`.

### Sync / conflict model

**None observed.** The KhalidOnzi client uses name-based matching to decide create vs. update:

```swift
let existing = try await listRecipes(session: session).first { $0.name == named }
if let existing { /* update */ } else { /* create */ }
```
`observed-in-code`: KhalidOnzi `XBloomCloudClient.swift:syncRecipe()`.

No timestamps, ETags, or versioning were observed in any list response or write request. `inferred`: Last-write-wins; no offline-reconciliation support in the API.

The `listRecipes` response fields include `shareRecipeLink` per recipe (`observed-in-code`: pourpilot `client.ts:listRecipes()`), so the server tracks the share URL per recipe.

### Pagination

`tuMyTeaRecipeCreated.tuhtml` accepts `pageNumber` and `countPerPage`. All observed clients use `pageNumber: 1, countPerPage: 100` — a single page. No multi-page pagination handling was observed in any client. `inferred`: libraries with >100 recipes would be truncated by these clients; the true API maximum per page is unknown.

---

## F. Fragility and Risk

### API stability
- The pourpilot DISCLAIMER.md states explicitly: *"This API is private and undocumented. It may change or break at any time without notice."* `documented`.
- No issues or PRs in any repo document a breaking API change having occurred. All clients share essentially identical field names and values, suggesting the API has been stable for at least the period covered by these repos.
- The `interfaceVersion: 20240918` constant is present in all sources — suggesting an API version dated September 2024. `observed-in-code` (multi-source).
- The `skey: "testskey"` value is present unchanged across all sources — suggesting this hasn't rotated.

### ToS exposure
- pourpilot DISCLAIMER.md: *"Using it may be against xBloom's Terms of Service. You are responsible for reviewing xBloom's terms and deciding whether to use this software."* `documented`.
- No cease-and-desist mention, blocked user-agent notice, or DMCA issue found in any repo. `absence-of-evidence`.
- xBloom's official ToS was not inspected (that would require a web fetch to xbloom.com).

### No API key rotation observed
The RSA public key and `skey` value are identical across repos spanning multiple authors and time periods. `inferred`: xBloom has not rotated these since the community began reverse-engineering.

### Blocked user agents
No source documents xBloom blocking any user agent. The Mozilla/iPhone UA is used as a workaround. `inferred` fragility: if xBloom adds UA validation this could break.

---

## Discrepancies and Open Questions

| Question | Status |
|----------|--------|
| Login: encrypted or plain? | Pourpilot/denull0 send plain; KhalidOnzi encrypts. Both reportedly work. `single-source` each. |
| `adaptedModel` value: `1` vs `2` | Pourpilot/denull0 use `1`; KhalidOnzi uses `2`. Unknown effect. `single-source` each. |
| `bypassVolume`: `0.0` vs `5.0` | Varies. No observed functional difference. |
| `getRecipeCodeJ15` URL | Not observed in any community source. `inferred` from APK decompilation description in PROTOCOL.md only. |
| Exact share URL seen by recipient in official app | Not confirmed. Whether the creator's account name is visible is `inferred`. |
| Recipe count limits | No hard cap observed; API accepts `countPerPage: 100` but true maximum unknown. |
| Token refresh | No refresh endpoint observed. Token lifetime unknown beyond "appears durable". |
| `tRecipeGetShareLink` or equivalent | No dedicated share-link generation endpoint found. `inferred` that none exists. |

---

## Attribution / Permission Advisory

Under the research instructions, code *facts* (endpoint URLs, field names, wire format) are not copyrightable. However, the following **non-obvious techniques** appear in sources under restrictive licences and XBRW++ should consider obtaining permission before reusing them verbatim:

| Technique | Source | Licence |
|-----------|--------|---------|
| Name-matching create-vs-update heuristic in `syncRecipe()` | `KhalidOnzi/xbloom-app` `XBloomCloudClient.swift` | **No licence (all rights reserved)** — contact @KhalidOnzi |

Everything else — the RSA encryption scheme, the endpoint URLs, the field names and values, the share-URL construction — is documented in MIT-licensed sources (pourpilot, denull0, brAzzi64) or is purely factual. These facts can be implemented independently without copying any specific code.

---

## Quick-Reference: Minimal Share-Link Creation Checklist

For XBRW++ to create a share link from a recipe it already holds:

1. **Login**: POST (plain JSON) to `https://client-api.xbloom.com/tMemberLogin.thtml`  
   Body: `{email, password, interfaceVersion: 20240918, skey: "testskey", phoneType: "Android", clientType: 2, languageType: 1, jpushId: ""}`  
   Save `member.tableId` and `token`.

2. **Create recipe**: POST (RSA-encrypted JSON) to `https://client-api.xbloom.com/tuRecipeAdd.tuhtml`  
   Body: auth boilerplate + recipe fields + `pourDataJSONStr` (JSON-stringified pour array).  
   Save `tableId` from response.

3. **Construct link**: `"https://share-h5.xbloom.com/?id=" + encodeURIComponent(btoa(String(tableId)))`

4. **Read back** (optional verification): POST (plain) to `https://client-api.xbloom.com/RecipeDetail.html`  
   Body: `{tableIdOfRSA: btoa(String(tableId)), interfaceVersion: 19700101, skey: "testskey"}`

All steps `observed-in-code` in MIT-licensed sources (pourpilot `client.ts`, denull0 `index.ts`).

---

*End of findings. Confidence tags used: `observed-in-code` = directly read in source code; `documented` = stated in a README or doc; `single-source` = one source only, unverified; `inferred` = logical deduction from observed evidence, not directly witnessed.*
