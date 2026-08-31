# Share a Recipe as an xBloom Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn any recipe in XBRW++ into a `share-h5.xbloom.com` link that opens in the official xBloom app, via a serverless mint function backed by an XBRW++ service account.

**Architecture:** Four units. (1) `library/shareLink.ts` maps a `Recipe` to xBloom's wire payload — pure, no network. (2) A Vercel function `api/share.ts` holds the service-account credentials, rate-limits, logs in to `client-api.xbloom.com`, RSA-encrypts the payload, POSTs `tuRecipeAdd.tuhtml`, and returns the link. (3) `hooks/useShareRecipe.ts` owns the app-side state machine and memoises the result on the recipe so re-sharing an unchanged recipe does not re-mint. (4) A Share row in `RecipeOverflowSheet` hands the URL to the RN share sheet.

**Tech Stack:** TypeScript, Expo SDK 57, Tamagui, Jest + jest-expo, Vercel serverless (Web-standard `Request`/`Response` handler, zero runtime deps, `node:crypto` only), optional Upstash Redis REST for cross-instance rate limiting.

---

## Read before starting

- Spec: `docs/superpowers/specs/2026-08-31-share-link-design.md`
- Protocol reference: `docs/machine-integration/cloud-api.md` sections A, B, C
- The *reading* half of this exact API already exists: `library/XBloomRecipe.ts`. Every mapping in this plan is the inverse of what that file does. When in doubt, read it.

## Codebase conventions you must follow

- Import with the `@/` alias (maps to repo root): `import Recipe from "@/library/Recipe"`.
- **All colour comes from `constants/colors.ts`.** No hex literals, no named CSS colours anywhere in `app/` or `components/`.
- Components are declared at **module scope**, never inside another component's body.
- The **React Compiler is on**: do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook — destructure first.
- Tests use `@testing-library/react-native` v14, whose `render` and `fireEvent` are **async**. Always `await` them, and always render via `renderWithProviders` from `test-utils/render.tsx`.
- Recipes are mutated in place and a `key` counter is bumped to re-render. Do not "fix" this by making `Recipe` immutable.
- Commit with a heredoc-free message file: `printf '%s\n' 'line' 'line' > /tmp/msg && git commit -F /tmp/msg`. Always include the trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## File structure

| File | Responsibility |
| --- | --- |
| `library/shareLink.ts` (new) | Pure `Recipe` → xBloom wire payload mapping, plus `canonicalisePayload` for change detection. No network, no React. |
| `library/Recipe.ts` (modify) | Two new persisted fields: `sharedTableId?: number`, `shareSnapshot?: string`. |
| `library/backup.ts` (modify) | Validators for the two new fields. |
| `constants/share.ts` (new) | The mint endpoint URL, overridable by `EXPO_PUBLIC_SHARE_API_URL`. |
| `hooks/useShareRecipe.ts` (new) | App-side state machine: idle → minting → done/error, with snapshot memoisation. |
| `constants/dotIcons.ts` (modify) | A `share` 9×9 glyph. |
| `components/RecipeOverflowSheet.tsx` (modify) | The Share row. |
| `app/editRecipe.tsx` (modify) | Wires the hook to the sheet and to the RN share sheet. |
| `api/share.ts` (new) | The Vercel function. Validates, rate-limits, mints, returns the URL. |
| `api/_lib/payload.ts` (new) | Request-shape validation. **Must not import from `library/`.** |
| `api/_lib/rateLimit.ts` (new) | Pure window/limit arithmetic over a `Counter`. |
| `api/_lib/store.ts` (new) | `Counter` interface + in-memory impl + Upstash REST impl. |
| `api/_lib/xbloom.ts` (new) | RSA chunk encryption, login, recipe POST. |
| `vercel.json`, `public/index.html`, `.vercelignore` (new) | Deploy config that skips installing the Expo tree. |
| `PRIVACY.md`, `app/about.tsx`, `.gitignore` (modify) | Disclosure and hygiene. |
| `docs/machine-integration/share-deploy.md` (new) | Deployment runbook for the user. |

