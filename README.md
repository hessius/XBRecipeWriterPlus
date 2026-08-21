## Notes

This is an app for rewriting XBloom recipe cards. There are some limitations based on how XBloom cards operates:

* This only works with genuine XBloom NFC cards. XBloom includes a 32 byte hash in the beginning of the card. The hash appears to be based on the cards serial number. This app does not recalculate that hash, which is why it only works on genuine cards. Theoretically, if you purchased rewritable UID cards, you may be able to use third party NFC chips though.
* The machine verifies that the total pour volume equals `dose * ratio`. The app enforces this with `Recipe.isPourVolumeValid()` and can rebalance the pours for you via `autoFixPourVolumes()`, which may shift your total volume slightly due to integer rounding (volumes are written to the card as whole millilitres).
* The cards do not support .5 ratios
* If you experience exccessive "waits" on the machine with your recipe, turn off "overflow protection." This changes the pod type on the recipe so that it doesn't run into overflow issues.
* The app support importing of recipes. Just open up an XBloom share link in your phone's browser and once loaded, "share" it with XBRecipeWriter. 

## Data Format

See `Data Format.xlsx` in this repository for the card layout. Note that the spreadsheet documents an
earlier revision of the format &mdash; where it disagrees with `library/Recipe.ts`, **the code is
authoritative**. `library/__tests__/cardFixtures.ts` holds an independent implementation of the byte
layout that the test suite checks `Recipe` against.

## Get started with development

XBRecipeWriter is an Expo app on **SDK 57**.

### Requirements

* Node 20.19.4 or newer
* Xcode (for iOS) and/or Android Studio (for Android)
* **A physical device.** NFC is a native module, so the app *cannot* run in Expo Go, and simulators
  and emulators have no NFC radio. A simulator build is still useful for previewing UI.
* **iOS only:** a *paid* Apple Developer Program membership. The
  `com.apple.developer.nfc.readersession.formats` entitlement that this app needs for raw ISO 15693
  block access is not available to free accounts.
* Web is not supported &mdash; there is no web NFC implementation here.

### Run it

```bash
npm install

# iOS (physical device required for NFC)
npx expo run:ios --device

# Android
npx expo run:android --device
```

`npx expo start` on its own only starts the bundler; it needs one of the development builds above
already installed on the device.

This project uses Continuous Native Generation &mdash; `ios/` and `android/` are generated and are not
committed. Never hand-edit them; change `app.json` and re-run `npx expo prebuild --clean`.

### Checks

```bash
npm test          # Jest suite covering the card byte format and volume math
npm run typecheck # tsc --noEmit
npx expo-doctor   # dependency and config health
```

The tests in `library/__tests__/` are characterisation tests over the card format. Because a malformed
write to a genuine xBloom card is not trivially recoverable, treat any change in their output as a real
regression rather than something to re-baseline.
