# XBRecipeWriter+ — Copilot instructions

Expo (SDK 53) / React Native app that reads and writes xBloom coffee recipe NFC cards (ISO 15693 / NfcV), stores recipes locally in SQLite, and imports recipes from xBloom share links.

## Commands

```bash
npm install            # runs patch-package via postinstall (patches/xcode+3.0.1.patch)
npx expo start         # dev server (needs a dev client, not Expo Go — NFC is a native module)
npm run ios            # expo run:ios
npm run android        # expo run:android
npm run lint           # expo lint
npm test               # jest --watchAll (jest-expo preset)
npx jest path/to/file  # single file; add -t "name" for a single test
npx tsc --noEmit       # type check
```

There are currently **no test files in the repo** — the jest config exists but nothing is covered. Anything touching card byte layout, checksum, or volume math is worth a test if you add one.

NFC cannot be exercised in a simulator/emulator. Card read/write changes must be verified on a physical device with a real card.

## Architecture

Three layers, strictly separated:

- **`library/`** — plain TypeScript domain classes, no React. This is where all card and business logic lives.
  - `Recipe.ts` — the central model. Owns byte-level (de)serialization (`parseData` / `getData`), CRC-8/MAXIM-DOW checksum via a precomputed `POLY_TABLE`, and volume math (`autoFixPourVolumes`, `fixRatio`, `getTotalVolume`). Also orchestrates `readCard`/`writeCard` against an `NFC` instance.
  - `Pour.ts` — one pour/steep; `POUR_PATTERN` and `AGITATION` constants.
  - `NFC.ts` — transport only. Branches on `Platform.OS`: iOS uses `NfcManager.iso15693HandlerIOS`, Android uses raw `nfcVHandler.transceive` commands (`0x23` read-multiple with a `0x20` single-block fallback, `0x21` write-single). Writes 4-byte blocks.
  - `RecipeDatabase.ts` — expo-sqlite (`xbrecipewriter.db`, sync API). Recipes are stored as a whole JSON blob in `recipes(uuid, recipeJSON)`, not normalized columns.
  - `XBloomRecipe.ts` — fetches from the undocumented `client-api.xbloom.com` endpoints and maps xBloom's `recipeVo` JSON onto a `Recipe`. Two endpoints: by share id, or by XID (`id.length <= 7`).
- **`app/`** — expo-router file routes (`index` = recipe list, `editRecipe` = editor). Typed routes are enabled.
- **`components/`** — Tamagui presentational/dialog components.

Import with the `@/` alias (maps to repo root), e.g. `@/library/Recipe`.

## Card format — the part that will bite you

Byte layout (see `Recipe.parseData` / `Recipe.getData`, and `Data Format.png`):

- Bytes 0–31: a signature/hash written by xBloom, derived from the card serial. **The app never recomputes it** — it reads the hash off the card and re-prefixes it. This is why only genuine cards work. `getData(prefix)` splices those 32 bytes off before writing; `NFC.writeCard` starts at block 8 (= byte 32).
- 32–38: XID (ASCII, max 8 chars, zero-padded)
- 39: low nibble = `CUP_TYPE`; for Tea, high nibble = cup count − 1
- 40: pour count `<< 3`
- 41 + 8·n: per-pour records — volume, temperature, pattern, agitation, pause (stored as `256 − seconds`), a combined byte (bits 0–4 = dose, bits 5–7 = pause minutes — **dose and RPM only live in pour 1**), RPM, flow rate
- then: grind size (stored with `GRIND_SIZE_OFFSET` = 40; value `GRINDER_OFF` = 41 disables the grinder), ratio, CRC-8 checksum

Other domain invariants:

- The machine rejects a recipe unless the sum of pour volumes equals `dosage × ratio`. `isPourVolumeValid()` guards this; `autoFixPourVolumes()` rescales pours and redistributes rounding error so it holds exactly.
- Ratios are whole numbers only — no `.5`.
- Tea (`CUP_TYPE.TEA`) is special-cased throughout: volumes are clamped to 90 ml, dose defaults to 5 g, the ratio is recomputed with `fixRatio()`, and tea cards always write the default grind size.
- `CUP_TYPE.OMNI` is what the UI calls "overflow protection off".
- `backup` / `offline_backup` / `uid` on a `Recipe` hold raw card bytes for the restore feature — preserve them through any serialization change.
- Legacy JSON migrations live in the `Recipe(json)` constructor (e.g. cup types `0x23`/`0x13`/`0x04`). Don't drop them.

## UI conventions

- **Tamagui** is the component/styling system (`tamagui.config.ts`, providers in `app/_layout.tsx`). Use `XStack`/`YStack`/`Button`/`Dialog` and `$`-prefixed tokens rather than raw RN `StyleSheet`. `@ui-kitten` and `@expo/vector-icons` are used for icons only.
- Dialogs follow the `Dialog` + `Adapt platform="touch"` + `Sheet` pattern (see `ImportRecipeComponent.tsx`).
- **Mutate the `Recipe` object in place and bump a `key` counter** (`setKey(prev => prev + 1)`) to re-render, instead of cloning into state. This was a deliberate performance change — don't "fix" it by making `Recipe` immutable or re-serializing on every keystroke. Hot spots use refs + `useImperativeHandle` (`TotalVolumeComponent.forceUpdate`) to repaint a single value.
- `ValidatedInput` owns numeric entry: min/max/step, slider, long-press repeat, and it reports validity upward via `setErrorFunction` — the save button is gated on that.
- Screen headers are configured with `navigation.setOptions` inside `useEffect`, not via static route options.
- Import happens through `expo-share-intent`: a shared xBloom URL's `id` query param is pulled out in `app/index.tsx` and handed to `ImportRecipeComponent`.

## Platform notes

- Android needs an explicit NFC dialog (`AndroidNFCDialog`) because it has no system NFC sheet; iOS shows its own. NFC code paths check `nfc.getIsClosed()` before surfacing errors, since a user-cancelled Android scan throws.
- Version lives in `app.json` (`expo.version`); `runtimeVersion.policy` is `appVersion`, so a native-affecting change needs a version bump. EAS build profiles: `development`, `preview`, `production`.
