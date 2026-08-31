# Third-Party xBloom App Survey — Product & UX Findings
*Research for XBRW++ v2 feature planning. Surveyed: 2026-08-30.*
*Claim tags: **code-verified** = read the source; **readme-claim** = README only; **inferred** = deduced from structure.*

---

## Repositories Surveyed

| Repo | Licence | Language | One-line purpose |
|---|---|---|---|
| `Alshekhi/xbloom-studio` | **MIT** | Python | Home Assistant integration — most complete BLE control surface |
| `saya6k/hacs-xbloom` | **MIT** | Python | Second HA integration, clean-room BLE client, LLM/Assist tools, community hub search |
| `HomoLand/xbloom-studio-web` | **None** | TypeScript + Python | Full-stack web app: brew UI, recipe library, AI design, MCP server |
| `HomoLand/xbloom-studio-brew` | **MIT** | Python | AI Agent Skill + shared BLE bridge daemon (`xbloom-studio-core`) |
| `Lui35/Xbloom` | **None** | TypeScript | Electron desktop app; genuine brew UI, history, recipe editor |
| `KhalidOnzi/xbloom-app` | **None** | Swift (SwiftUI) | iOS: bean photo → GPT-4o → recipe → push to xBloom cloud |
| `hgstrm/pourpilot` | **MIT** | TypeScript (Next.js) | PWA: bean photo → AI recipe → xBloom cloud + local brew log |
| `denull0/xbloom-agent` | **MIT** | TypeScript (Deno) | MCP server on Supabase; lets Claude create/manage/import recipes |
| `Ahmad9077/xbloom-bean-to-bloom` | **None** | TypeScript (Cloudflare) | Bean photos → structured AI recipe → cloud D1 storage + Mac bridge queue |

---

## A. Feature Matrix

> ✅ = **code-verified** implemented  |  ⚠️ = **readme-claim** (not code-verified)  |  ❌ = absent  |  〜 = partial/inferred

| Feature | Alshekhi/HA | saya6k/HA | HomoLand/web | HomoLand/brew | Lui35/Electron | KhalidOnzi/iOS | hgstrm/PourPilot | denull0/Agent | Ahmad9077/B2B |
|---|---|---|---|---|---|---|---|---|---|
| **Brew control** (start/stop/pause/resume) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Live telemetry** (scale weight, temp, status) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Library management** (local CRUD) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Recipe creation/editing** (all pour fields) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Share-link import** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Grinder control** (standalone) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Scale** (tare, live read) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Machine settings** (units, water source, display) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Brew history/logging** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **A/B/C slot writing** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Multi-machine** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI recipe generation** (text/photo) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Bean photography → recipe** | ❌ | ❌ | ✅ | 〜 | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Tea recipes** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Firmware OTA** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cloud recipe sync** (xBloom account) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Community hub search** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Accessibility / voice** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Iced/cold-brew mode** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

### Notes on load-bearing claims

- **Alshekhi/xbloom-studio — brew control, live telemetry, scale, grinder, slots**: fully code-verified across `live_session.py`, `ble_entities.py`, `button.py`, `services.yaml`. The `session_event_filter` function explicitly handles weight, grind size/speed, brew pattern, temperature, ratio, tare, module navigation, and recipe-card scan via named BLE cmd constants. [code-verified, `Alshekhi/xbloom-studio:custom_components/xbloom/live_session.py:1-200`]

- **saya6k/hacs-xbloom — multi-machine**: the README states "One API is registered per machine, so multi-machine households pick per agent." A `llm_api.py` file exists (517 lines). [readme-claim, confirmed by file structure]

- **saya6k/hacs-xbloom — community hub search**: `cloud_search_collective_recipes` service is listed in `services.yaml` (21 KB, among the largest in the repo). [code-verified by file name + README]

- **Lui35/Xbloom — brew UI**: `App.tsx` (51 KB) contains a complete `estimateBrew()` function simulating pour-by-pour water dispensed from real recipe parameters, a `BrewChart` canvas component rendering live dual-line charts (water poured vs. coffee collected), and telemetry polling every 1 s. Brew history writes to `localStorage`. [code-verified, `Lui35/Xbloom:src/App.tsx:1-350`]

