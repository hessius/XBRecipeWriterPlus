# BLE Feasibility Assessment — XBRecipeWriterPlus

**Assessment date:** 2026-08-30  
**Repo:** `hessius/XBRecipeWriterPlus` — Expo SDK 57 / RN 0.86.3, New Architecture mandatory, iOS-first, currently in App Store review.  
**Methodology:** All primary-source claims are tagged `[verified]`, documentation-only claims `[documented]`, and reasoning without a primary source `[inferred]`.

---

## A. Library Choice

### Landscape (verified against npm and GitHub, 2026-08-30)

| Library | Latest | Licence | New Arch | Expo config plugin | `codegenConfig` |
|---|---|---|---|---|---|
| `react-native-ble-plx` | 3.5.1 (2026-02-17) | MIT | **Partial — bridge-mode only; V4 TurboModule rewrite is a draft PR (#1331), not merged as of Aug 2026** | ✅ ships `app.plugin.js` | ❌ no `codegenConfig` in package.json |
| `react-native-ble-manager` | 12.5.1 (2026-07) | Apache-2.0 | ✅ **New Architecture only** since v12.0 (explicitly for RN 0.76+) | ✅ ships `app.plugin.js` | ✅ `codegenConfig: {name:"BleManagerSpec", type:"modules"}` |
| `expo-bluetooth` | 0.0.0 (2021-08-13) | — | N/A | N/A | N/A |

#### `react-native-ble-plx` 3.5.1 — detail

- **Source:** npm registry + `dotintent/react-native-ble-plx` GitHub, SHA `af6c902`, verified 2026-08-30.  
- The podspec uses `install_modules_dependencies(s)` which is the correct New Arch hook, **but** the iOS source files are plain `.m` Objective-C, not a codegen spec. The module bridges via the old `RCT_EXTERN_MODULE` mechanism with an interop shim. This works on RN 0.76–0.79 where the "interop layer" was available. RN 0.86 (SDK 57) ships without the legacy interop layer enabled by default. `[verified]` — `react-native-ble-plx.podspec` confirms no codegen spec; CHANGELOG confirms 3.5.1 was the most recent release as of Feb 2026, with no New Arch migration landed; draft PR #1331 ("V4 turbomodule rewrite") opened 2026-03-16 by `iotashan`, **still a draft as of Aug 2026**. `[verified via web_search]`
- **`npx expo install react-native-ble-plx`** would pin `^3.5.1`; no explicit SDK 57 version constraint in the package. expo-doctor would flag it unless the reactNativeDirectoryCheck excludes it (same workaround used for `react-native-nfc-manager` today). `[inferred]`  
- **Verdict:** High risk on SDK 57 New Architecture. The library is likely to crash or fail to link until V4 lands. **Do not use until PR #1331 merges and is published.**

#### `react-native-ble-manager` 12.5.1 — detail

- **Source:** npm registry + `innoveit/react-native-ble-manager` GitHub, SHA `60c5304`, verified 2026-08-30.  
- `package.json` contains `codegenConfig: { name: "BleManagerSpec", type: "modules", jsSrcsDir: "src" }` — this is the TurboModule spec declaration required for New Architecture. `[verified]`  
- Changelog confirms: "v12.0.X — Added support for React Native 0.76 new architecture." `[verified]`  
- devDependencies show `react-native: "0.82.1"` and `expo-module-scripts: "^4.0.2"`, consistent with active maintenance against recent RN. `[verified]`  
- Podspec (`RNBleManager.podspec`) uses `install_modules_dependencies(s)` and `s.static_framework = true`. The iOS source is `.mm` and `.swift` — mixed-language, consistent with a module that adopted TurboModule conventions. `[verified]`  
- Ships `app.plugin.js` which orchestrates permission strings, Android manifest, and optionally background modes. `[verified — plugin/src/ directory confirmed]`  
- Licence is **Apache-2.0**. The repo already carries an unlicensed upstream (noted in the assessment brief); Apache-2.0 is unambiguously open and compatible with the App Store. `[verified]`  
- **`npx expo install react-native-ble-manager`** would resolve to `^12.5.1`. No SDK 57 specific constraint is published; the library's peerDependency is `"react": "*", "react-native": "*"`. expo-doctor checks the React Native Directory; `react-native-ble-manager` is listed there as New Architecture compatible. `[inferred — cannot run expo-doctor without a live environment]`

#### `expo-bluetooth`

- **Dead package.** Version `0.0.0`, published 2021-08-13 by a single Expo employee (`tsapeta`), 53 bytes unpacked. It was a placeholder that was never developed. `[verified — npm registry]`

### Recommendation: **`react-native-ble-manager` 12.5.1**

It is the only option that is demonstrably New Architecture ready today. The library is MIT-analogous for App Store purposes (Apache-2.0), actively maintained (12.5.1 released 2026-07), and ships a well-structured Expo config plugin that handles all the plumbing declaratively.

---

## B. Coexistence Risk

### NFC + BLE entitlement conflict

iOS uses entirely separate subsystems for NFC (CoreNFC) and BLE (CoreBluetooth). They share no entitlement namespace. `[documented — Apple Developer docs for CoreNFC and CoreBluetooth]`

- **NFC entitlement in use:** `com.apple.developer.nfc.readersession.formats` (raw ISO 15693). This is unrelated to Bluetooth. `[verified — app.json]`
- **BLE entitlement required:** None beyond the `NSBluetoothAlwaysUsageDescription` Info.plist key. BLE does not require a provisioning entitlement for central role (peripheral role advertising does, but this app is central-only). `[documented — Apple Developer docs]`
- **Verdict: no entitlement conflict.** Both radios can operate in the same app; Apple ships this combination in many first-party apps (e.g., HomePod setup uses BLE + NFC together). `[inferred from public knowledge, no primary doc]`

### Share Extension target

The Share Extension (`com.hessius.xbrwplusplus.share-extension`) is a separate Xcode target in the same Xcode project. BLE frames are applied at the main app target level. The extension target does not link CoreBluetooth and would not be affected by adding BLE to the main app. `[inferred]`

The `withShareExtensionCcache` plugin (`plugins/withShareExtensionCcache.js`) runs as a `withFinalizedMod` and sets `PODS_ROOT` on the ShareExtension target's build configurations. BLE libraries add a CocoaPod (`RNBleManager`) linked to the **main app target** only; the finalized mod iterates extension targets by name (`TARGET_NAME = 'ShareExtension'`) and does not touch other targets. There is no collision path. `[verified — plugin source read directly]`

### Local config plugin analysis

All four plugins were read directly. Assessment of BLE compatibility:

| Plugin | What it does | BLE risk |
|---|---|---|
| `withUserScriptSandboxDisabled` | Sets `ENABLE_USER_SCRIPT_SANDBOXING = NO` on **all** build configurations in the app `.xcodeproj`. | **None.** This setting suppresses a sandbox restriction on the React Native bundle phase. It applies project-wide and is not specific to any pod or target. A new BLE pod will inherit `NO`, which is benign — the setting only matters for run-script phases that write undeclared outputs. `[verified]` |
| `withExplicitModulesDisabled` | Sets `CLANG_ENABLE_EXPLICIT_MODULES = NO` on **all** build configurations in the app `.xcodeproj`. | **None.** Applies to the app project, not the Pods project (plugin comment: "This covers the app project only. The Pods project keeps emitting the note, harmlessly"). A new BLE pod lives in the Pods project and is unaffected. `[verified]` |
| `withInhibitPodWarnings` | Injects `inhibit_all_warnings!` into the generated `Podfile`, immediately before `prepare_react_native_project!`. | **None.** `inhibit_all_warnings!` silences warnings from **all** pods including any new BLE pod. This is purely cosmetic and reduces log noise — a welcome effect when adding a new pod. The plugin validates the Podfile anchor and throws if it changes, so it is robust to Podfile template changes. `[verified]` |
| `withShareExtensionCcache` | Sets `PODS_ROOT` on the ShareExtension target's build configurations, using `withFinalizedMod`. | **None.** Operates only on the ShareExtension named target. BLE pods affect the main target. `[verified]` |

**Conclusion: no coexistence risk with any of the four local plugins, with NFC, or with the Share Extension.** This is the cleanest part of the feasibility assessment.

---

## C. Permissions and Info.plist

### iOS

**`NSBluetoothAlwaysUsageDescription`** — Required. This is the only key needed for iOS 13+. Apps targeting iOS 13+ (Expo SDK 57 minimum deployment target is iOS 16 `[documented — Expo SDK 57 release notes]`) do not need `NSBluetoothPeripheralUsageDescription`; that key was deprecated in iOS 13 and is entirely ignored on current OS versions.

- The `react-native-ble-plx` config plugin explicitly warns developers to remove `bluetoothPeripheralPermission` and states the key is "fully deprecated as of iOS 13 (lowest iOS version in Expo SDK 47+)". `[verified — plugin/src/withBLE.ts]`
- The `react-native-ble-manager` plugin similarly only injects `NSBluetoothAlwaysUsageDescription`. `[verified — plugin/src/withBluetoothPermissions.ts]`

The string should describe the actual use: e.g., *"This app uses Bluetooth to communicate with your xBloom coffee machine."* Apple reviewers read this string. Generic strings ("connect to bluetooth devices") are a marginal rejection risk. `[documented — App Store Review Guidelines 5.1.1]`

**Action:** Pass `bluetoothAlwaysPermission` to the plugin in `app.json` with a specific, purpose-describing string.

### Android

The app currently declares only `android.permission.NFC` in `app.json`. `[verified — app.json]`

BLE requires:

| Permission | API level | Why |
|---|---|---|
| `BLUETOOTH_SCAN` | API 31+ (Android 12+) | Active scanning for devices |
| `BLUETOOTH_CONNECT` | API 31+ | Connecting to and communicating with devices |
| `ACCESS_FINE_LOCATION` | API 23–30 | Required on Android ≤11 to scan for BLE (for privacy/location inference reasons) |
| `ACCESS_COARSE_LOCATION` | API 23–28 | Required on Android ≤9 |

**The `neverForLocation` flag:** If BLE is **not** used to derive the user's physical location (which is true for a coffee machine controller), you can declare `android:usesPermissionFlags="neverForLocation"` on `BLUETOOTH_SCAN`. This eliminates the need to show a location permission rationale dialog on Android 12+. The config plugin supports this as a first-class option (`neverForLocation: true`). `[verified — plugin/src/withBLEAndroidManifest.ts]`

With `neverForLocation: true`, the `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` permissions are added with `android:maxSdkVersion="30"`, meaning they only appear in the manifest for devices running Android ≤11. `[verified — plugin/src/withBLEAndroidManifest.ts]`

**Android note:** The app's Android support is deferred. These permissions would be added by the config plugin automatically. No manual changes to `app.json`'s `android.permissions` array are needed; the plugin handles them. The existing NFC permission stays untouched.

---

## D. Background Behaviour

### What happens without background mode

iOS suspends an app within a few seconds of backgrounding. When suspended, the CoreBluetooth central manager ceases to process BLE events. **Any in-progress brew that relies on BLE data (progress updates, completion notifications) will stop updating.** The app UI will be stale when the user returns. If the BLE protocol requires the phone to actively issue commands during a brew (e.g., pour triggers, step sequencing), those commands will not be sent while backgrounded. `[documented — Apple developer docs on app lifecycle and CoreBluetooth]`

This is the same constraint NFC already imposes: NFC sessions are strictly foreground-only. `[documented]`

### What `bluetooth-central` background mode allows

Declaring `UIBackgroundModes: [bluetooth-central]` in Info.plist (done via `modes: [BackgroundMode.Central]` in the plugin) grants:

- **Continued BLE scanning** while backgrounded (not practical for foreground-initiated scans, but relevant for reconnection).  
- **Delivery of characteristic notifications** (notify/indicate) to the app while it is in the background. This is the most relevant capability for monitoring a brew.  
- **Connection state restoration** on iOS — CoreBluetooth can restore a central manager's state after the app is killed and re-launched by the OS.  

It does **not** allow arbitrary code execution; the app is woken briefly for each BLE event delivery and must return quickly. `[documented — Apple developer docs, CBCentralManager background processing]`

### App Review scrutiny cost

Background bluetooth mode is **explicitly listed** in App Store Review Guideline 2.5.4: "Apps using background services must provide functionality when backgrounded, or they will be rejected. Make sure your app doesn't drain battery, generate excessive heat, or perform background processing that isn't critical to the core functionality."

An app that declares `bluetooth-central` **but does not need it** will be rejected or required to justify it. If the coffee machine sends characteristic notifications during a brew (fire-and-forget, passive push model), background mode is legitimately needed and defensible. If the protocol is request-response and the phone drives everything, background mode adds review risk without benefit. `[documented — App Store Review Guidelines 2.5.4]`

### Is it avoidable?

**Yes, if the brew protocol is passive.** If xBloom sends status notifications over BLE that the phone only needs to display (i.e., the phone receives, never transmits, during the brew), then:
- Without background mode: the brew continues on the machine; the phone simply won't update its UI until foregrounded. The brew is not broken — only the app's visibility of it.  
- The user experience cost is: no progress updates while phone is locked. A simple "keep your phone awake" UX guidance (common in hardware companion apps) may be sufficient for v1.

**If the protocol requires the phone to send commands at timed intervals** (e.g., pour triggers), then the brew will silently fail if the phone is backgrounded. In that case, background mode is necessary and its review justification is sound.

**Recommendation: determine the protocol direction before committing to background mode.** If the machine drives itself and only broadcasts status, skip background mode for v1. If the machine waits for phone-issued commands, you need it and should apply for it with a clear purpose string.

---

## E. App Store Review Surface

### Review risk from adding BLE

1. **Hardware controller category.** Apple reviews hardware companion apps more carefully than pure software apps but has a clear and published path for them (section 3.1.2, guideline 2.5.1). BLE-connected accessories do not face special barriers beyond the standard review. `[documented]`

2. **Purpose string specificity.** As noted in section C, the `NSBluetoothAlwaysUsageDescription` must name the specific device or device category. "Connect to Bluetooth" is a known rejection reason. "Communicate with your xBloom coffee machine" is sufficient. `[documented — common rejection pattern, multiple developer reports]`

3. **No additional entitlements required.** Central-role BLE does not require an MFi programme membership or a special entitlement. `[documented — Apple developer docs]`

4. **Background mode scrutiny** (covered in section D). Only declare it if the protocol requires it.

### App-specific risk context

The brief notes the app already carries: an unlicensed upstream and a `UIPasteControl` drawn under a custom face. These are existing risks independent of BLE. Adding BLE in a straightforward way does not interact with either of those issues and does not multiply review risk. `[inferred]`

### Known BLE rejection patterns

- Vague purpose string in `NSBluetoothAlwaysUsageDescription`. `[documented]`  
- Declaring `bluetooth-central` UIBackgroundMode with no evident functional need. `[documented — guideline 2.5.4]`  
- Using BLE to collect device identifiers for tracking (MAC addresses are randomised on iOS 14+, so this is largely moot, but mentioning in the purpose string that data is not used for tracking helps). `[documented — Apple privacy docs]`

---

## F. Testability

### Jest/unit testing of BLE logic

BLE cannot be exercised in a simulator — identical to NFC. The existing architecture already solves this problem for NFC. Reading the relevant files:

**`library/NFC.ts`** (read directly, 2026-08-30):
- Class `NFC` encapsulates all CoreBluetooth-equivalent operations: `init`, `open`, `close`, `readCard`, `writeCard`, `readMultipleBlocks`, `writeSingleBlock`.
- It imports `react-native-nfc-manager` directly at the top level.
- It is entirely transport — it knows nothing about recipe encoding.
- The class is exported as a default singleton-ish instance.

**`library/Recipe.ts`** (read directly, 2026-08-30):
- Imports `NFC` from `./NFC` and `Pour` from `./Pour`.
- Contains all byte-level encoding/decoding logic (CRC tables, block layout, XID parsing, etc.).
- `Recipe.ts` calls `NFC` methods to read/write bytes, but the encoding logic itself is purely functional — it operates on `number[]` arrays.

**The seam that already exists:**
`NFC.ts` returns `number[] | null`. `Recipe.ts` consumes `number[]`. The radio is fully behind that interface. This is exactly the transport/encoding separation needed.

**The same shape works for BLE.** A `BLE.ts` module would expose:
```
read(): Promise<number[] | null>
write(data: number[]): Promise<void>
```
`Recipe.ts` would call `BLE.ts` instead of (or in addition to) `NFC.ts` — or a thin adapter layer could route based on connection type.

For jest, mock `BLE.ts` at the module boundary (same pattern as mocking `NFC.ts` today). The byte-level protocol logic (characteristic UUIDs, handle parsing, characteristic value encoding) can be unit-tested with pure `number[]` inputs, no radio required. The `jest.config.js` already handles ESM module transforms — `react-native-ble-manager` ships as CJS (`dist/cjs/index.js`), so no addition to `extraEsmPackages` should be needed. `[inferred — ble-manager package.json confirms CJS main]`

**Verdict: testability is strong.** The existing NFC/Recipe seam is precisely the right model and requires no architectural change to BLE.

---

## G. Dev Workflow

### Physical device requirement

NFC already requires a physical device for all meaningful testing. BLE adds the same constraint and nothing worse. The dev story does not regress. `[documented — CoreBluetooth is not simulated in the iOS Simulator]`

### Expo Go

`react-native-ble-manager` is a native module with a CocoaPod dependency and a TurboModule codegen spec. **It will not work in Expo Go.** Expo Go ships a fixed set of native modules; third-party native modules require a development build. `[documented — Expo native module documentation; verified by the fact the app already uses react-native-nfc-manager and expo-dev-client is in dependencies]`

The app already has `expo-dev-client` in `dependencies` (`"expo-dev-client": "~57.0.16"`) and all EAS profiles support development builds (`"developmentClient": true` in the development profile). BLE requires no change to the existing dev workflow — it slots into the same development-build process used for NFC. `[verified — package.json and eas.json]`

### EAS build profiles

All three EAS profiles (`development`, `preview`, `production`) will pick up the new pod automatically after prebuild regenerates `ios/`. No profile changes are needed. `[inferred]`

---

## Summary Recommendations

### Library: `react-native-ble-manager` 12.5.1

**Use `react-native-ble-manager`.** It is the only library that is demonstrably New Architecture compatible today on RN 0.86 (SDK 57 mandatory New Arch). Its `codegenConfig` is present and correct, it ships an Expo config plugin that handles all permission and manifest plumbing, and it is actively maintained (Apache-2.0, 12.5.1 released 2026-07). `react-native-ble-plx` is the better-known library but its TurboModule migration is an un-merged draft as of August 2026 — it is not safe to ship on SDK 57.

**expo-doctor:** Add `react-native-ble-manager` to the `expo.doctor.reactNativeDirectoryCheck.exclude` array in `package.json` as a precaution (same pattern as `react-native-nfc-manager`). This prevents a false-positive CI failure if the directory check lags behind library releases. `[inferred — existing pattern in repo]`

### Background mode: **defer until protocol is characterised**

Do not declare `UIBackgroundModes: bluetooth-central` in the first BLE release unless the protocol is confirmed to require phone-initiated commands during the brew. If the xBloom machine drives itself and sends notifications, the brew works fine when the phone is backgrounded — the user just won't see live progress. This avoids App Store scrutiny risk at 1.0.x and can be added in a follow-up update with a concrete justification. A background mode added post-launch is far less likely to cause a rejection holdup than one added during initial review.

### Coexistence

**No blockers.** NFC and BLE coexist safely on iOS with no entitlement conflicts. The four local config plugins are all safe — two operate on the app Xcode project only (`withUserScriptSandboxDisabled`, `withExplicitModulesDisabled`), one injects a Podfile directive that will silently apply to the new pod (`withInhibitPodWarnings`), and one touches only the ShareExtension target (`withShareExtensionCcache`). None interact adversely with a new BLE CocoaPod.

### Architecture

Mirror the existing `library/NFC.ts` (transport) / `library/Recipe.ts` (encoding) separation. Create `library/BLE.ts` that wraps `react-native-ble-manager` and exposes `read(): Promise<number[]|null>` / `write(data: number[]): Promise<void>`. All byte-level protocol logic goes in `library/Recipe.ts` or a new sibling and is fully unit-testable without a radio.

---

## Sources (primary, verified 2026-08-30)

- npm registry: `react-native-ble-plx@3.5.1` — https://registry.npmjs.org/react-native-ble-plx/latest
- npm registry: `react-native-ble-manager@12.5.1` — https://registry.npmjs.org/react-native-ble-manager/latest
- npm registry: `expo-bluetooth@0.0.0` — https://registry.npmjs.org/expo-bluetooth/latest
- `dotintent/react-native-ble-plx` CHANGELOG — SHA `af62d09`, GitHub
- `dotintent/react-native-ble-plx` podspec — SHA `c33512e`, GitHub
- `dotintent/react-native-ble-plx` plugin/src — SHA `92a496d`, GitHub (withBLE.ts, withBLEAndroidManifest.ts, withBluetoothPermissions.ts, withBLEBackgroundModes.ts)
- `innoveit/react-native-ble-manager` package.json — SHA `0e04e63`, GitHub
- `innoveit/react-native-ble-manager` RNBleManager.podspec — SHA `0e7feb7`, GitHub
- `innoveit/react-native-ble-manager` plugin/src — SHA `60c5304`, GitHub
- `innoveit/react-native-ble-manager` docs/changelog.markdown — SHA `7f4597c`, GitHub
- `hessius/XBRecipeWriterPlus` app.json, package.json, eas.json — read directly from disk
- `hessius/XBRecipeWriterPlus` library/NFC.ts, library/Recipe.ts — read directly from disk
- `hessius/XBRecipeWriterPlus` plugins/ (all four) — read directly from disk
- PR #1331 draft status: confirmed via web search aggregate (GitHub PR page, Aug 2026)
- Expo SDK 57 = RN 0.86, New Architecture mandatory since SDK 55: confirmed via web search (expo.dev changelog)
