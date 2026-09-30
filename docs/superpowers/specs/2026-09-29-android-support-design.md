# Android support, without an Android device

An exploration, not a plan. It answers one question: how far can XBRW++ get on Android
when nobody working on it owns an Android phone, and where exactly does that stop?

The short answer is that the boundary is sharper than it looks, and it does not fall
where you would guess. The app is not mostly iOS code waiting to be ported. It is
mostly portable code with two hardware paths, and those two paths are the only things
that genuinely need a phone in a hand. Everything else, including the whole Play Store
apparatus, is device-free work that can start today.

The uncomfortable part is that the two hardware paths are the reason the app exists.

## A. What is already there

This is the finding that reframes the exercise. Android is not unimplemented; it is
unverified.

`library/NFC.ts` has a complete Android branch. Where iOS calls
`NfcManager.iso15693HandlerIOS`, Android issues raw ISO 15693 commands through
`nfcVHandler.transceive`: `0x2B` for system info, `0x23` read-multiple with a `0x20`
single-block fallback for reads, `0x21` for writes. The fallback is not speculative —
it is the standard mitigation for controllers whose `getMaxTransceiveLength` cannot
service a long multi-block read, and it is already written.

`library/machine/Transport.ts` is further along still. `negotiateMtu` exists *only*
for Android, because the 23-byte default leaves 20 bytes for a payload and a recipe
frame does not fit; iOS negotiates for itself and reports nothing. The scan is
deliberately unfiltered and narrowed in JavaScript by name or service UUID, which is
the right shape for Android's stack. `ensureBluetoothPermission` already splits
API 31+ (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`) from the older
`ACCESS_FINE_LOCATION` rule.

`components/NfcOverlay.tsx` was written for both platforms on purpose: on iOS it
stages itself above Apple's system sheet, and on Android, where there is no system
sheet, it *is* the ceremony and owns the progress count and the only way out.
`app/index.tsx` already registers a `hardwareBackPress` handler. `XbrwSheet` and
`brewHistory` already compensate by hand for `accessibilityViewIsModal` being
iOS-only. `components/ImportTile.tsx` already refuses paste-control mode on Android
and says why.

A prebuild produces a manifest that already carries `BLUETOOTH_SCAN` with
`neverForLocation`, the `ACCESS_*_LOCATION` pair capped at `maxSdkVersion="30"`, the
NFC permission, both URL schemes and a `SEND` `text/*` intent filter for sharing.
`machineDeviceId` is already excluded from backups, so a settings restore cannot carry
an iOS peripheral UUID onto an Android phone.

None of this is the work of someone deferring Android. It is the work of someone who
wrote for both and could only ever run one.

## B. The measurement that matters

Every one of those Android branches is untested, and it is worth being exact about
why.

`jest-expo`'s default preset pins `haste.defaultPlatform` to `ios`. The entire suite —
5,275 tests — runs with `Platform.OS === "ios"`. Every `else` branch in `NFC.ts` and
every Android path elsewhere is dead code as far as CI is concerned. The single
exception is `library/machine/__tests__/Transport.test.ts`, which flips `Platform.OS`
by hand and resets it in an `afterEach`, and is the only file in the repository that
has ever executed an Android code path.

So the suite was run a second time under `jest-expo/android/jest-preset`. The result:

    Test Suites: 7 failed, 292 passed, 299 total
    Tests:      40 failed, 5248 passed, 5288 total

Those 40 are not 40 bugs. Classified:

| Suite | Cause | Reading |
| --- | --- | --- |
| `library/__tests__/NFC.sysinfo.test.ts`, `NFC.capacity.test.ts` | Mock only `iso15693HandlerIOS` | The Android transceive path has **zero** coverage. The tests do not fail on Android; they fail to exist. |
| `hooks/__tests__/useMachine.test.ts`, `useMachine.persistence.test.ts`, `app/__tests__/brew.test.tsx` | `ensureBluetoothPermission` reaches `PermissionsAndroid`, which the harness does not provide | The whole Android permission gate — and the entire first-run machine experience behind it — is unexercised. |
| `components/__tests__/ImportTile.test.tsx`, parts of `app/__tests__/index.test.tsx` | Assert paste-control behaviour that Android correctly declines | Test-fixture assumptions, not defects. Needs platform gating. |
| `app/__tests__/network.test.tsx` | Pre-existing, unrelated | Belongs to uncommitted work on `record-the-dial`. |
| `RecipeDatabase.migration.test.ts` "sane time" | Timing under a slower second run | Probably harness noise. |

The conclusion is not "Android is broken". It is that **running the suite twice is the
single highest-value device-free change available**, and it costs one jest project and
roughly three minutes of CI. It converts a large body of already-written, never-run
Android code into code with a regression net under it.

## C. The hard boundary

Research (2026-09-29, sources in §H) puts this beyond reasonable doubt.

**NFC cannot be simulated.** The Android Emulator has no NFC radio emulation of any
kind — there is no virtual tag and no reader-mode dispatch. The AOSP Cuttlefish NFC
HAL work that exists is HCE/ISO-DEP between virtual devices, for platform conformance
testing, and does not reach NfcV. More decisively: Android's only app-facing
"pretend to be a tag" mechanism, Host Card Emulation, is ISO 14443-A/B only. There is
**no public Android API that can emulate an ISO 15693 tag at all**, on an emulator or
on real hardware. A second Android phone cannot stand in for an xBloom card.

**BLE can be simulated, but not usefully.** Emulator Bluetooth via Rootcanal supports
emulator-to-emulator. Host-radio passthrough exists only as an Android Automotive
`-usb-passthrough` feature and via Google's Bumble bridge, both Linux-oriented; no
macOS path was found. Either way it gets you a peripheral you wrote yourself, not
xBloom firmware.

**Cloud device farms do not solve this, and the reason is physics, not policy.** A
farm rents you a real phone in a rack. Your card must be within centimetres of it and
your machine within metres. Farms advertising "NFC support" mean the device's radio
and stack function, not that *your* card is in the building. Samsung's free Remote
Test Lab states outright that peripherals are not supported. The only exceptions are
negotiated private-lab arrangements where you physically ship hardware — which for a
coffee machine is not a serious proposal.

So the irreducible list is short and absolute:

1. Reading a genuine card on Android.
2. Writing a genuine card on Android, including the `0x23`/`0x20` fallback on more
   than one NFC controller vendor.
3. Connecting to, and brewing on, a real machine over Android BLE.

Everything not on that list is device-free.

There is one asymmetry worth naming because it raises the stakes. The 32-byte
signature is read off the card and re-prefixed, never recomputed. Android reader mode
invalidates its tag handle on brief signal loss more readily than Core NFC does, and
a write is block-by-block. A half-written genuine card is not trivially recoverable.
Android card *writing* therefore deserves more hardware time than card reading, not
equal time.

## D. What is device-free, and verified

- **Cloud builds.** `eas build -p android` needs no local Android SDK. This machine
  has none — no `~/Library/Android/sdk`, and a JDK 24 that RN would reject anyway —
  and that is fine. `eas build --local` is the option that would need the toolchain,
  and it is not needed.
- **A remote Android emulator.** `eas simulator` was checked directly rather than
  taken on trust: `npx eas-cli@latest simulator --help` advertises
  `-p, --platform=android|ios` and `--device` taking "an AVD hardware profile id
  (e.g. `pixel_7`)". Android is available now, not coming soon. It can install an EAS
  build by id or fingerprint. This is how the app gets driven on Android at all
  without local tooling.
- **Emulator E2E in CI.** GitHub-hosted `ubuntu-latest` runners have had KVM since
  April 2024, so `ReactiveCircus/android-emulator-runner` plus Maestro is viable on
  the standard runner. EAS Workflows documents the same shape with an `e2e-test`
  build profile.
- **The second jest project**, per §B.

Taken together these cover the library, editor, shelves, hub browsing, import,
settings, backup and history — which is most of the app's surface and all of its
recent development.

## E. Gaps found in the code, all fixable without a device

**1. Nothing ever asks whether NFC exists or is switched on.** This is the clearest
iOS assumption in the codebase. On iOS, a supported iPhone always has NFC and the user
cannot disable it. On Android neither holds: many devices ship without an NFC
controller, and on those that have one it is a toggle in Settings. `NFC.init()` calls
`NfcManager.start()` inside a `try` that logs to a console the user cannot see, and
the first thing they would learn is an opaque failure at `requestTechnology`. Neither
`isSupported()` nor `isEnabled()` is called anywhere in the repository, and
`goToNfcSetting()` is never offered. Three outcomes need distinct copy: no hardware
(hide the card features rather than fail them), hardware switched off (say so, offer
the settings route), ready.

**2. A permanently denied Bluetooth permission is a dead end.** `openLink` throws
`"XBRW++ needs permission to use Bluetooth."` when `ensureBluetoothPermission` returns
false. Android has a state iOS does not: denied twice, after which the system dialog
never appears again and only the app's settings page can undo it. Today that state
looks identical to a first refusal, and the message invites the user to do a thing the
OS will silently ignore. It needs to distinguish the two and offer
`Linking.openSettings()` for the second.

**3. The placement teaching is an iOS antenna.** `HOLD_CARD` in `constants/copy.ts`
reads "Hold the card to the top of the phone." That is where the iPhone's antenna is.
Android NFC antennas are usually in the upper-middle of the *back*. On Android this
copy sends the user to the wrong part of the phone, and the failure it produces looks
exactly like an unsupported card. This is one string and it matters more than its size
suggests, because `NfcOverlay` on Android *is* the entire ceremony.

**4. Play's implied-feature filtering.** The generated manifest declares no
`<uses-feature>` at all. Checked against Android's primary documentation rather than
assumed, because the intuitive answer is wrong in both directions:

- `android.permission.NFC` is **not** in Table 2 of the `<uses-feature>` reference.
  It implies nothing, so the Play listing is *not* being filtered to NFC-capable
  devices. Good news, and the opposite of the common belief.
- `BLUETOOTH_ADMIN` **is** in Table 2, and implies `android.hardware.bluetooth`. With
  `targetSdkVersion >= 5`, Play filters the app from devices without it. In practice
  that excludes almost nothing, but it is filtering nobody asked for.

The app is genuinely usable with neither radio — the library, the editor, importing
from a link and browsing the hub all work — so both features should be declared
explicitly with `required="false"`: `android.hardware.nfc`,
`android.hardware.bluetooth`, `android.hardware.bluetooth_le`. That states intent
rather than inheriting it, and it is the declaration that lets a non-NFC Android phone
install the app and still use most of it. `aapt2 dump badging` on the built artefact
is how to confirm it, and needs no device.

**5. Edge-to-edge and insets.** `edgeToEdgeEnabled=true` is already set, which is the
opt-in half. The audit half is untouched: every `useSafeAreaInsets` consumer
(`ScreenHeader`, `HomeHeader`, `RecipeHero`, `BrewMiniBar`, `BrewRatingBar`,
`ShelfPickerHeader`, `hub`, `hubRecipe`, `editRecipe`, `index`) was tuned against iOS
safe areas. Android 15+ draws behind the bars unconditionally, and the usual
breakages are double padding and bottom bars sitting under the gesture pill. This is
exactly what a remote emulator screenshot pass is for.

**6. Predictive back.** `enableOnBackInvokedCallback` is `false` in the generated
manifest — the documented temporary opt-out. Not a blocker, but the brew flow is the
risky part: `RunOwner` lives above the navigator precisely so navigating away cannot
lose a run, and predictive back changes when and how a back gesture commits.

**7. Sharing into the app.** The manifest has the `SEND` `text/*` filter, and
`parseImportInput` checks neither host nor path, so the parsing half is portable and
already tested. The untested half is whether XBRW++ appears in Android's share sheet
from Chrome at all. An emulator can answer that one — it needs no xBloom hardware.

## F. Play Store logistics

Independent of code, and able to run in parallel from day one:

- **targetSdk 36 (Android 16)** for new apps and updates from 2026-08-31, extendable
  to 2026-11-01 via Play Console.
- **16 KB page alignment** for native libraries. XBRW++ ships several `.so` files it
  does not own — Hermes, React Native, Worklets, NFC and BLE modules — so compliance
  is a dependency audit, not a setting.
- **The closed-testing gate.** A personal Play account created after 2023-11-13 must
  run a closed test (reported as 12 testers for 14 continuous days; confirm the
  current number in Play Console, Google has changed it) before production. Whether
  this applies depends on account type; organisation accounts are exempt but need a
  D-U-N-S number, which takes days to weeks. **This gate is the long pole, and it does
  not need NFC or BLE to work** — it can be satisfied by testers exercising the
  library and editor while the hardware paths are still being proven.
- **Data safety form and privacy policy.** `PRIVACY.md` and `constants/network.ts`
  already state the claim precisely ("card contents never leave this phone", "a brew
  goes to the machine in the room with you over Bluetooth, and no further"), so this
  is transcription rather than discovery.
- **Store assets.** `tools/store-screenshots` exists but is an iOS-framed generator;
  Play wants its own sizes plus a feature graphic.

## G. What this adds up to

Three phases, and only the third needs hardware.

**Phase 1 — prove the portable 90%, device-free.** Add the Android jest project and
fix the 40 failures, which mostly means writing the Android transceive tests that were
never written and giving the BLE permission gate a test harness. Fix the code gaps in
§E 1–4. Build with `eas build -p android` and drive it on `eas simulator -p android`.
Add a Maestro flow on a KVM runner. Start the Play account and, if the closed-testing
gate applies, start the 14-day clock immediately — the calendar is the scarce
resource, not the engineering.

**Phase 2 — the emulator pass.** Edge-to-edge and inset audit, predictive back, share
sheet, back gesture through the brew flow, Talkback. All of this on the remote
emulator, all of it screenshot-comparable.

**Phase 3 — the part that cannot be bought off.** Someone holds an Android phone next
to a genuine card and a real machine. Read, then write, then brew. On at least two NFC
controller vendors, because `getMaxTransceiveLength` differences are the most likely
cause of "works on a Pixel, fails on a Samsung", and the `0x23`/`0x20` fallback is the
thing being tested.

The honest recommendation: do not architect around the absence of a device. A used
Pixel costs less than a day of the engineering it would take to half-simulate one, and
there is no simulation for the card in any case. Phases 1 and 2 are worth doing on
their own merits and will occupy the time it takes for one to arrive. What should
*not* happen is shipping to Play on the strength of a green emulator suite: the 40
Android test failures above are a fair warning about how much of this has never
executed, and a half-written genuine card is not an acceptable way to find out.

## H. Sources

Verified directly during this exploration:

- `npx eas-cli@latest simulator --help` — Android platform and AVD device flags
  present (2026-09-29).
- `https://developer.android.com/guide/topics/manifest/uses-feature-element` —
  Table 1 (Bluetooth special handling) and Table 2 (permissions implying features);
  page last updated 2026-09-01. NFC absent from Table 2; `BLUETOOTH_ADMIN` present.
- `jest-expo/jest-preset` `haste.defaultPlatform === "ios"`;
  `jest-expo/android/jest-preset` `defaultPlatform === "android"`.
- The two suite runs quoted in §B.
- Absence of a local Android SDK and a JDK 24 on the development machine.

From research, primary where marked:

- Android Emulator has no NFC emulation; HCE is ISO 14443 only, so ISO 15693 cannot
  be emulated by any Android API.
- Emulator Bluetooth via Rootcanal is emulator-to-emulator; passthrough is AAOS
  `-usb-passthrough` (source.android.com) or Google Bumble, Linux-oriented.
- Samsung Remote Test Lab: peripherals not supported
  (developer.samsung.com/remotetestlab).
- KVM on standard `ubuntu-latest` runners since 2024-04 (github.blog changelog);
  `ReactiveCircus/android-emulator-runner`.
- EAS Workflows E2E with Maestro (docs.expo.dev/eas/workflows/examples/e2e-tests/,
  page dated 2026-07-22).
- targetSdk 36 deadline 2026-08-31 (developer.android.com/google/play/requirements/
  target-sdk).

Flagged as needing confirmation in Play Console at submission time, because Google
changes them without notice: the exact closed-testing tester count and duration, the
16 KB page-size deadline wording, and the identity-verification and D-U-N-S
requirements.

---

## Amendment: what the implementation did, and what it did not

Written after executing the plan in
`docs/superpowers/plans/2026-09-29-android-support.md`, so that a green suite is
not mistaken for a working app.

### What is now proven

Both jest projects are green, and the Android one is new. The suite runs 604
files twice rather than once, and `Platform.OS` is no longer `"ios"` everywhere.
That turned an unknown into a measurement: 40 tests failed the first time the
Android project ran, and every one of them has been dealt with.

Four things are fixed rather than merely tested.

1. The Bluetooth permission gate now distinguishes an ordinary refusal from a
   permanent one and offers app settings for the second, which was previously a
   silent dead end: Connect did nothing and nothing on screen said why.
2. `readMultipleBlocks` falls back to single-block reads when the controller
   rejects the 0x23 frame outright, not only when the tag answers and refuses.
   A 40-block card asks for 161 bytes back, and a controller whose transceive
   buffer is smaller rejects rather than answering, so the card looked
   unreadable.
3. The app asks whether the phone has NFC and whether it is switched on before
   opening a ceremony, and says which it is. It previously assumed both.
4. The manifest declares NFC, Bluetooth and Bluetooth LE as optional, so the
   Play listing stops inheriting a device filter from `BLUETOOTH_ADMIN` that
   nobody wrote down. Verified against a generated manifest, not assumed.

### What is not proven, and cannot be here

**The three hardware items from §C stand unchanged.** Nothing in this work
brings them closer, because no amount of test coverage can:

- reading a genuine card on an Android phone,
- writing a genuine card, on at least two NFC controller vendors, since the
  0x23/0x20 split is a controller behaviour and one vendor proves nothing,
- brewing on a real machine over Android BLE.

Writing deserves the most of that time. Android reader mode drops its tag handle
on brief signal loss more readily than Core NFC does, and writes go block by
block, so the likely failure is a half-written genuine card whose 32-byte
signature cannot be regenerated.

### What was in scope and was deliberately left

- **Edge-to-edge and window insets.** Android 15 enforces edge-to-edge, and this
  app draws its own headers. Whether anything collides with the status bar or
  the gesture bar is a visual question, and a screenshot from an emulator would
  answer it. Not attempted.
- **Predictive back.** Android 16 makes it the default. The brew flow has states
  that a back gesture should not silently leave, and the current behaviour under
  a predictive back is unknown.
- **The Android share sheet.** `expo-share-intent` is configured and the text
  filters are generated, but no Android share has been exercised end to end.
- **Play Store logistics** (§F): account, closed testing, targetSdk deadline.
  Untouched, and none of it is code.

### One thing found along the way

`expo-doctor` reports four Expo packages one patch behind. It is upstream drift,
present on `main` as well, and was left alone rather than folded into this work.