- **hgstrm/pourpilot — iced/cold-brew**: `page.tsx` has a `brewMode: "hot" | "iced"` state, UI for brew water ml and ice grams, and sends these to `/api/analyze`. The `openai.ts` equivalent in `Ahmad9077/xbloom-bean-to-bloom` shows the validated schema for this: `icedServing: { iceG, totalBeverageMl, instruction }`. [code-verified for both]

- **HomoLand/xbloom-studio-web — brew control**: `Dashboard.tsx` (62 KB) contains explicit handling of control actions: `pause`, `resume`, `stop`, `cancel` through both Web Bluetooth and bridge HTTP paths, with sticky-busy detection, stale-workflow protection, and a `BrewConfirmDialog`. [code-verified, `HomoLand/xbloom-studio-web:frontend/src/pages/Dashboard.tsx:1-200`]

- **KhalidOnzi/xbloom-app — brew history**: the `Features/History` directory exists in the Xcode project, which is more than most iOS apps have. [code-verified directory exists; content not read]

---

## B. What's Genuinely Novel

### B1. Bean photography → AI recipe (5 projects)
**denull0/xbloom-agent**, **KhalidOnzi/xbloom-app**, **hgstrm/pourpilot**, **Ahmad9077/xbloom-bean-to-bloom**, and **HomoLand/xbloom-studio-web** all do this. The pattern is: vision model reads the bag front (and optionally back), extracts origin/process/roast/tasting notes → text is passed to a reasoning model → validated structured recipe output.

*Assessment for XBRW++:* **High fit for a phone app.** A phone has a camera; NFC card-writing already requires bringing the phone close to something physical. The natural extension: photograph the bag, get a recipe, write it to a card in one flow. No competitor does all three steps natively on iPhone. XBRW++ already has the card-writing end; adding the vision-to-recipe step would close the loop.

### B2. MCP / AI agent control (2 projects)
**denull0/xbloom-agent** exposes 7 recipe-management tools to Claude via MCP on Supabase Edge Functions. **HomoLand/xbloom-studio-web** has an MCP server (`mcp_server.py`) with ~20 tools covering scan, probe, load, start, stop, cancel, pause, resume, scale, grinder, catalog, history. **saya6k/hacs-xbloom** exposes HA Assist/LLM tools.

*Assessment for XBRW++:* **Weak fit for a phone app as primary UX.** MCP is for desktop AI clients. But the underlying idea — "tell an AI what you want, get a recipe" — is exactly what the bean-photo flow does on mobile. The phone form factor favours the photo approach over text conversation.

### B3. Brew logging + tasting notes feedback loop
**hgstrm/pourpilot** has a brew log in Neon Postgres with ratings per brew, and an AI "taste adjustment" flow: tell the AI "too bitter/sour/weak" and it rewrites the recipe. **HomoLand/xbloom-studio-web** has a `History.tsx` page (19 KB) and `HomoLand/xbloom-studio-brew` maintains a `history_events` SQLite table fed from live BLE telemetry (`load/start/cancel/complete`). **Lui35/Xbloom** stores a local brew history in `localStorage` (up to 100 records: recipe name, duration, water poured, coffee collected, step count).

*Assessment for XBRW++:* **Moderate fit, high value.** XBRW++ already owns the recipe; adding "rate this brew" and "make it brighter/sweeter" closes the loop that no one currently offers in a polished phone app. The rating doesn't need the machine at all — it's purely a library enrichment feature. The AI-rewrite step requires a backend call; that's a design choice.

### B4. Iced/flash-brew mode
**hgstrm/pourpilot** and **Ahmad9077/xbloom-bean-to-bloom** both model iced serving: the machine brews a reduced water volume (e.g., 150 ml) over pre-measured ice (e.g., 100 g) in the serving cup. The recipe card carries no "iced mode" flag — the machine just brews less water; the user is told via the recipe name/instructions. Ahmad9077's schema enforces: `totalBeverageMl = brewWaterMl + iceG`, ratio 1:12–1:20, ice 100–120 g. [code-verified, `Ahmad9077/xbloom-bean-to-bloom:src/openai.ts:RECIPE_SCHEMA`]

*Assessment for XBRW++:* **Excellent fit.** XBRW++ already edits every pour field; an "iced mode" is just a recipe template with reduced total volume and an instruction note field. No BLE involvement needed; works with the card format XBRW++ already understands.

