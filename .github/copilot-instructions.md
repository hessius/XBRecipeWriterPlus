# XBRW++ — Copilot instructions

Expo (SDK 57) / React Native app that reads and writes xBloom coffee recipe NFC cards (ISO 15693 / NfcV), stores recipes locally in SQLite, and imports recipes from xBloom share links.

## Commands

```bash
npm install
npx expo start         # dev server (needs a dev client, not Expo Go — NFC is a native module)
npm run ios            # expo run:ios   (add --device for real NFC)
npm run android        # expo run:android
npm run lint           # eslint . (whole repo, not just app/ and components/)
npm test               # jest; npm run test:watch to watch
npx jest path/to/file  # single file; add -t "name" for a single test
npm run typecheck      # tsc --noEmit
npx expo-doctor        # dependency/config health
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and expo-doctor on every push to
main and every pull request. All four must be green; expo-doctor is a hard failure.

`library/__tests__/` holds characterisation tests for the card byte format, volume math, and legacy JSON migrations. `cardFixtures.ts` is a deliberately **independent** reimplementation of the byte layout, so a round-trip test is not tautological — if you change the format, change both sides consciously. A changed expectation is a regression until proven otherwise: a malformed write to a genuine card is not trivially recoverable.

`components/__tests__/` holds component tests using `@testing-library/react-native`. Note that
its `render` and `fireEvent` are **asynchronous** as of v14 — forget the `await` and `screen`
stays empty and the test silently passes for the wrong reason. Always render via
`renderWithProviders` from `test-utils/render.tsx`, which supplies the Tamagui provider.
`jest.config.js` extends jest-expo's preset rather than replacing it; new deps that ship
untranspiled ESM need adding to `extraEsmPackages` there.

NFC cannot be exercised in a simulator/emulator. Card read/write changes must be verified on a physical device with a real card.

## Architecture

Three layers, strictly separated:

- **`library/`** — plain TypeScript domain classes, no React. This is where all card and business logic lives.
  - `Recipe.ts` — the central model. Owns byte-level (de)serialization (`parseData` / `getData`), CRC-8/MAXIM-DOW checksum via a precomputed `POLY_TABLE`, and volume math (`autoFixPourVolumes`, `fixRatio`, `getTotalVolume`). Also orchestrates `readCard`/`writeCard` against an `NFC` instance.
  - `Pour.ts` — one pour/steep; `POUR_PATTERN` and `AGITATION` constants.
  - `NFC.ts` — transport only. Branches on `Platform.OS`: iOS uses `NfcManager.iso15693HandlerIOS`, Android uses raw `nfcVHandler.transceive` commands (`0x23` read-multiple with a `0x20` single-block fallback, `0x21` write-single). Writes 4-byte blocks.
  - `RecipeDatabase.ts` — expo-sqlite (`xbrecipewriter.db`, sync API). Recipes are stored as a whole JSON blob in `recipes(uuid, recipeJSON)`, not normalized columns. The filename keeps the old app name on purpose: renaming it would orphan every recipe already on a phone.
  - `Settings.ts` — the same database, a `settings` key/value table. `DEFAULTS` is the list of every setting; anything reading or writing settings should derive from it rather than naming keys, which is how `showHints` once went missing from backups.
  - `backup.ts` — `buildBackup` / `parseBackup` / `mergeRecipes`, and the validation an untrusted backup file must pass. Treat this as a trust boundary: the `Recipe` constructor is deliberately forgiving so it can migrate its own old shapes, which makes it useless as a validator, and a bad recipe's next stop is a genuine card.
  - `duplicates.ts`, `units.ts`, `cardLimits.ts`, `importInput.ts`, `notify.ts`, `accent.ts` — dedup on open, temperature conversion (mass and volume deliberately do not convert), per-field limits, the one parser that knows what an xBloom link or pod code looks like, the toast queue, and accent assignment.
  - `XBloomRecipe.ts` — fetches from the undocumented `client-api.xbloom.com` endpoints and maps xBloom's `recipeVo` JSON onto a `Recipe`. Two endpoints: by share id, or by XID (`id.length <= 7`).
  - `library/brew/` — pure TypeScript, no React. `BrewRecord.ts` owns the types (`BrewSample`, `BrewRecord`) and `summarise`, which derives water, cup and held-time figures from a stream. `BrewRecorder` subscribes to the machine's notification and phase streams, accumulates samples, and calls `onRecord` once at the terminal phase — it does not need to be pumped by a component. `brewShape.ts` has the time arithmetic (`pourSeconds`, `pauseSeconds`, `plannedSeconds`) that both the run hook and the recorder use.
  - `BrewDatabase.ts` — two tables, two lifetimes. `brews` is one short row per brew and is kept until the user deletes it; `brew_samples` is roughly 2,400 rows per brew and is swept by the retention setting. `hasStream` tells a record whether its stream survived the sweep — a record without a stream still shows its figures, it just has no trace to draw. The values are copied at write time: recipe name, accent, and volumes are snapshotted so renaming or deleting a recipe cannot rewrite history.
- **`app/`** — expo-router file routes: `index` (library), `editRecipe`, `settings`, `about`, `licences`, `brew`, `brewHistory`, `brewRecord`, plus `+native-intent` (share-extension URL handling) and `[...unmatched]`. Typed routes are enabled. Screens should stay close to layout only.
- **`hooks/`** — the stateful logic the screens used to inline. `useRecipeEditor` owns the recipe and every mutation on it; `useCardWriter` owns the NFC write path; `useRecipeLibrary` owns the library and restore; `useBackup` owns export/import of backup files; `useSetting` binds one setting to state; `useRecipeImport` owns the import lookup state machine; `useCollapsibleHeader` the home screen's header; `useBrewHistory` the history list with optional stream loading; `useTraceAnimation` the animation clock for the brew chart's pre-pour phases. Put new screen logic here rather than growing a route file back to 800 lines.
- **`components/`** — Tamagui presentational/dialog components. Declare them at module scope: a component defined inside another component's body is a new type on every render, so React remounts it and throws away its state. That bug has already been fixed twice here.
  - `PourGlyph` is shared by the brew stage ladder and the editor's stage tile. The sharing is intentional — see §2.3 of `docs/superpowers/specs/2026-09-03-machine-ux-design.md`. Both use the same four glyphs (`centered`, `circular`, `spiral`, `agitation`) with the same accent colour, so the editor and the live screen read visually as the same recipe.
- **`constants/colors.ts`** — every colour in the app. See below.
- **`constants/motion.ts`** — every duration, easing curve and spring. Same rule as colour: a timing that is not in here cannot take part when the app's motion is retuned. Spatial values (widths, opacities) stay with their component.
- **`constants/licences.ts`** — **generated**. Run `npm run generate-licences` (`scripts/generate-licences.sh`); never hand-edit it. Bodies are deduplicated with copyright lines lifted out, so all MIT collapses to one entry.
- **`test-utils/`** — the Tamagui-aware `render` wrapper for component tests.

Import with the `@/` alias (maps to repo root), e.g. `@/library/Recipe`.

## Card format — the part that will bite you

Byte layout (see `Recipe.parseData` / `Recipe.getData`, and `Data Format.png`):

- Bytes 0–31: a signature/hash written by xBloom, derived from the card serial. **The app never recomputes it** — it reads the hash off the card and re-prefixes it. This is why only genuine cards work. `getData(prefix)` splices those 32 bytes off before writing; `NFC.writeCard` starts at block 8 (= byte 32).
- 32–38: XID (ASCII, max 8 chars, zero-padded)
- 39: low nibble = `CUP_TYPE`; for Tea, high nibble = cup count − 1
- 40: pour count `<< 3`
- 41 + 8·n: per-pour records — volume, temperature, pattern, agitation, pause (stored as `256 − seconds`), a combined byte (bits 0–4 = dose, bits 5–7 = pause minutes — **dose and RPM only live in pour 1**), RPM, flow rate
- then: grind size (stored with `GRIND_SIZE_OFFSET` = 40; byte `GRINDER_OFF` = 41 disables the grinder, which is the user-facing value **81**), ratio, CRC-8 checksum
  - The offset is **hardware-verified** (#68): grind sizes written by the app appear as intended on the machine. **Do not widen `GRIND_SIZE` in `cardLimits.ts` below 40** — the encoder would emit a negative byte. The official app's 1–80 scale belongs to the grinder itself (including standalone grinding); a card carries 40–80, which is the machine's whole brewing band.

Other domain invariants:

- The machine rejects a recipe unless the sum of pour volumes equals `dosage × ratio`. `isPourVolumeValid()` guards this; `autoFixPourVolumes()` rescales pours and redistributes rounding error so it holds exactly.
- Ratios are whole numbers only — no `.5`.
- Tea (`CUP_TYPE.TEA`) is special-cased throughout: volumes are clamped to 90 ml, dose defaults to 5 g, the ratio is recomputed with `fixRatio()`, and tea cards always write the default grind size.
- `CUP_TYPE.OMNI` is what the UI calls "overflow protection off".
- `backup` / `offline_backup` / `uid` on a `Recipe` hold raw card bytes for the restore feature — preserve them through any serialization change.
- Legacy JSON migrations live in the `Recipe(json)` constructor (e.g. cup types `0x23`/`0x13`/`0x04`). Don't drop them.

## UI conventions

- **All colour comes from `constants/colors.ts`.** No hex literals and no named CSS colours in
  `app/` or `components/`. Tamagui's `$`-prefixed theme tokens are fine for spacing, size and
  radius, but colour is centralised in the palette module because roughly half the colour call
  sites are plain React Native, react-navigation or SVG props that cannot take a `$token` at all.
  Note that Tamagui's theme proxy has no parent-theme fallback, so a custom key added to `light`
  would not resolve inside a sub-theme such as `light_Button` — hence the plain module.
  Add a semantically named entry (`danger`, `surface`, `muted`) rather than a literal one (`red`).
- **Tamagui** is the component/styling system (`tamagui.config.ts`, providers in `app/_layout.tsx`). Use `XStack`/`YStack`/`Button`/`Dialog` and `$`-prefixed tokens rather than raw RN `StyleSheet`. `@expo/vector-icons` is used for icons (v15 uses kebab-case AntDesign names, e.g. `plus-circle`, not `pluscircle`).
- Dialogs follow the `Dialog` + `Adapt platform="touch"` + `Sheet` pattern, wrapped once in `XbrwSheet.tsx` so every sheet inherits it rather than re-deriving it (see `ImportSheet.tsx` for a consumer).
- **Mutate the `Recipe` object in place and bump a `key` counter** (`setKey(prev => prev + 1)`) to re-render, instead of cloning into state. This was a deliberate performance change — don't "fix" it by making `Recipe` immutable or re-serializing on every keystroke.
- `Stepper.tsx` owns numeric entry: min/max/step, long-press repeat, and per-field limits from `library/cardLimits.ts`.
- **Screen headers are the app's own**, drawn by `ScreenHeader.tsx`. The native header is switched off per route in `app/_layout.tsx` (`headerShown: false`); `app/index.tsx` does it in an effect because it renders its own collapsing header. Don't reach for react-navigation header options.
- Two accent rules in the editor, which look inconsistent but are not (documented on `BrewDeck` in `app/editRecipe.tsx`): a **number** is accented only if it is a term in `dose × ratio = Σ stage volumes`, and in a **choice** control the accent is simply the selected-option fill.
- The **React Compiler is enabled**, so do not hand-write `useMemo`/`useCallback` for new code and
  do not read whole `props` inside a hook — destructure first, or the compiler bails out of
  optimising the entire component. `try`/`finally` also causes a bailout; that one is a compiler
  limitation and is accepted in `useRecipeEditor` and `useRecipeLibrary`.
- Prefer resetting state in the event handler over an effect on a prop. `react-hooks/set-state-in-effect`
  and `react-hooks/purity` are **errors** (the React Compiler enforces them). State cannot be seeded
  or reset from an effect. The house answer is to store a reading together with the phase or machine
  it came from, and discard it at render when they no longer match — `hooks/useTraceAnimation.ts`
  (`ticked.phase`) and `hooks/useBrewRun.ts` (`heard.from`) are the worked examples.
- `react-hooks/exhaustive-deps` is set to **warn**, not error, because the compiler owns
  memoisation. The remaining warnings are deliberate. The other hook rules are errors.
- Import has three doors — the header glyph, `ImportTile.tsx`, and an `expo-share-intent` share — that all open the one `ImportSheet.tsx`; `app/index.tsx` wires them together. `library/importInput.ts` (`parseImportInput`) is the single place that knows what an xBloom link or pod code looks like, so the field and the share intent cannot drift apart; `hooks/useRecipeImport.ts` owns the lookup state machine (debounce, paste-vs-type, de-duplication, atomic-vs-deliberate navigation) and `ImportResult.tsx` draws a found recipe.

## Brew path

The live run is owned by `LiveBrewProvider` (`hooks/useLiveBrew.tsx`), mounted above the navigator in `app/_layout.tsx`. It holds one `useBrewRun` in a `RunOwner` child — there must be exactly one in the tree. `app/brew.tsx` calls `start(recipe)` on mount; while `RunOwner` is live that call is a no-op, so re-mounting the brew screen cannot fire a second brew. Navigating away does not stop the run or lose the history write; both happen inside `RunOwner`, which is above the navigator.

The two water failures are different events and the UI must treat them differently. A `blocked` failure (reason `notEnoughWater`) happens *before* anything is sent: it is amber, costs nothing, and offers TRY AGAIN. A `noWater` failure happens mid-brew: it is red, the dose is already spent, and deliberately offers nothing. The distinction comes from `Machine.brewBlock` (pre-flight, before a single byte is sent) versus fault code `40522` arriving mid-brew. `NO_RETRY` in `constants/brewCopy.ts` is the list of failures that get no button.

The brew chart's time axis is **real seconds**: `library/brew/brewShape.ts` scales the plan by `pourSeconds` and `pauseSeconds` so the drawn staircase and the stage ladder agree about where "now" is. `PourProfile`'s axis divides time **evenly between pours**, because the card's silhouette is an identifying mark rather than a chart and even division keeps a short pour visible. Both are correct. They must not be reconciled; both files say so in a comment.

`Pour.agitation` is initialised to `-1` and every bit of `-1` is set, so reading `agitationBefore` or `agitationAfter` by masking an unset field returns true incorrectly. The byte encoder calls `getAgitation()` directly; do not read the booleans on a pour that has not been explicitly set.

The animation clock (`useTraceAnimation`) only runs in `waking`, `sending`, and `grinding`. The `pouring` phase is the longest and draws identically at every millisecond — a timer through it would re-render a chart of hundreds of points twenty times a second for minutes, to no visible effect. Animations are behind the `animateBrewChart` setting and honour `useReducedMotion`.

## Component tests

RNTL v14 has removed both `UNSAFE_getAllByType` and `root.findAllByType`. A test cannot inspect a child component's props; assert on what the renderer actually produced — text content, test IDs, and accessible labels — rather than the tree.

## Platform notes

- `NfcOverlay.tsx` is the scanning ceremony for both platforms. On iOS it sits above the system NFC sheet; on Android, where there is no system sheet at all, it *is* the entire experience. (It replaced the old Android-only `AndroidNFCDialog`.) NFC code paths check `nfc.getIsClosed()` before surfacing errors, since a user-cancelled Android scan throws.
- Version lives in `app.json` (`expo.version`, currently `1.2`); `runtimeVersion.policy` is `appVersion`, so a native-affecting change needs a version bump. EAS build profiles: `development`, `preview`, `production`. Note `eas.json` sets `appVersionSource: "remote"`, so EAS holds the build number server-side.
- Spelled with two components (`1.2`, not `1.2.0`), because the share extension carries no version keys and inherits `1.0` from the build settings — Apple rejects a bundle whose extension and host app disagree.
- **`app.json` `scheme` is an array and the order matters.** `expo-share-intent` builds the share extension's handoff key from the *first* entry, and the native extension is compiled against it, so reordering silently breaks sharing. `xbrecipewriter` stays first; `xbrw` is an alias. A test in `app/__tests__/native-intent.test.ts` fails if anyone reorders it.
- Licensing: all three repos in the fork chain are unlicensed upstream, so `LICENSE` grants MIT over *this* repo's contributions only, and `NOTICE` draws that line. Don't relabel the tree as plain MIT.

## SDK 57 notes

- Babel uses `react-native-worklets/plugin` (Reanimated 4 moved it out of `react-native-reanimated/plugin`); it must stay last in the plugin list.
- There is no `metro.config.js` and no `patches/` directory — both were workarounds that SDK 57 made unnecessary. Don't reintroduce them without a reason.
- Never import from `@react-navigation/*`; SDK 56 forked those into `expo-router`. `ThemeProvider`, `DarkTheme`, `DefaultTheme`, and `useFocusEffect` all come from `expo-router` directly.
- `ios/` and `android/` are generated (CNG) and gitignored. Change `app.json`, then `npx expo prebuild --clean`.
- `app.json` `runtimeVersion.policy` is `appVersion`, so a native-affecting change needs an `expo.version` bump.
- Install with `npx expo install <pkg>` so versions stay pinned to the SDK. If npm 12 rejects it with `EALLOWSCRIPTS`, run `npx expo-doctor` to read off the expected versions and write them into `package.json` by hand.
- Do not change the Hermes version from the SDK default, and do not enable Worklets Bundle Mode.
