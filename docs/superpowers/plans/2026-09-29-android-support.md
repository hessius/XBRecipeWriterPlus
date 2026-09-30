# Android support (device-free phase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a regression net under the Android code that already exists but has never run, and close the four Android-specific holes in the product that can be closed without holding a phone. At the end of this plan the suite runs on both platforms, the Android NFC transceive path and the Bluetooth permission gate are covered, a phone with no NFC controller or NFC switched off is told what is wrong instead of failing opaquely, and the Play listing stops inheriting a device filter nobody asked for.

**Architecture:** Nothing is ported and nothing is re-architected. The Android branches in `library/NFC.ts` and `library/machine/Transport.ts` stay exactly where they are; what changes is that a second jest project executes them. New product behaviour is confined to three places: an `NfcAvailability` probe in `library/NFC.ts` that the overlay and the card entry points consult, a `BluetoothPermissionResult` return shape from `ensureBluetoothPermission` that lets `useMachine` tell a first refusal from a permanent one, and a platform-aware `HOLD_CARD` string. The manifest gains three `<uses-feature required="false">` entries through the `app.json` `android` block.

**Tech Stack:** TypeScript, Expo SDK 57, React Native 0.86, `react-native-nfc-manager`, `react-native-ble-manager`, Jest with `jest-expo`, Tamagui, `@testing-library/react-native` v14.

**Spec:** `docs/superpowers/specs/2026-09-29-android-support-design.md`, §B (the measurement) and §E 1 to 4 (the code gaps). Out of scope here: §E 5 to 7 (edge-to-edge, predictive back, share sheet) which need an emulator screenshot pass, and §C phase 3 which needs a real card.

---

## Context an engineer needs before starting

**Android is not unimplemented. It is unverified.** Read spec §A before changing anything in `library/NFC.ts`. The `0x23` read-multiple with the `0x20` single-block fallback, the `0x2B` system info call, the `0x21` write and the Android-only `negotiateMtu` are all already written by someone who could not run them. Your job is to execute them under test, not to rewrite them. **A changed expectation is a regression until proven otherwise** — the same rule that governs `library/__tests__/cardFixtures.ts` governs this work, and for the same reason: the next stop after a wrong byte is a genuine card whose 32-byte signature cannot be regenerated.

**The suite has only ever run as iOS.** `jest-expo/jest-preset` pins `haste.defaultPlatform` to `"ios"`. Every `else` branch behind `Platform.OS === "android"` in the repository is, as far as CI is concerned, dead code. The single exception is `library/machine/__tests__/Transport.test.ts`, which flips `Platform.OS` by hand. Task 1 is what makes the rest of this plan mean anything.

**Running the suite twice doubles CI time.** The whole suite takes roughly 14 minutes on a loaded laptop. That is the price and it is accepted; see Task 1 for the shape that keeps `npm test` meaning "both platforms" while leaving a fast single-platform escape hatch.

**The baseline is green, but only just, and that is the risk in Task 1.** A full run on `main` before this plan started reported 5 failed suites / 6 failed tests. Every one of those suites passes when run alone: `app/__tests__/index.test.tsx` fails 7 tests in a loaded run and passes all 133 in 159 s on its own. These are worker contention, not defects, and the comment above `testTimeout: 20_000` in `jest.config.js` already describes the mechanism: the heavy screen suites render the whole library through Tamagui, and a timed-out test leaves its tree mounted so the rest of its `describe` cannot find the chrome it looks for. The failure signature to recognise is `Unable to find an element with role: tab, name: "Shelves"`.

**This is why Task 1 is not free.** Two jest projects doubles the suite against the same worker pool, so the contention gets worse before anything else does. Task 1 has a step for it. If you see that signature after Task 1, tune workers before you debug anything.

**House rules that will bite you:**