### B5. Grind-size reference table by brew method
**saya6k/hacs-xbloom** ships a comprehensive grind reference table in its README (Turkish 0–3 through French Press 47–80, Cold Brew 58–80). [code-verified from README]. **HomoLand/xbloom-studio-brew** bundles a `knowledge/` corpus of brewing science. **Lui35/Xbloom** has a `grindLabel()` helper that maps ranges to method names inline in `App.tsx`. [code-verified]

*Assessment for XBRW++:* **Easy win.** The recipe editor could show "this grind setting is: Espresso range / AeroPress / Pour-over / French press" as contextual help. Pure client-side, no dependencies.

### B6. Accessibility-first design (Alshekhi only)
**Alshekhi/xbloom-studio** is the only project that explicitly designs for screen-reader users. The README states: "The machine is driven by three physical knobs and gives no spoken feedback, and the official app isn't accessible to screen readers, so a blind or low-vision owner can't really tell what the machine is doing." The dashboard is described as "laid out for screen-reader navigation throughout." Three announcement blueprints speak brew progress, live feedback, and faults bilingually (English/Arabic). [code-verified from README + live_session.py structure]

*Assessment for XBRW++:* **Strong principle to adopt, not copy.** The card-writing flow relies on camera viewfinder for NFC positioning — that's inherently visual. But recipe browsing, editing, and import are all text-based and should be accessible. This is a gap nobody else in the phone-app space addresses.

### B7. Per-pour taste iteration with brewing science reasoning
**HomoLand/xbloom-studio-brew** cites specific methodologies: Kasuya 4:6, Hoffmann, Rao, explicitly adapted for the Omni dripper. It distinguishes flat-bottom vs. cone adaptations and treats xPod recipes as "roaster intent, not Omni-native." **hgstrm/pourpilot** claims the same (Kasuya, Hoffmann, Rao) in its README. [readme-claim for pourpilot; code-verified for HomoLand via references/ directory structure and README detail]

---

## C. UX Patterns for Brewing

### Which projects actually drive a brew
Only **Alshekhi/xbloom-studio**, **saya6k/hacs-xbloom**, **HomoLand/xbloom-studio-web**, **HomoLand/xbloom-studio-brew**, and **Lui35/Xbloom** actually start/stop/monitor a brew. The rest push recipes to the cloud for the official app to brew.

### C1. What the user sees during a brew

**Lui35/Xbloom** (most transparent): [code-verified, `Lui35/Xbloom:src/App.tsx:1-500`]
- A dedicated "Brew" nav tab appears when brewing starts.
- A `BrewChart` canvas shows two live smoothed curves: estimated water dispensed (blue) and actual coffee collected on scale (yellow-green). Updated every 250 ms.
- A phase label: "Blooming" (pour 0) / "Pouring" (pours 1+) / "Resting after pour" / "Complete".
- An elapsed timer (mm:ss).
- A "Stop brew" button active throughout.
- A water-level alert banner (`<AlertTriangle>`) if `telemetry.waterLevelOk === false`.
- On completion, a history record is written automatically (recipe name, duration, water, coffee, steps).

**HomoLand/xbloom-studio-web** (most sophisticated): [code-verified, `Dashboard.tsx`]
- Adaptive polling interval (faster when workflow active, slower when idle).
- Tracks a durable `workflow_id` across page reloads via `localStorage`.
- Shows `phase` (normalised from bridge state): loading → armed → starting → brewing → paused → complete.
- Controls shown depend on phase: cancel (loading/armed), pause (starting/brewing), resume (paused), stop (brewing).
- Separate sticky "device busy external" banner for the case where another BLE client (the official app) has the connection.
- Recovery/reconcile path for when the brew monitor detects a gap in events.
- "Brew again" + "View history" banner on completion.
- Stale-workflow mismatch detection (page was loaded, user navigated away, brew finished in background).
- BLE release label: shows when BLE was released after brew ended.

**Alshekhi/xbloom-studio** (HA dashboard): [code-verified from README + code]
- Context-aware dashboard that "follows the machine from screen to screen."
- Spoken brew announcements via TTS/Alexa: grinding → pouring → ready.
- Machine status sensor: `idle → grinding → brewing → done`.
- Per-stage events: `grinder_started`, `grinder_stopped`, `brewer_started`, `pour_started` (with `pour_index`), `bypass_started`, `brew_ended`.
- Fault states announced by name: no water, no beans, dose/water error, gear position error.
- The Connect switch is required for live streaming; holding it blocks the official iOS app.

