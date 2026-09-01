# M3 — Brew a recipe over Bluetooth

**Date:** 2026-08-31
**Issues:** #60 (BLE foundation), #61 (brew a recipe)
**Deferred out of this milestone:** #62 (Easy Mode slots)
**Depends on:** nothing. **Feeds:** M4 (#63 live telemetry, Live Activity).

---

## 1. What this ships

XBRW++ can connect to an xBloom Studio (J15) over Bluetooth LE and brew a recipe
from the library — coffee or tea — showing the brew's progress and letting the
user stop it.

It also ships a hidden **machine console**: a raw command sender and frame log
that exists to settle the protocol's open questions on real hardware, and to
make a user on an unknown firmware revision diagnosable rather than merely
sympathetic.

### Not in this milestone

- **Easy Mode slots (#62).** Slots are write-only, must be written three at a
  time or the machine hangs at state `0x43` showing RETRY, and cannot be read
  back — so the app has to model them blind. That is a different feature with a
  different UX problem, and bundling it would roughly double the hardware
  surface of a milestone where almost nothing can be verified in software.
- **Live telemetry.** The weight streams arrive at 10×/s and are fully
  available, but rendering them is M4 (#63). M3 reports lifecycle stages only.
- **The standalone capabilities** — FreeSolo brewer, standalone grinder, scale
  mode, mechanical calibration, unit settings. All reachable from the console;
  none get first-class UI.
- **Background operation.** No `bluetooth-central` background mode. See §7.

---

## 2. The decisions that shape everything else

### 2.1 We never send command 40518

The commit command (`8002`) arms the machine. It then either auto-proceeds into
grinding, or parks in `awaiting_confirm` (`0x1E`) waiting for a human to press
the button on the machine.

Command `40518` is supposed to be the remote confirm. The sources contradict
each other *on hardware*: brAzzi64 and Janczykkkko treat it as the start frame;
saya6k tested it live on 2026-07-19 and watched it bounce the state **backwards**
to `recipe_loaded`; Janczykkkko separately verified that sending it into a
*running* brew **aborts the brew**; HomoLand names the same code
`COFFEE_PAUSE`. The research calls this the most operationally dangerous
unknown in the protocol.

**We do not send it.** If the machine parks in `0x1E`, the app says
`PRESS ▶ ON THE MACHINE`. This is the only choice that cannot misfire, the
fallback costs the user one second because they are standing in front of the
machine, and a human confirming before hot water and a spinning burr is
defensible as a safety property rather than a compromise. It also means M3
requires no dangerous hardware spike to ship.

The console can send it deliberately (§5), which is how we settle it for M4.

### 2.2 We never send command 8104 (Set Cup)

Three implementations send three materially different value sets — `(200, 80)`,
`(110, 90)`, `(80–90, 40)` — the machine reportedly brews correctly regardless,
and nobody knows what the field means. The research recommends omitting it
initially. We omit it, and record that we did.

### 2.3 We do send command 8102 (bypass + dose), with bypass zeroed

It carries the dose as well as the bypass arguments, and the research is
explicit that skipping it makes the grind drift. Bypass volume and temperature
are sent as zero, which disables bypass while still communicating the dose.

### 2.4 We do not assume PRO mode is required

The research establishes that *slot writes* are rejected outside PRO mode. It
does not establish that recipe sends are, and the user's experience of the
official app is that the modes do not matter for brewing.

So we try, and adapt: if the blob never reaches `loading`/`armed` within the
timeout **and** the info blob reports EASY mode, the app offers one switch to
PRO (`11511`, payload `"00000000"`) and retries once. It never switches the
mode of a machine across the room without asking.

### 2.5 The ratio byte is a ceiling, not a round

`ratioByte = min(ceil(totalWaterMl / doseG * 10), 255)`.

saya6k found on hardware that 18 g / 250 ml truncated to `138` and the machine
**never ground at all** — no error, no complaint. `139` grinds. A small
overshoot is tolerated; any undershoot is fatal and silent. This is the single
most likely way to ship a brew feature that appears to work and does nothing.

### 2.6 Grinder-off is `0xFE`, not `0x00`

`0x00` means *grind at the finest setting*. brAzzi64's original script sent
`0x00` for no-grind; every later source sends `0xFE`, confirmed by HCI capture.
Note this differs from the card format, where grinder-off is `41`
(`GRINDER_OFF`, with `GRIND_SIZE_OFFSET` 40).

### 2.7 Twenty seconds of silence is normal

After commit, the machine grinds **emitting no status frames at all** for around
twenty seconds. A client that treats that gap as a stall reports a failure that
did not happen. The `GRINDING` phase has no timeout in the ordinary sense; it
waits for the grinder-stop event.

---

## 3. Architecture

Three layers, mirroring how the card path is already split. The point of the
split is that the top layer is fully provable without hardware, and the
unprovable part is made as thin and as dumb as possible.

```
library/machine/protocol.ts   pure codec       — 100% unit tested, byte-exact
library/machine/Transport.ts  radio wrapper    — thin, dumb, untestable
library/machine/Machine.ts    session + brew   — tested against a fake transport
hooks/useMachine.ts           link lifecycle
hooks/useBrew.ts              one brew
app/brew.tsx                  the brew route
app/machine.tsx               the console
```

### 3.1 `library/machine/protocol.ts`

No imports from anywhere in the app, no React, no react-native. A function of
bytes.

- `buildType1(cmd, ints)` — `58 01 01 [cmd] [len] 01 [N×4-byte LE] [crc]`
- `buildType2(cmd, bytes)` — `58 01 02 …`
- `crc16Kermit(bytes)` — poly `0x1021`, init 0, reflected in and out, no final
  XOR. (brAzzi64 describes this as `0x8408`; it is the same algorithm.)
- `parseNotification(bytes)` — returns a discriminated union:
  `Status{state}` · `Ack{cmd}` · `WaterWeight{grams}` · `CupWeight{grams}` ·
  `MachineInfo{serial, model, firmware, waterEnough, mode, grindSize, …}` ·
  `Event{code}` · `Unknown{raw}`.
  Water weight arrives in **milligrams** and is divided by 1000; cup weight is
  already grams.
- `encodeCoffeeBlob(recipe)` and `encodeTeaBlob(recipe)`.

**The blob is `[length][segments…][grinderByte][ratioByte]`.** A normal pour
segment is eight bytes: `volume, tempC, pattern, agitation, negPostWait, 0x00,
rpm, flow×10`. A pour above 127 ml emits four-byte lead chunks
`[127, tempC, pattern, agitation]` until the remainder fits the trailing
eight-byte segment. **This path is required, not theoretical:** `cardLimits.ts`
allows coffee pours up to 240 ml.

RPM is non-zero only in the first pour's eight-byte segment; later pours carry
zero.

**`encodeCoffeeBlob` deliberately does not reuse `Recipe.getData()`.** The two
layouts rhyme but differ — the `negPostWait`/`0x00` pair, the >127 ml chunking,
the grinder sentinel. `getData()` is the NFC card format, which is fixed and
must not move; the BLE blob is a protocol that demonstrably varies between
firmware revisions. Coupling them would let a protocol fix corrupt card writes,
and a malformed write to a genuine card is not trivially recoverable.

### 3.2 `library/machine/Transport.ts`

Wraps `react-native-ble-manager` and nothing else. Scan by service UUID
`0000E0FF-3C17-D293-8E48-14FE2E4DA212` or by name prefix `XBLOOM`; connect;
subscribe to `FFE2`; write to `FFE1`.

**Writes must be Write Without Response.** Write-with-response is rejected by
the machine with `CBATTErrorDomain Code=14`.

Emits raw `Uint8Array`s upward; interprets nothing. Same role and same shape as
`library/NFC.ts`.

### 3.3 `library/machine/Machine.ts`

Owns the session and the brew state machine. Takes a transport by constructor
injection so tests can drive it with a scripted fake. Exposes an observable
`BrewPhase` and the last-known machine info.

---

## 4. The brew, end to end

```
connect  →  handshake 8100 within ~200 ms  →  settle ~2 s
gate     :  refuse unless idle and tank OK
send     :  8102 [0, 0, dose]
send     :  8001 (grind) | 8004 (no grind) | 4513 (tea)
commit   :  8002      |  4512 (tea)   <- no arguments; the 01 in a
                                            capture is the frame marker
observe  :  0x1D loading  →  0x1F armed
              ├─ auto-proceeds → 0x22 starting → GRINDING
              └─ parks at 0x1E → "PRESS ▶ ON THE MACHINE"
grinding :  ~20 s of silence expected; wait for grinder-stop (40507)
pours    :  40510 carries the pour index → "POUR n OF m"
done     :  40511 brewer stop → 40512 enjoy → ENJOY
cancel   :  40519 [1], then 8022 back to home
```

### 4.1 Preflight

**Strict.** The send is blocked, with a specific reason, unless the machine is
idle and the tank is not low. A false refusal costs a second press; a false send
costs water on the counter or a brew interrupted halfway.

Blocked on the app side too: a recipe that `cardLimits` would reject cannot be
brewed, exactly as it cannot be written.

Undetectable, and therefore stated rather than checked: whether a cup is under
the spout, whether the pod is loaded, whether the beans match the dose. The brew
route carries a one-line reminder on a user's first brew only.

### 4.2 Terminal failures

Each is a named, non-recoverable end state with its own copy: `40522` no water,
`0x0F` no beans, `8203` gear position, `8204` dose/water mismatch, `40517`
idling.

**Link loss is not one of them.** The machine executes a committed recipe
itself; losing Bluetooth is assumed not to abort it. The app reports "lost
contact — the machine is still brewing" rather than claiming a failure. This
assumption is implied by every source and stated by none, so it is item 8 on the
hardware checklist (§8).

### 4.3 Tea

Tea uses a different path entirely — `4513` to upload, `4512` to execute — and
is the least-verified corner of the protocol.

The steep encoding is unresolved and the two candidates are not variants of one
scheme:

- **HomoLand:** `divmod(seconds, 60)` → `((-remainder) & 0xFF, (minutes * 32) & 0xFF)`,
  claimed to be a port of the official Android app's `TeaRecipeCreate` native
  transform.
- **saya6k:** a single soak byte scaled by 0.6, self-described as approximate
  and derived from two stopwatch measurements.

Getting this wrong produces no error. The tea simply steeps for the wrong
length and quietly tastes bad.

**Both are implemented.** HomoLand's is the default, on provenance. saya6k's
sits behind a switch in the console. One stopwatched 60-second steep settles it,
after which the loser becomes a footnote and the finding goes back into
`ble-protocol.md`.

---

## 5. The machine console

Hidden behind repeated taps on the firmware version in Settings → Machine. It
ships in production builds.

### 5.1 Why it ships

The protocol varies between firmware revisions, and no source has tested more
than one unit on more than one revision. Without the console, a user whose brew
does not start can report only that it did not start. With it, they can send a
frame log. It is also the instrument that retires C3, C4, C5, C6 and C11 — the
console is how M3's unknowns become M4's facts.

### 5.2 What it is

**A catalogue, not a whitelist.** Every command in the research table, with its
code, packet type, argument shape and confidence tag. Pick one, fill in the
arguments, send, watch the log. Plus a raw hex-frame field, so an undocumented
code is a paste away.

**Tiered, and honest about it:**

| Tier | Examples | Treatment |
|---|---|---|
| Inert | handshake, back to home, request info, tare | Send freely |
| Moves the hardware | grinder start, brewer start, mode switch, slot writes | Confirm once |
| Unresolved | 40518, unit setters, set cup | Confirm, with the contradiction shown inline |

The unresolved tier displays the actual disagreement at the point of sending —
for 40518: *"saya6k observed this bouncing the state backwards; Janczykkkko
observed it aborting a running brew."* Somebody about to fire an ambiguous
command should be reading the ambiguity, not a generic warning.

**The log is the product.** Timestamped, both directions, raw hex plus a decoded
reading where we have one, copyable as a block.

### 5.3 Guarding

A one-time acknowledgement the first time the console is opened: this sends raw
commands to your machine, it can start hardware moving, and nothing here is
verified. After that, the tier confirmations carry it.

This is a deliberate choice to ship a loaded instrument to anyone who goes
looking for it, in exchange for being able to help the next person on unfamiliar
firmware. The alternative — dev-only — makes the first user with a different
revision unhelpable.

### 5.4 Findings return to the repo

Every contradiction settled updates the C1–C11 table in
`docs/machine-integration/ble-protocol.md` with the date and the firmware
revision it was settled on. That document currently notes that no source has
tested more than one unit; this milestone makes us the second.

---

## 6. Surfaces

### 6.1 The editor action bar adapts

`app/editRecipe.tsx` currently ends in two actions on purpose — WRITE at double
width in the accent, SAVE outlined, everything else behind the caret.

**Until a machine has been remembered, that bar does not change at all.** Once
one has, BREW appears and takes the accent, and WRITE demotes to an outline.

The reasoning: no dead control for the users who will never own a J15, which
today is all of them; the accent follows the verb somebody with a machine would
actually reach for; and the shape of the bar answers "is my machine set up?"
without a status dot or a trip to settings.

BREW carries the same validity gate as WRITE.

### 6.2 `app/brew.tsx`

A dedicated route rather than an overlay or a dismissable sheet. A brew runs for
three to five minutes, so the blocking ceremony that suits a two-second card
write is the wrong modality — and M4 lands immediately after this, so the route
is built to be grown into rather than replaced.

Shows: the recipe name, the current stage, the pour counter, CANCEL, and the
terminal states. On a user's first brew only, the line about the cup and the
pod.

`CANCEL` is not optional. An app that can start a brew it cannot stop is not one
worth shipping.

### 6.3 Settings → Machine

**This section is always present, whether or not a machine has been paired.** It
is the answer to the discoverability hole the adaptive action bar would otherwise
open: if BREW only appears once a machine is remembered, something has to tell a
new J15 owner that pairing exists. Unpaired, the section reads *Not connected*
with a single Connect row. That is enough — a user who owns the machine will
look, and a user who does not is shown one inert row rather than a dead button
on every recipe.

Paired, it shows Forget plus the machine's own vitals read from the info blob:
serial, model, firmware, water level, grind size, mode. The firmware row is the
console's hidden entry.

The remembered device id is a key in `library/Settings.ts`, read through
`useSetting` like every other persisted preference — not a new storage
mechanism.

---

## 7. Connection model

**Lazy connect, sticky while foregrounded.**

- Nothing happens at launch. The link is made the first time the user reaches
  for the machine — pressing BREW, or opening the console. **One beep.**
- Once connected, the link is held, so a second brew or an edit-and-rebrew costs
  no beep and no handshake. (The machine beeps on connect; a connect-per-brew
  model chirps at the user repeatedly for no benefit.)
- Backgrounding the app releases the link, handing the machine's single
  connection slot back to the official app. Without a background mode iOS
  suspends us anyway, so holding it would be a fiction.
- The console holds the link for as long as it is open — a log with gaps in it
  is not a log.

The machine permits **one BLE link at a time** and gives no protocol-level
rejection when it is taken: it simply ignores you. If the official app is
running, we fail, and the failure copy says so rather than blaming the machine.

The device id is remembered after a first successful connect, so later sessions
reconnect directly and fall back to scanning. It is persisted as a key in
`library/Settings.ts`.

**No `bluetooth-central` background mode.** It is required for M4's Live
Activity — there is no push route, because the data originates on the machine
rather than a server — but declaring it now, with nothing using it, is the shape
Apple rejects under guideline 2.5.4. By M4 there is a demonstrated need. The BLE
layer is therefore written with no foreground assumption baked in, so M4 adds
the mode and a consumer without rearchitecting.

**What happens if the app is backgrounded mid-brew is deferred to M4**, when
telemetry exists to inform it. M3 does the simple thing: release, and re-sync
state on return.

---

## 8. Verification

### 8.1 Without a machine

This is most of the milestone, and it is deliberate: the layering exists so that
the parts that can be proven are proven.

**The codec** against fixtures written as an **independent reimplementation** —
the same discipline `library/__tests__/cardFixtures.ts` applies to the card
format, so that a passing round-trip test is not tautological. The research
publishes byte-exact frames to check against:

- handshake — `580101A41F1400000001B900000001000000BDD1`
- commit — `580101421F0C000000017FCF`
- mode switch to PRO — payload `"00000000"`; to EASY — `"91327856"`

Blob cases that must each have a test: a single pour; a pour above 127 ml
exercising the chunk path; a multi-pour recipe proving RPM appears only in the
first segment; a no-grind recipe asserting `0xFE`; and the ratio ceiling,
asserting that 18 g / 250 ml produces `139` and not `138`.

**The state machine** against a fake transport replaying scripted frame
sequences: the happy path; the `awaiting_confirm` park; a run with twenty
seconds of deliberate silence that must **not** time out; one per terminal error
frame; a cancel; and a mid-brew disconnect.

**The brew route** against a fake machine, via `renderWithProviders`.

### 8.2 Native changes

- `react-native-ble-manager` 12.5.1 — Apache-2.0, New-Architecture-only since
  v12, ships an Expo config plugin. `react-native-ble-plx` is not an option:
  it is bridge-mode only and its New Arch rewrite is still a draft PR, and SDK 57
  ships without the legacy interop layer.
- `NSBluetoothAlwaysUsageDescription`, **naming the device explicitly**. Generic
  strings are a known rejection.
- Android `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`, with `neverForLocation`.
- No background modes.
- `npx expo prebuild --clean` and a new dev client. BLE cannot be exercised in a
  simulator, exactly like NFC.
- `expo.version` bump, since `runtimeVersion.policy` is `appVersion`.
- Possibly a `reactNativeDirectoryCheck` exclusion, as `react-native-nfc-manager`
  already requires. expo-doctor is a hard CI failure.

### 8.3 With the machine

Escalating, so each step is only attempted once the one below it has worked.

| # | Step | Settles |
|---|---|---|
| 1 | Scan, connect, handshake | Transport, service/characteristic UUIDs, the 200 ms window |
| 2 | Read the info blob — does the decoded serial, firmware and grind size match the machine's own display? | The parser, for free |
| 3 | Tare | That writes are accepted at all |
| 4 | **A no-grind recipe, small volume, cup in place** | The whole path, without the burr |
| 5 | A grinding recipe | The ratio byte and the silent grind window |
| 6 | A tea recipe, single steep, stopwatched at 60 s | That the tea path runs at all, and C11 |
| 7 | Load a recipe while the machine is in EASY mode | Whether §2.4's fallback is ever needed |
| 8 | Drop the link mid-brew | §4.2's assumption that the brew survives |
| 9 | From the console, deliberately: 40518 while armed | C4, for M4 |

**Steps 1–6 are acceptance criteria.** Tea is in scope, so a tea brew has to
run; the stopwatch on the same brew settles C11 at no extra cost, and if
HomoLand's encoding loses, the console switch flips the default before ship.

**Steps 7–9 are experiments.** They inform M4 and update `ble-protocol.md`, but
M3 does not wait on them.

---

## 9. Risks

**The ratio byte silently skipping the grind.** Mitigated by §2.5's ceiling and a
dedicated test, but it is the failure that looks most like success.

**Firmware divergence.** Everything here is derived from V12.0D.500 on units
nobody cross-checked. This is precisely why the console ships.

**Tea steeping wrong and looking fine.** Mitigated by shipping both encodings
and settling it with a stopwatch rather than a choice.

**Ambiguity about what a dropped link does mid-brew.** Item 8. Cheap to test,
and the worst case is that coffee stops.

**Review risk from the console.** A production build containing a raw BLE
command sender is unusual. It is behind a hidden gesture, acknowledged on first
open, and tiered — and it is the difference between supporting a stranger's
firmware and shrugging at them.

---

## 10. Open questions carried forward

- **C4 (40518)** — sidestepped, not answered. Answering it is what would let M4
  offer a remote start.
- **C3 (8104 Set Cup)** — omitted. If a brew ever behaves oddly with an unusual
  cup, this is the first suspect.
- **C5/C6 (unit orderings)** — untouched; the app does not set units. One console
  round trip resolves both.
- **Whether a dropped link aborts a brew** — item 8.
- **#62 Easy Mode slots** — a milestone of its own, and it inherits this
  milestone's transport and codec intact.