- The React Compiler is on. Do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook. `try`/`finally` causes a compiler bailout.
- `react-hooks/set-state-in-effect` and `react-hooks/purity` are **errors**. State cannot be seeded or reset from an effect. Reset in the event handler, or store a reading with the phase it came from and discard it at render.
- All colour comes from `constants/colors.ts`. All timing from `constants/motion.ts`.
- User-facing copy uses **no em dashes**, and avoids dashes generally.
- `@testing-library/react-native` v14: `render`, `fireEvent` and `renderHook` are **async**. Forget the `await` and the test silently passes for the wrong reason. Always render through `renderWithProviders` from `test-utils/render.tsx`.
- RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`. Assert on text, test IDs and accessible labels, never on the tree.
- Declare components at module scope. A component defined inside another component's body remounts on every render.

**Commands:**

```bash
npm test                      # both platforms, after Task 1
npm run test:ios              # iOS project only, after Task 1
npm run test:android          # Android project only, after Task 1
npx jest --selectProjects android path/to/file.test.ts
npm run typecheck
npm run lint
npx expo-doctor
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and expo-doctor. All four must be green and expo-doctor is a hard failure.

---

## Task 1: Run the suite on both platforms

**The highest-value change in this plan.** Everything after it lands in the net this creates.

`jest.config.js` today exports one config with `preset: "jest-expo"`. Replace that with a `projects` array of two, sharing one base object, so `npm test` runs both. The iOS project keeps the default preset; the Android project uses `jest-expo/android/jest-preset`, which sets `haste.defaultPlatform` to `"android"` and platforms to `["android","native"]`.

`preset` cannot be combined with per-project overrides cleanly here, because the two presets disagree about `haste`, `setupFiles`, `setupFilesAfterEnv`, `testEnvironment`, `moduleNameMapper` and `transform`. Resolve each preset by `require` and spread it, then layer this repo's own settings on top. The repo's `resolver` (`react-native-worklets/jest/resolver.js`) and its patched `transformIgnorePatterns` apply to both.

- [ ] **Step 1.1 — Write the canary.** Config is proved by running it, so the check is a test file rather than an assertion about the config object. Create `library/__tests__/platformHarness.test.ts` with two tests: `expect(["ios", "android"]).toContain(Platform.OS)`, and `expect(Platform.select({ios: "i", android: "a", default: "d"})).not.toBe("d")`. Run `npx jest library/__tests__/platformHarness.test.ts` and confirm it reports **1 suite / 2 tests**, running as iOS. This file is the canary: after Step 1.2 the same command must report 2 suites / 4 tests.

- [ ] **Step 1.2 — Restructure `jest.config.js` into two projects.** Keep the `extraEsmPackages` list and the `transformIgnorePatterns` patch exactly as they are, applied to both projects. Give each project a `displayName` (`"ios"` and `"android"`) so failures say which platform produced them. Keep `testTimeout: 20_000`, `testMatch`, `modulePathIgnorePatterns`, `setupFiles`, `setupFilesAfterEnv` and `resolver` in the shared base. Shape:

  ```js
  const iosPreset = require("jest-expo/jest-preset");
  const androidPreset = require("jest-expo/android/jest-preset");

  const base = { /* everything currently in module.exports except `preset` */ };

  const project = (name, preset) => ({
      ...preset,
      ...base,
      displayName: name,
      // The repo's own setup files run after the preset's, not instead of them.
      setupFiles: [...(preset.setupFiles ?? []), ...base.setupFiles],
      setupFilesAfterEnv: [...(preset.setupFilesAfterEnv ?? []), ...base.setupFilesAfterEnv],
      transformIgnorePatterns: patch(preset.transformIgnorePatterns)
  });

  module.exports = { projects: [project("ios", iosPreset), project("android", androidPreset)] };
  ```

  Check the current `setupFiles` against `jest-expo`'s: if the repo is today *replacing* the preset's setup files rather than appending, preserve whatever the single-project config actually did, because the whole suite passes under it. Do not change iOS behaviour in this task.

- [ ] **Step 1.3 — Verify the canary runs twice.** `npx jest library/__tests__/platformHarness.test.ts` must now report 2 suites / 4 tests, one pair labelled `ios` and one `android`.

- [ ] **Step 1.4 — Add the escape hatches.** In `package.json`, add `"test:ios": "jest --selectProjects ios"` and `"test:android": "jest --selectProjects android"`. Leave `"test": "jest"` alone so it now means both.

- [ ] **Step 1.5 — Run the whole suite and write down the Android failures.** Expect roughly 7 suites / 40 tests failing on the Android project (spec §B), plus the pre-existing timing noise. Record the exact list in the commit message. **Do not fix any of them in this task.** Tasks 2 to 5 each take one class.