### C2. Failure states enumerated

From the Alshekhi code (most explicit): [code-verified, `live_session.py:1-100`, `README.md`]

| State | What happens |
|---|---|
| `no_water` | Machine reports; spoken as "The xBloom is out of water" |
| `no_beans` | Spoken as "The xBloom is out of beans" |
| `gear_position_error` | Spoken as "Check the xBloom's dripper position" |
| `dose_water_error` | Generic "dose or water problem" |
| BLE connection drop mid-brew | HomoLand tracks this as a gap in events; reconcile endpoint for recovery |
| Another BLE client holding connection | Sticky "device_busy_external" banner in HomoLand web; "iOS app can't connect" note in Alshekhi |
| Connect switch left on | Blocks official iOS app (single BLE client at a time) |
| Firmware timing | 28-second connect delay with stale adapter (documented in Alshekhi troubleshooting) |
| Page closed mid-brew | HomoLand: "page/MCP process exit does not cancel workflow, does not release BLE" |
| Brew estimation vs real telemetry mismatch | Lui35: falls back to `telemetry.state === "complete"` or elapsed > totalTime + 15s |

From HomoLand/xbloom-studio-web Dashboard.tsx (code-verified):
- Auth expired mid-poll → polls stop, error shown
- `staleMismatch` → page workflow stale vs. active workflow; explicit acknowledgement required before control
- `eventSyncWarning` → gap in event stream (connection drop, daemon restart)
- `observeHealth: "stale" | "offline"` → visual health indicator on bridge status

### C3. The pre-brew confirmation pattern
**Lui35/Xbloom** uses `window.confirm("Start X?\n\nCheck that the water tank, beans, dripper, and cup are in place.")` — a native browser dialog. [code-verified, `App.tsx`]
**HomoLand/xbloom-studio-web** uses a `BrewConfirmDialog` component with a structured checklist. [code-verified from import in Dashboard.tsx]
**HomoLand/xbloom-studio-brew** uses a CLI confirmation phrase and safety gates for physical-readiness. [readme-claim from README safety model section]

---

## D. Library and Sync

### Source-of-truth models found

**Alshekhi/xbloom-studio** — Dual-mode: local SQLite (HA `.storage`) OR cloud. On cloud sign-in, user chooses to upload local or discard. Cloud sync is event-driven, not polled. `Refresh Recipes` button pulls from cloud on demand. [code-verified from README + storage.py]

**saya6k/hacs-xbloom** — **Local-first, seeded once**. On install, seeds from cloud account or bundled defaults. After that: no background sync. Delete is local-only; cloud deletion happens in the official app. Recipe identity is a stable local `uid`; services accept uid, cloud id, share URL, or exact name interchangeably. Previous background sync removed in a documented breaking-change release. [code-verified from README breaking-changes section]

**HomoLand/xbloom-studio-web** — Local catalog in SQLite (via xbloom-studio-core), with cloud as import/export boundary. `cloud_import_recipe` fetches from share URL; `cloud_export_recipe` pushes a local recipe and returns a stable share link. No background sync. [code-verified from README]

**hgstrm/pourpilot** — Server-side Neon Postgres. xBloom cloud is a push destination only. Local save + cloud push are separate explicit actions. `xbloomId` field on saved recipe tracks whether it's been pushed. [code-verified from `recipes/page.tsx` showing `r.xbloomId` badge + README architecture]

**Lui35/Xbloom** — `localStorage` for both recipes and history. No server, no cloud sync. On startup, reads from `localStorage` with fallback to `initialRecipes`. [code-verified, `App.tsx`]

**KhalidOnzi/xbloom-app** — xBloom cloud only. No local persistence mentioned; recipes exist on xBloom servers. [readme-claim]