**Critical: `api/` must never import from `library/`.** `library/shareLink.ts` imports `Recipe`, which imports `NFC`, which imports `react-native-nfc-manager`. Pulling that into the serverless bundle will break the deploy. The app maps the payload; the function validates the shape independently.

**Critical: `Recipe.shareId` already exists** (line 75) and holds the *imported* base64 share id. Do not reuse it. The new fields are `sharedTableId` and `shareSnapshot`.

---

### Task 1: Spike — verify the mint actually works

**This task gates every other task.** Nothing below is worth writing if `tuRecipeAdd.tuhtml` does not behave as `docs/machine-integration/cloud-api.md` describes. The spike is throwaway: it lives in `/tmp`, it is never committed, and no test covers it.

It settles three documented uncertainties:
1. `adaptedModel` — sources disagree between `1` and `2`.
2. `bypassVolume` — sources disagree between `0.0` and `5.0`.
3. Whether `pourCount` must be sent explicitly or is derived from `pourDataJSONStr`.

**Files:**
- Create: `/tmp/xbrw-spike/mint.mjs` (throwaway)
- Read: `docs/machine-integration/cloud-api.md`, `.env.local`

- [ ] **Step 1: Confirm the credentials are present**

Run: `cd /Users/jesperhessius/Dev/XBRecipeWriterPlus && grep -c XBLOOM .env.local`
Expected: `2` (an `XBLOOM_EMAIL` line and an `XBLOOM_PASSWORD` line). If this file is missing, stop and report — the spike cannot run and the milestone cannot be verified.

- [ ] **Step 2: Write the spike script**

Create `/tmp/xbrw-spike/mint.mjs`:

```js
import { readFileSync } from "node:fs";
import { publicEncrypt, constants, createPublicKey } from "node:crypto";

const env = Object.fromEntries(
  readFileSync("/Users/jesperhessius/Dev/XBRecipeWriterPlus/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBhs4tqTA/YfCFTvCTZLdRxCEBAf2vsxs9AmvpAdaigBhWtFrxtHm0iByBRvbPGE8xdrVXbSLbe/Fq1nzMcVjHXO5vRLuLKKgTFRV82K9RE8/6Y1ry9DAJLIvJlEIYNqrTsRvNQZlgcSs/aXbSaqDBhmpxCgWiRRGkfBt5MyMi0QIDAQAB
-----END PUBLIC KEY-----`;

const HEADERS = {
  "Content-Type": "application/json",
  Referer: "https://share-h5.xbloom.com/",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

function encrypt(plaintext) {
  const key = createPublicKey(PUBLIC_KEY);
  const bytes = Buffer.from(plaintext, "utf8");
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 117) {
    chunks.push(publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, bytes.subarray(i, i + 117)));
  }
  return Buffer.concat(chunks).toString("base64");
}

async function login() {
  const res = await fetch("https://client-api.xbloom.com/tMemberLogin.thtml", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      email: env.XBLOOM_EMAIL,
      password: env.XBLOOM_PASSWORD,
      interfaceVersion: 20240918,
      skey: "testskey",
      phoneType: "Android",
      clientType: 2,
      languageType: 1,
      jpushId: "",
    }),
  });
  const json = await res.json();
  console.log("LOGIN:", JSON.stringify(json).slice(0, 400));
  return json;
}