- [ ] **Step 1.6 — Deal with the contention the second project causes.** Compare the full-run failure set against the baseline. If suites that pass alone are failing in the full run, cap `maxWorkers` in `jest.config.js` until they stop, with a comment saying the cap exists because two projects now share one pool. Prefer `maxWorkers` over a larger `testTimeout`: a longer timeout makes an already slow run slower, while fewer workers makes each one faster. Verify by running a suite that was failing, alone and then in the full run, and getting the same result both times.

- [ ] **Step 1.7 — Commit.** `npm run typecheck && npm run lint` must pass.

---

## Task 2: Gate the fixture assumptions Android correctly declines

Two suites fail for a reason that is not a defect: `components/__tests__/ImportTile.test.tsx` and parts of `app/__tests__/index.test.tsx` assert paste-control behaviour that `components/ImportTile.tsx` deliberately refuses on Android, and says why.

The wrong fix is `describe.skip` on Android. The right fix asserts **both** behaviours, so the Android branch gains coverage rather than losing it.

- [ ] **Step 2.1 — Read `components/ImportTile.tsx`** and find the exact `Platform.OS` branch and the copy it shows instead. Note the test ID or accessible label the Android branch renders.

- [ ] **Step 2.2 — Rewrite the failing assertions as a platform pair.** For each failing test, keep the existing expectation under `Platform.OS === "ios"` and add the Android counterpart, using the pattern already established in `library/machine/__tests__/Transport.test.ts` (set `Platform.OS`, reset in `afterEach`) **only if** the test needs to force a platform. Where the test simply runs under whichever project it is in, prefer branching on the ambient `Platform.OS` with a comment saying why the two differ. Assert on rendered text and accessible labels, not on the tree.

- [ ] **Step 2.3 — Verify.** `npx jest components/__tests__/ImportTile.test.tsx app/__tests__/index.test.tsx` green on both projects.

- [ ] **Step 2.4 — Commit.**

---

## Task 3: Cover the Bluetooth permission gate, and give a permanent refusal somewhere to go

Three suites fail because `ensureBluetoothPermission` (`library/machine/Transport.ts`) reaches `PermissionsAndroid` through a dynamic `await import("react-native")` that the harness does not provide: `hooks/__tests__/useMachine.test.ts`, `hooks/__tests__/useMachine.persistence.test.ts`, `app/__tests__/brew.test.tsx`.

The product gap behind it (spec §E 2): Android has a state iOS does not. Denied twice and the system dialog never appears again; only the app's settings page can undo it. Today `openLink` in `hooks/useMachine.ts` throws a flat `"XBRW++ needs permission to use Bluetooth."` for both cases, which tells a permanently blocked user to do something the OS will silently ignore.