**denull0/xbloom-agent** — Supabase D1. Recipes live in the cloud (user's xBloom account), managed via MCP tools. Session tokens are AES-256 encrypted at rest. [code-verified from README + supabase directory structure]

### Conflict handling
Nobody addresses genuine bi-directional sync conflicts. The most sophisticated approach is saya6k's explicit "last-write wins, no sync" stance: local edits are final, and cloud deletion is left to the official app. This is the most honest design among the group.

Alshekhi's event-driven sync ("press Refresh Recipes") means if you edit on the phone and press refresh in HA, the phone version wins — by design. No merge.

**XBRW++ implication:** The current local-only, no-account approach is the cleanest of all. The risk is that users who also use saya6k's HA integration may have two separate recipe libraries with no path to merge them. Worth documenting but not necessarily solving in v2.

---

## E. Gaps — Where Nobody Does Well

### E1. ★★★ The NFC card as the portable recipe format (XBRW++'s unique advantage)
Nobody else touches NFC. Every other project sends recipes to the xBloom cloud and requires the official app or a BLE connection to brew. **XBRW++ is the only project that makes a recipe independent of cloud, account, and BLE** — a card you can hand to a friend whose machine will brew it without any app.

This is genuinely novel and under-exploited. Nobody has built the obvious extension: use the card as a sharing medium. A QR code on a card could encode the share URL; the receiver scans it with XBRW++, imports the recipe, writes it to their own card. This closes the "gift a recipe" loop that nobody else has.

### E2. ★★★ Polished phone-native brew logging without a machine connection
All brew-history implementations require either BLE telemetry (Lui35, HomoLand) or cloud push (pourpilot, Ahmad9077). Nobody offers: "I just brewed this recipe from the card (or app) — let me log how it went and rate it." A post-brew rating screen ("How was it?" 1–5 stars + short notes + "too bitter / too sour / too weak / just right") that links to the recipe in the local library would be useful and requires zero BLE. This also works for users who brew from the card, not from an app-driven start.

### E3. ★★ Bean photography → card write in one mobile flow
Five projects do photo → AI recipe, but none does photo → recipe → NFC card. XBRW++ is uniquely positioned to do this because it already has the card writer. The AI step requires a cloud API key, which is an architecture decision (server-side vs. user-supplied). The simplest approach is user-supplied OpenAI key stored in Keychain (following KhalidOnzi's model).

### E4. ★★ Grind-size guidance in the recipe editor
Nobody offers contextual "this grind setting maps to: espresso / pour-over / French press" guidance in a card editor. Lui35 has a `grindLabel()` helper and the saya6k README has the full table. XBRW++'s recipe editor already has grind size as a field. Adding a one-line label underneath the slider costs nothing.

### E5. ★ Iced-brew recipe template
No one has a first-class "iced recipe" template in a card-writing context. XBRW++ could offer a toggle: "serve iced — reduce brew water by X%, remind user to pre-load Yg of ice." The recipe card fields don't change; only the total water volume decreases and a text note is embedded in the recipe name. Pure client-side, no backend.

### E6. Community recipe collection browsable on-device
saya6k has `cloud_search_collective_recipes` that queries `collective.xbloom.com` — nobody else does. The xBloom community hub is publicly queryable (no login). XBRW++ could offer a "Browse community recipes" screen that fetches from the hub, previews the recipe, and lets the user write it directly to a card. This is a high-effort feature but would differentiate XBRW++ from every other app.

### E7. Tea recipes with siphon drain awareness
Only Alshekhi, saya6k, HomoLand, and denull0 support tea recipes correctly. The key subtlety: each steep is a pour with `pause_seconds` = soak time; the firmware handles the siphon drain internally as "bypass." The xBloom card format presumably carries tea recipes in the same fields; XBRW++'s card writer likely already supports the byte layout (since it edits per-pour fields). Adding tea templates to the recipe library is a low-cost win.

---

## F. Maturity and Health

### F1. `Alshekhi/xbloom-studio` — **MIT, actively maintained, most trustworthy**
- Well-structured Python codebase with a test suite (`pytest.ini`, `tests/` directory), type annotations, and clean separation of concerns (`live_session.py`, `ble_entities.py`, `coordinator.py`, `config_flow.py`).
- README is unusually honest: documents the Connect-switch/iOS-app conflict, troubleshooting steps (stale Bluetooth adapter), and firmware OTA risks.
- Bilingual (English/Arabic), accessibility-first design philosophy.
- **Recommendation:** Ideas and architecture can be studied freely. MIT licence. Do not copy code.

### F2. `saya6k/hacs-xbloom` — **MIT, actively maintained, most feature-rich**
- Clean-room BLE re-implementation with cited protocol sources (fhenwood/PyBloom MIT, brAzzi64/xbloom-ble MIT). Has ADR (Architecture Decision Records) directory. 
- Has CI, devcontainer, CHANGELOG, Korean+English translations, LLM API opt-in, community hub search.
- Requires HA `2026.9.0.dev202608241354` — a nightly build as of survey date. Risky dependency.
- Breaking changes are documented clearly (services renamed, sync model overhauled).
- **Recommendation:** The local-first recipe model with stable UIDs and cross-identifier addressing is the best-designed library architecture in the group. MIT, safe to study.

### F3. `HomoLand/xbloom-studio-web` — **No licence, sophisticated but complex**
- Monorepo with a 62 KB `Dashboard.tsx`, 31 KB `api.ts`, 30 KB `Recipes.tsx`. This is not a weekend project.
- All-rights-reserved. Ideas (workflow_id tracking, gap detection, sticky-busy banner) are valuable UX patterns; the code itself cannot be reused.
- README is in Chinese; the code is in English. Actively developed.
- Depends on `xbloom-studio-brew` sibling checkout for production; coupling is real.
- **Recommendation:** Read the UX patterns in Dashboard.tsx carefully; do not attempt to use or adapt the code.

### F4. `HomoLand/xbloom-studio-brew` — **MIT, most technically serious**
- Python Agent Skill with persistent BLE bridge daemon, brew-history SQLite journal, recipe validation schemas, safety model with gated remote start, grinder 30s cooldown, firmware allowlist.
- Has CI (`.github/workflows/test.yml` badge), release tooling, universal locked deps.
- Chinese README, English code. Actively maintained; v1.0.1 passes Hermes community-source guard.
- **Recommendation:** MIT. The safety model documentation is the best reference in the ecosystem for understanding what can go wrong with remote BLE control.

### F5. `Lui35/Xbloom` — **No licence, prototype-quality but genuine**
- All application logic in one 51 KB `App.tsx`. No server. No tests. No CI.
- Brew simulation mode is a cute UX idea (4× speed, so you can see the brew chart without a machine).
- Recipe data is hardcoded as `initialRecipes` then saved to `localStorage`. No import.
- README says "simulated brew progress" — the code confirms: `estimateBrew()` is a pure function of recipe params and elapsed time; real BLE data is used to overlay actual coffee weight but the phase/step/chart would work with no machine connected.
- Last commit activity: cannot determine from this survey; structure suggests ongoing development.
- **Recommendation:** All-rights-reserved. The brew chart UX pattern and the simulation mode are worth understanding conceptually.

### F6. `KhalidOnzi/xbloom-app` — **No licence, thin but well-structured Swift**
- SwiftUI + Xcode project. Features: Analyze, Capture, History, Recipe, Settings. Explicit Keychain storage for API keys and xBloom password.
- `AnalyzeView.swift` (1.5 KB) and `ProfileView.swift` (3.1 KB) are small — photo analysis is likely delegated server-side via GPT-4o.
- README explicitly says: "The app never starts a brew and never talks to the machine over Bluetooth." It is solely recipe-creation-and-push.
- Authored on Windows; requires Mac to build. Single developer.
- **Recommendation:** All-rights-reserved. The Keychain credential pattern (keys stored in iOS Keychain, never hardcoded) is the correct practice for XBRW++ if it ever handles user API keys.

### F7. `hgstrm/pourpilot` — **MIT, cleanest UX-focused codebase**
- Next.js 14 + shadcn/ui + Zod validation. Single-developer but has CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, DISCLAIMER.
- Self-hosted model: user deploys to Vercel with their own xBloom credentials. This means the xBloom password lives in Vercel env vars — riskier than Keychain, but a reasonable tradeoff for a self-hosted tool.
- Explicitly credits `denull0/xbloom-agent` for the API integration.
- Cold-brew calculator is a static page (no AI). The iced-brew flow is the most thoughtfully implemented.
- Brew log is per-recipe in Postgres; no "log a manual brew" entry point.
- **Recommendation:** MIT. The page.tsx and recipe schema are safe to study. The iced-brew schema and UX flow are well-designed.

### F8. `denull0/xbloom-agent` — **MIT, 19 stars, the most-shared project**
- Deno 2.x on Supabase Edge Functions. 7 MCP tools. AES-256 session encryption.
- Recipe parameters are validated by the tool implementation, not by a schema. The grind_size range cited (40–120) differs from other projects (1–80); unclear which is correct. [readme-claim]
- Passwords are explicitly never stored — used once for login, then discarded. Session tokens are kept.
- Publicly hosted MCP endpoint (`ramaokxdyszcqpqxmosv.supabase.co`) — the most accessible of all tools for end users.
- **Recommendation:** MIT. The concept is proven (19 stars). The hosted endpoint makes it accessible to non-technical xBloom users. XBRW++ does not need to replicate this, but the Claude-native "describe your beans, get a recipe" flow is clearly popular.

### F9. `Ahmad9077/xbloom-bean-to-bloom` — **No licence, the most production-hardened web service**
- Cloudflare Worker + D1 + Workers AI + OpenAI Responses API (GPT-5.4 with `store: false`).
- Security: PBKDF2-SHA256 hashing, constant-time comparison, rate limiting (5 login failures/15 min, 10 recipe generations/hour), image magic-byte validation, CSP headers, same-origin enforcement.
- The "cloud D1 bridge queue" pattern solves the loopback-to-iPhone problem: instead of calling `127.0.0.1:3999` (which resolves to the iPhone, not the Mac), a cloud queue allows the Mac service to poll and execute.
- Uses GPT-5.4 with structured JSON schema output and `reasoning: { effort: "medium" }`. Separation: Workers AI does image analysis; OpenAI receives only sanitised text. [code-verified, `src/openai.ts`]
- **Recommendation:** All-rights-reserved. The image-privacy pattern (EXIF stripped, bytes never logged, never sent to text model) is a model worth following for any XBRW++ feature that handles photos.

---

## Licence Provenance — "Would Need Attribution or Permission"

*These are observations about architecture and UX patterns, not implementation-level findings. No code is flagged for copying.*

No code in this survey can be directly reused from the no-licence repos (HomoLand/xbloom-studio-web, Lui35/Xbloom, KhalidOnzi/xbloom-app, Ahmad9077/xbloom-bean-to-bloom, HomoLand/xbloom-studio-brew/skills — but NOT its `packages/core` which is MIT).

The following MIT-licensed ideas are free to implement independently:

- **Alshekhi/xbloom-studio** (MIT): The fault-state enumeration (`no_water`, `no_beans`, `gear_position_error`, `dose_water_error`) is a documented reality of the BLE protocol. Any app that watches brew status needs to handle these.
- **saya6k/hacs-xbloom** (MIT): The grind-size reference table by brew method (0–80 scale mapped to Turkish/Espresso/Moka Pot/… /Cold Brew) is factual coffee knowledge, not protectable expression.
- **hgstrm/pourpilot** (MIT): The iced-brew `totalBeverageMl = brewWaterMl + iceG` invariant and the 100–120g ice constraint are engineering choices that XBRW++ would need to derive independently from the machine's capabilities.
- **denull0/xbloom-agent** (MIT): The MCP tool surface design. Ideas, not code.

**One item that would need explicit permission or independent derivation:** The `workflow_id` tracking pattern in `HomoLand/xbloom-studio-web` (durable brew session identity persisted to localStorage, polling with gap detection) is a non-obvious engineering solution to a real problem (page reload during a brew). If XBRW++ ever does live brew monitoring, this architecture should be re-derived independently. The concept is: assign a stable ID to a brew session at load time, not at start time, and survive page/app lifecycle events with that ID.

---

## Summary Table: Should XBRW++ Care?

| Finding | Effort | Value | XBRW++ fit |
|---|---|---|---|
| Bean photo → recipe → card (one flow) | Medium (API key management) | ★★★ | **Best gap to fill** |
| Post-brew rating + "make it brighter" | Low (local only) | ★★★ | Easy win, no BLE needed |
| Iced/cold-brew recipe template | Low | ★★ | Easy win, card format fits |
| Grind-size guidance in editor | Trivial | ★★ | Free UX improvement |
| Tea recipe templates | Low | ★★ | Format already supported |
| NFC card as sharing medium (QR encode) | Medium | ★★ | Unique to XBRW++ |
| Community hub browse → write to card | High | ★★ | Longer-term |
| Live brew monitoring (BLE) | High | ★ | Different product; breaks iOS app |
| Brew logging from BLE telemetry | High | ★ | Requires BLE; out of scope for v2 |
| MCP server | Medium | ★ | Niche; desktop-only use case |
| Multi-machine support | Low-Medium | ★ | Only saya6k does it; small market |