async function mint(session, overrides) {
  const payload = {
    memberId: session.memberId,
    token: session.token,
    interfaceVersion: 20240918,
    theSubsetId: 0,
    theName: "XBRW Spike " + Date.now(),
    theColor: "#8C5A3B",
    dose: 18,
    grandWater: 16,
    grinderSize: 55,
    isSetGrinderSize: 1,
    rpm: 90,
    cupType: 1,
    bypassTemp: 85.0,
    bypassVolume: 0.0,
    subSetType: 2,
    appPlace: [4],
    isShortcuts: 2,
    isEnableBypassWater: 2,
    adaptedModel: 1,
    createTimeStamp: Date.now(),
    pourDataJSONStr: JSON.stringify([
      {
        theName: "Bloom",
        water: 50,
        temperature: 93,
        pattern: 1,
        pausing: 30,
        flowRate: 3.5,
        isEnableVibrationBefore: 2,
        isEnableVibrationAfter: 2,
      },
      {
        theName: "Pour 2",
        water: 238,
        temperature: 93,
        pattern: 2,
        pausing: 0,
        flowRate: 3.5,
        isEnableVibrationBefore: 2,
        isEnableVibrationAfter: 2,
      },
    ]),
    ...overrides,
  };
  const res = await fetch("https://client-api.xbloom.com/tuRecipeAdd.tuhtml", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(encrypt(JSON.stringify(payload))),
  });
  const text = await res.text();
  console.log("MINT", JSON.stringify(overrides), "->", res.status, text.slice(0, 500));
  return text;
}

const login_ = await login();
const session = {
  memberId: login_?.data?.member?.tableId ?? login_?.member?.tableId,
  token: login_?.data?.token ?? login_?.token,
};
console.log("SESSION:", session);

// A: baseline, adaptedModel 1 / bypassVolume 0.0
await mint(session, {});
// B: adaptedModel 2
await mint(session, { adaptedModel: 2, theName: "XBRW Spike AM2 " + Date.now() });
// C: bypassVolume 5.0
await mint(session, { bypassVolume: 5.0, theName: "XBRW Spike BV5 " + Date.now() });
// D: explicit pourCount
await mint(session, { pourCount: 2, theName: "XBRW Spike PC " + Date.now() });
```

- [ ] **Step 3: Run the spike**

Run: `mkdir -p /tmp/xbrw-spike && node /tmp/xbrw-spike/mint.mjs`
Expected: a `LOGIN:` line with a non-null token, a `SESSION:` line with a numeric `memberId`, and four `MINT` lines. A success response contains a row id (look for `tableId` or `data`).

If the login shape differs from what the script guesses, print the whole login JSON and adjust the `session` extraction. If the *response envelope* differs from `cloud-api.md`, **update the doc** as part of Task 1's commit.

- [ ] **Step 4: Read back and open one link**

For the row id `N` returned by variant A, build the link and fetch it:

```bash
node -e 'const id=process.argv[1];console.log("https://share-h5.xbloom.com/?id="+encodeURIComponent(Buffer.from(String(id)).toString("base64")))' N
```

Then verify the recipe reads back with the values you sent. The app already has a reader — run it through `library/XBloomRecipe.ts`'s endpoint:

```bash
curl -s -X POST https://client-api.xbloom.com/RecipeDetail.html \
  -H 'Content-Type: application/json' \
  -H 'Referer: https://share-h5.xbloom.com/' \
  -d '{"tableId":N,"interfaceVersion":20240918}' | head -c 800
```

Expected: a `recipeVo` object whose `dose` is 18, `grandWater` is 16, `grinderSize` is 55, and whose pour array has two entries with waters 50 and 238.

- [ ] **Step 5: Record the findings**

Append a short "Verified by spike, <date>" subsection to `docs/machine-integration/cloud-api.md` section C stating, for each of the three uncertainties, what the server actually accepted. If a variant was rejected, say so — a rejection is as informative as an acceptance.

**Then update this plan file**: replace the `adaptedModel`, `bypassVolume` and `pourCount` values used in Task 2 with what the spike confirmed, so later tasks do not re-litigate it.

- [ ] **Step 6: Commit the findings only**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'docs: record share-link mint spike findings' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add docs/machine-integration/cloud-api.md docs/superpowers/plans/2026-08-31-share-link.md
git commit -F /tmp/msg
```

The script in `/tmp` is not committed. Do not add an `api/` or `library/shareLink.ts` file in this task.

**If the spike fails outright** — login rejected, or every mint variant returns an error — stop and report. Do not proceed to Task 2. The milestone is not deliverable and the user needs to know that before more code is written.

---
