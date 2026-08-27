# XBRW++

An app for reading and rewriting xBloom coffee recipe NFC cards, so a recipe you
found, tuned or were sent can be put on a card and brewed.

## What it does

* Keeps a library of recipes on your phone, in SQLite.
* Reads a genuine xBloom card and writes an edited recipe back to it.
* Imports from an xBloom share link — paste one, or share it into the app from
  your browser.
* Edits every field the card carries: dose, ratio, grind size and speed, and
  each pour's volume, temperature, pattern, agitation, flow rate and pause.
* Backs the whole library up to a file and restores it again.

## Limitations

These are properties of the cards and the machine, not of this app:

* **Only genuine xBloom cards work.** The first 32 bytes are a hash xBloom
  derives from the card's serial number. This app reads that hash and writes it
  back untouched; it cannot compute one. Rewritable-UID third-party chips may
  work in theory.
* **The machine rejects a recipe unless the pour volumes sum to `dose × ratio`.**
  `Recipe.isPourVolumeValid()` enforces it and `autoFixPourVolumes()` rebalances
  for you, which can shift the total slightly — volumes are written as whole
  millilitres.
* **Ratios are whole numbers.** No `.5`.
* If the machine pauses excessively on your recipe, turn off *overflow
  protection*, which changes the pod type so it does not hit overflow.

## Data format

See `Data Format.png` (and `Data Format.xlsx`) for the card layout. Both document
an earlier revision — **where they disagree with `library/Recipe.ts`, the code is
authoritative**. `library/__tests__/cardFixtures.ts` is a deliberately independent
implementation of the byte layout, so the round-trip tests are not tautological.

## Development

An Expo app on **SDK 57**.

### Requirements

* Node 20.19.4 or newer
* Xcode (iOS) and/or Android Studio (Android)
* **A physical device.** NFC is a native module, so this cannot run in Expo Go,
  and simulators have no NFC radio. A simulator build is still useful for UI.
* **iOS only:** a *paid* Apple Developer Program membership. The
  `com.apple.developer.nfc.readersession.formats` entitlement needed for raw
  ISO 15693 block access is not available to free accounts.
* Web is not supported — there is no web NFC implementation here.

### Run it

```bash
npm install

npx expo run:ios --device      # iOS (physical device required for NFC)
npx expo run:android --device  # Android
```

`npx expo start` alone only starts the bundler; it needs one of the development
builds above already on the device.

This project uses Continuous Native Generation — `ios/` and `android/` are
generated and not committed. Never hand-edit them: change `app.json` and re-run
`npx expo prebuild --clean`. Because `runtimeVersion.policy` is `appVersion`, a
native-affecting change needs `expo.version` raised too.

### Checks

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm test           # jest
npx expo-doctor    # dependency and config health
```

CI runs all four on every push to `main` and every pull request, and all four
must pass.

The tests in `library/__tests__/` are characterisation tests over the card
format. A malformed write to a genuine card is not trivially recoverable, so
treat any change in their output as a real regression rather than something to
re-baseline.

### Third-party licences

`npm run generate-licences` regenerates `constants/licences.ts` from the
installed dependency tree. The About screen links to a screen that reproduces
each licence in full. Re-run it whenever dependencies change.

## Licence and provenance

This app is a fork of a fork: [terminaldisclaimer/XBRecipeWriter][orig] →
[CrazyCoder/XBRecipeWriterPlus][fork] → this repository. **Neither upstream
carries a licence**, so this project cannot grant rights over their code. See
`LICENSE` and `NOTICE` — the MIT grant covers only the contributions made here,
and `NOTICE` sets out exactly what a downstream reader may and may not rely on.

[orig]: https://github.com/terminaldisclaimer/XBRecipeWriter
[fork]: https://github.com/CrazyCoder/XBRecipeWriterPlus