- [ ] **Step 3.1 — Write the failing tests for the new return shape.** In `library/machine/__tests__/Transport.test.ts`, with `Platform.OS` set to `"android"` and `PermissionsAndroid.requestMultiple` mocked, assert `ensureBluetoothPermission()` resolves to:
  - `{granted: true}` when every result is `"granted"`;
  - `{granted: false, permanentlyDenied: false}` when any result is `"denied"`;
  - `{granted: false, permanentlyDenied: true}` when any result is `"never_ask_again"`.
  Add the API-version split as its own tests: `Platform.Version` 31 asks for `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; `Platform.Version` 30 asks for `ACCESS_FINE_LOCATION` and neither of the other two. And one iOS test: `Platform.OS === "ios"` resolves `{granted: true}` without touching `PermissionsAndroid`.

- [ ] **Step 3.2 — Make the tests pass.** Change the signature to `Promise<BluetoothPermissionResult>` where

  ```ts
  export type BluetoothPermissionResult =
      | {granted: true}
      | {granted: false; permanentlyDenied: boolean};
  ```

  `never_ask_again` is `PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN`; compare against the constant, not the string, so a library rename is a compile error. Keep the dynamic `await import("react-native")` — it exists so the module does not pull `PermissionsAndroid` in on iOS — but the Android jest project resolves it, which is why these tests can now exist at all.

- [ ] **Step 3.3 — Fix every caller.** Grep for `ensureBluetoothPermission`. `if (!await ensureBluetoothPermission())` is now always false against an object and must become `.granted`. Typecheck is the net here; it should fail loudly before you run anything.

- [ ] **Step 3.4 — Write the failing test for the dead end.** In `hooks/__tests__/useMachine.test.ts`, with `Platform.OS` `"android"`: when the permission comes back `{granted: false, permanentlyDenied: true}`, `openLink` surfaces copy that names the settings route and the hook exposes a way to open it; when it comes back `{granted: false, permanentlyDenied: false}`, it surfaces the existing first-refusal copy and offers no settings route.

- [ ] **Step 3.5 — Implement.** Add two strings to `constants/copy.ts` (or the machine copy module if one already owns this text — check `constants/brewCopy.ts` first and follow whichever already holds machine-connection errors). No em dashes. Suggested, subject to whatever the surrounding voice is:
  - first refusal: `"XBRW++ needs permission to use Bluetooth to reach the machine."`
  - permanently denied: `"Bluetooth permission is off for XBRW++. Turn it on in Settings to reach the machine."`
  Wire the settings route with `Linking.openSettings()` from `react-native`. Follow the existing error-surfacing shape in `useMachine` rather than inventing a second one; if errors are currently thrown as `Error`, carry the distinction on the error object rather than by string matching.

- [ ] **Step 3.6 — Verify.** `npx jest hooks/__tests__/useMachine.test.ts hooks/__tests__/useMachine.persistence.test.ts app/__tests__/brew.test.tsx library/machine/__tests__/Transport.test.ts` green on both projects.

- [ ] **Step 3.7 — Commit.**

---

## Task 4: Write the Android NFC transceive tests that never existed

`library/__tests__/NFC.sysinfo.test.ts` and `library/__tests__/NFC.capacity.test.ts` mock only `iso15693HandlerIOS`, so they fail under the Android project. They do not fail because Android is broken; they fail because the Android path has **zero** coverage. This is the task the whole plan exists to make possible, and it is the one where a changed expectation is a regression.

Read `library/NFC.ts` end to end first. The Android commands are: `0x2B` get system info, `0x23` read multiple blocks, `0x20` read single block (the fallback), `0x21` write single block. Writes are 4-byte blocks and `NFC.writeCard` starts at block 8.

- [ ] **Step 4.1 — Build a `nfcVHandler` test double.** New file `test-utils/nfcV.ts`. It should accept a card image (a byte array) and answer `transceive` calls by decoding the command byte, so the double behaves like a tag rather than replaying a script. Give it switches for the two failure modes that matter: a `getMaxTransceiveLength` too small to service a multi-block read, and a transceive that rejects on `0x23` so the `0x20` fallback is exercised. Export a helper that records the command sequence, so a test can assert *which* commands were issued and in what order.

- [ ] **Step 4.2 — Write `library/__tests__/NFC.android.test.ts`.** Force `Platform.OS` to `"android"`. Cover, each as its own test:
  - `getSystemInfo` issues `0x2B` and parses block size and block count out of the response.
  - `readMultipleBlocks` issues `0x23` with the right offset and count and returns the bytes in order.
  - When `0x23` rejects, the `0x20` single-block fallback runs, issues one command per block, and returns byte-identical data to the `0x23` path. This is the test that matters most: it is the "works on a Pixel, fails on a Samsung" case.
  - When `getMaxTransceiveLength` is smaller than the requested read, the read is split or falls back, and still returns the whole range.
  - `writeSingleBlock` issues `0x21` with a 4-byte payload, and `writeCard` starts at block 8.
  - `readHash` returns the 32 bytes from blocks 0 to 7 and the value is passed through unchanged. Assert the bytes are never recomputed.

- [ ] **Step 4.3 — Prove the two paths agree.** One test reads the same card image twice, once through `0x23` and once forced down the `0x20` fallback, and asserts the results are identical. Also assert the Android result equals what the iOS handler produces for the same image, using the existing iOS mocks — the card format is the card format and the two transports must not disagree.

- [ ] **Step 4.4 — Make the existing two suites platform-honest.** `NFC.sysinfo.test.ts` and `NFC.capacity.test.ts` assert format-level facts that hold on both transports. Either mock both handlers so each suite runs on both projects, or, if that makes them unreadable, restrict them to the iOS project with a `Platform.OS === "ios"` guard **and** confirm the equivalent assertion exists in `NFC.android.test.ts`. Do not simply skip them.

- [ ] **Step 4.5 — Verify.** `npx jest library/__tests__/NFC` green on both projects, and the full suite shows no new failures.

- [ ] **Step 4.6 — Commit.**

---

## Task 5: Ask whether NFC exists and whether it is switched on

Spec §E 1, the clearest iOS assumption in the codebase. On iOS a supported iPhone always has NFC and the user cannot turn it off. On Android many devices have no controller at all, and on those that do it is a Settings toggle. `NfcManager.isSupported()`, `isEnabled()` and `goToNfcSetting()` are called **nowhere** in the repository. Today `init()` swallows a failed `NfcManager.start()` into `console.error` and the user's first signal is an opaque failure at `requestTechnology`.

Three outcomes need distinct treatment: no hardware, hardware switched off, ready.

- [ ] **Step 5.1 — Write the failing tests.** New `library/__tests__/NFC.availability.test.ts`, running on both projects. Assert a new `NFC.checkAvailability(): Promise<NfcAvailability>` where

  ```ts
  export type NfcAvailability = "ready" | "disabled" | "unsupported";
  ```

  - `isSupported()` false gives `"unsupported"`, and `isEnabled()` is never called.
  - `isSupported()` true and `isEnabled()` false gives `"disabled"`.
  - both true gives `"ready"`.
  - either throwing gives `"unsupported"` rather than propagating, because a probe that throws is not a reason to crash a screen.
  - On iOS `isEnabled()` is not consulted: the result is `"ready"` whenever `isSupported()` is true. Pin this so a future change cannot start showing an iPhone user a "turn NFC on" message that has no switch behind it.

- [ ] **Step 5.2 — Implement `checkAvailability`** in `library/NFC.ts`. Do not change `init()`'s existing behaviour in this step; add the probe alongside it.

- [ ] **Step 5.3 — Write the failing tests for the overlay.** `components/__tests__/NfcOverlay.test.tsx` (extend it if it exists, create it if not), rendered through `renderWithProviders` and awaited. Assert that given `"disabled"` the overlay shows the switched-off copy and a control that calls `NfcManager.goToNfcSetting()`; given `"unsupported"` it shows the no-hardware copy and offers no settings control; given `"ready"` nothing changes from today. On iOS `"disabled"` must be unreachable, so there is no iOS assertion for it.

- [ ] **Step 5.4 — Implement.** Add the copy to `constants/copy.ts`. No em dashes. Suggested:
  - disabled: `"NFC is switched off. Turn it on to read or write a card."`
  - unsupported: `"This phone has no NFC, so cards cannot be read or written here. Everything else works."`
  The last clause matters and is true: the library, editor, import and hub all work without a radio, which is also why Task 6 declares the feature optional.

  Where the availability is read: do it in the handler that opens the ceremony, not in an effect. `react-hooks/set-state-in-effect` is an error, and the availability is a reading that belongs to the moment the user asked for a card, not to mount.

- [ ] **Step 5.5 — Consider hiding rather than failing.** Spec §E 1 suggests hiding the card features on a phone with no controller. That is a larger UI decision than this plan should take unilaterally, and hiding an entry point is harder to discover than explaining it. **Decision: explain, do not hide.** The `"unsupported"` copy above states plainly that the rest of the app works. Record this in the commit message so the choice is findable.

- [ ] **Step 5.6 — Verify.** Both projects green.

- [ ] **Step 5.7 — Commit.**

---

## Task 6: Tell the user where the Android antenna is

One string, and it matters more than its size (spec §E 3). `constants/copy.ts:43` reads `"Hold the card to the top of the phone."` That is the iPhone's antenna. Android NFC antennas are usually in the upper middle of the **back**, and on Android `NfcOverlay` is the entire ceremony, so this copy is the only guidance there is. Sent to the wrong part of the phone, the resulting failure looks exactly like an unsupported card.

- [ ] **Step 6.1 — Write the failing test.** In whichever suite covers `constants/copy.ts` or `NfcOverlay`, assert the string differs by platform and that neither variant contains an em dash. Run it on both projects.

- [ ] **Step 6.2 — Implement** with `Platform.select`:

  ```ts
  export const HOLD_CARD = Platform.select({
      android: "Hold the card to the back of the phone, near the top.",
      default: "Hold the card to the top of the phone."
  }) as string;
  ```

  Check first that `constants/copy.ts` has no import of `react-native` and that adding one does not drag anything unwanted into a pure module's test. If it does, move the selection to the consumer instead and keep both strings exported.

- [ ] **Step 6.3 — Verify and commit.**

---

## Task 7: Stop inheriting a Play device filter

Spec §E 4, checked against Android's primary documentation rather than assumed, because the intuitive answer is wrong in both directions. `android.permission.NFC` is **not** in Table 2 of the `<uses-feature>` reference, so it implies nothing and Play is *not* filtering the listing to NFC-capable devices. `BLUETOOTH_ADMIN` **is** in Table 2 and implies `android.hardware.bluetooth`, so with `targetSdkVersion >= 5` Play filters devices without it.

The app is genuinely usable with neither radio. Declare both explicitly as optional so the manifest states intent instead of inheriting it.

- [ ] **Step 7.1 — Add the declarations.** In `app.json` under `expo.android`, add:

  ```json
  "features": [
      {"name": "android.hardware.nfc", "required": false},
      {"name": "android.hardware.bluetooth", "required": false},
      {"name": "android.hardware.bluetooth_le", "required": false}
  ]
  ```

  Confirm the exact key Expo SDK 57 uses for `<uses-feature>` before writing it. If `expo.android` has no such key in this SDK, write a small config plugin under `plugins/` using `withAndroidManifest` and `AndroidConfig.Manifest`, and add it to `expo.plugins`. Either way, do not hand-edit `android/`; it is generated and gitignored.

- [ ] **Step 7.2 — Write the failing test.** A config test asserting the three features are present and all three are `required: false`. If a plugin was written, unit-test the plugin against a minimal manifest object, which is device-free and fast. If `app.json` carried it, assert on the parsed `app.json` so a later edit that drops a line fails CI.

- [ ] **Step 7.3 — Decide on the version bump.** `runtimeVersion.policy` is `appVersion`, and a manifest change is native-affecting. Bump `expo.version` in `app.json`. It is `2.0.0`; go to `2.1.0`. Remember the two-component spelling rule applies to the *share extension* on iOS, which is why the current value has three components already; follow whatever the file actually has rather than reformatting it.

- [ ] **Step 7.4 — Verify without a device.** `npx expo prebuild --platform android --clean` regenerates `android/`, then read `android/app/src/main/AndroidManifest.xml` and confirm the three `<uses-feature>` lines. If an APK is available from `eas build -p android`, `aapt2 dump badging` on it prints the resolved feature list including implied ones, which is the authoritative check. Neither needs a phone.

- [ ] **Step 7.5 — Run `npx expo-doctor`.** It is a hard CI failure.

- [ ] **Step 7.6 — Commit**, and leave `android/` untracked as it already is.

---

## Task 8: Close the loop

- [ ] **Step 8.1 — Full suite, both projects.** `npm test`. The only acceptable failures are the ones on the baseline list written down before Task 1. Anything else is yours.

- [ ] **Step 8.2 — `npm run typecheck && npm run lint && npx expo-doctor`.**

- [ ] **Step 8.3 — Teach CI about the second platform.** `.github/workflows/ci.yml` runs `npm test`, which after Task 1 already means both. Confirm no timeout in the workflow is now too tight for a run that takes roughly twice as long, and raise it if so.

- [ ] **Step 8.4 — Update `.github/copilot-instructions.md`.** Two facts are now load-bearing for anyone writing a test: the suite runs as two jest projects, and `Platform.OS` is no longer always `"ios"`. Add them next to the existing testing notes.

- [ ] **Step 8.5 — Record what is still unproven.** Append a short section to the spec, or open an issue, listing what this plan did **not** do and why: edge-to-edge and inset audit, predictive back through the brew flow, the Android share sheet, and the three irreducible hardware items from spec §C. A green two-platform suite is not evidence that a genuine card can be written on Android, and the record should say so plainly.

- [ ] **Step 8.6 — Open the pull request** against `main` from `android-support`, describing the change as a regression net plus four product fixes, not as "Android support".
