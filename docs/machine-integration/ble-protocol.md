# xBloom Studio (J15) BLE Protocol — Research Findings
**Session:** `0c6153e8-108c-429a-947f-7e31ae5eb72d`  
**Compiled:** 2026-08-30 by research subagent  
**Firmware under study:** V12.0D.500 (J15). All protocol claims may differ on other firmware.

---

## Source Inventory & Staleness

| Repo | Author | Licence | Created | Last activity seen | Nature |
|------|--------|---------|---------|-------------------|--------|
| `brAzzi64/xbloom-ble` | brAzzi64 | MIT | 2026-04-14 | ~2026-04 (no CHANGELOG) | Canonical HCI-capture + APK decompile. Single author. Python scripts only. |
| `Janczykkkko/xbloom-ble` | Janczykkkko (Claude Code) | MIT | 2026-06-30 | 2026-07-11 (v2.3.0) | Full Python package on PyPI. Not a fork — independent re-implementation building on brAzzi64. Actively maintained. |
| `Alshekhi/xbloom-studio` | Alshekhi | MIT | ~2026-05 | ~2026-08 (most recent) | Home Assistant integration. Most active repo. Imports cloud API. Has a live-session (held BLE) model. |
| `saya6k/hacs-xbloom` | saya6k | MIT | 2026-06-15 | 2026-07-02 (v1.3.2) | HA integration. Contains the most detailed tea brew sequence and ratio-byte ceil fix. |
| `HomoLand/xbloom-studio-brew` | HomoLand | MIT | ~2026-06 | ~2026-07 | AI-skill BLE runtime. TypeScript/Python hybrid. Most complete command table; adds pour-radius/vibration-amplitude tuning, tea mode, FreeSolo brewer/grinder standalone commands. |

**Protocol is a moving target.** Sources disagree on several command semantics (see §Contradictions). No source claims to have tested more than one unit or more than one firmware revision (V12.0D.500).

---

## A. BLE Capability Inventory

### GATT Structure

**Custom Service UUID:** `0000E0FF-3C17-D293-8E48-14FE2E4DA212` `spec`

| Characteristic | Properties | Role |
|----------------|-----------|------|
| `FFE1` | Write w/o Response, Write | Command channel (app → device) |
| `FFE2` | Notify | Notifications (device → app) |
| `FFE3` | Read, Write w/o Response, Write, Notify | Aux / multi-purpose |

**Write method:** Must use Write Without Response (ATT opcode 0x52 / `response=False` in bleak). Write With Response is rejected with CBATTErrorDomain Code=14. `spec`

**Discovery:** Machine advertises name starting with `XBLOOM` (e.g. `XBLOOM ABC123`) and/or the service UUID above. `spec`

---

### Packet Format

#### Type 1 — `buildCommandString` (func code `0x01`) `spec`
```
58 01 01  [cmd_lo cmd_hi]  [len_b0 len_b1 len_b2 len_b3]  01  [N×4-byte LE ints]  [crc_lo crc_hi]
```

#### Type 2 — `buildCommandString2` (func code `0x02`) `spec`
```
58 01 02  [cmd_lo cmd_hi]  [len_b0 len_b1 len_b2 len_b3]  01  [hex_data bytes]  [crc_lo crc_hi]
```

**Length field:** total frame bytes including header and CRC. `spec`  
**CRC16:** CRC-16/KERMIT (polynomial 0x1021, init 0, reflected input+output, no final XOR). `spec`

> ⚠️ **CONTRADICTION C1 — CRC polynomial description:** brAzzi64 PROTOCOL.md describes the polynomial as `0x8408 (reversed CCITT 0x1021)`, which is mathematically identical to CRC-16/KERMIT. Janczykkkko and HomoLand both call it CRC-16/KERMIT with poly `0x1021`. These are the same algorithm expressed differently; the computed bytes are identical. `corroborated`

> ⚠️ **CONTRADICTION C2 — Frame byte layout:** brAzzi64 describes the length field as 4-byte LE at offset 5, the sub-type constant as `0x01` at offset 9. Janczykkkko's `protocol.py` and HomoLand's `protocol.py` both describe bytes [3..4] as a single LE u16 command, [5..6] as LE u16 length, bytes [7..8] as `0x00 0x00`, then `0x01` payload marker. The raw packet bytes in all sources match, but the semantic interpretation differs: brAzzi64 sees a 2-byte command + 4-byte length, Janczykkkko/HomoLand see a 2-byte command + **2-byte** length + 2 zero bytes. The total length byte count and values are consistent; this is a documentation split, not a wire difference. `inferred`

#### Notification Format (Device → App, FFE2) `spec`
```
58 02 07  [type_byte]  [sub_byte]  [len_u32le]  0xC1  [payload]  [crc_lo crc_hi]
```
- `0xC1` marker precedes the payload.
- STATUS frames have `type_byte = 0x57`; the byte immediately after `0xC1` is the machine state.
- ACK frames have `type_byte` equal to the command byte that was acknowledged.
- Scale weight streams have `type_byte = 0x4B` (water, in **milligrams** as float32 LE → divide by 1000 for grams) or `type_byte = 0x15` (coffee/cup weight, already in grams as float32 LE). `corroborated`

---

### Complete Command Code Table

`spec` = documented in brAzzi64 PROTOCOL.md  
`corroborated` = two or more independent sources agree  
`single-source` = one source only  
`inferred` = deduced from code/context

#### Commands Sent App → Device

| Code | Hex | Name | Type | Payload | Notes | Confidence |
|------|-----|------|------|---------|-------|------------|
| 8100 | 0x1FA4 | **Session Handshake** | T1 | `[185, 1]` (ints) | Must be sent within ~200ms of connect. Machine ignores all subsequent commands without it. | `spec` |
| 8022 | 0x1F56 | **Back to Home** | T1 | (none) | App sends this on initial connect and after cancel. | `spec` |
| 8102 | 0x1FA6 | **Bypass + Dose** | T1 | `[bypass_vol_floatbits, bypass_temp×10_floatbits, dose_int]` | Sends dose even when bypass disabled (bypass args = 0). Machine needs dose to grind correctly. Skipping causes drift. | `spec` |
| 8104 | 0x1FA8 | **Set Cup** | T1 | `[max_floatbits, min_floatbits]` | Cup weight range. Coffee uses (110.0, 90.0) per HomoLand; brAzzi64 observed (200.0, 80.0) from cloud API; saya6k uses (80.0–90.0, 40.0). See CONTRADICTION C3. | `corroborated` |
| 8001 | 0x1F41 | **Recipe Send (with grind)** | T1h | recipe blob | Pours frame opcode when grinder IS used. | `corroborated` |
| 8004 | 0x1F44 | **Recipe Send (no grind)** | T1h | recipe blob | Pours frame opcode when grinder OFF. Distinct from 8001. | `corroborated` |
| 8002 | 0x1F42 | **Execute / Commit** | T1 | `[1]` | Arms → awaiting-confirm. Byte-exact: `580101421F0C000000017FCF`. | `spec` |
| 40518 | 0x9E46 | **Start / Confirm** | T1 | `[1]` | Seq=0x9E. Sends after commit if machine stalls in awaiting-confirm. See CONTRADICTION C4. | `corroborated` |
| 40519 | 0x9E47 | **Cancel** | T1 | `[1]` | Seq=0x9E. Abort committed/running brew. | `corroborated` |
| 40524 | 0x9E48 | **Coffee Resume** | T1 | `[1]` | Resume after pause. | `single-source` (HomoLand) |
| 40518 | 0x9E46 | **Coffee Pause** | — | — | Same code as Start — context-dependent. See CONTRADICTION C4. | `single-source` (HomoLand) |
| 8019 | 0x1F53 | **Brewer Pause** | T1 | (none) | Pause brew. | `spec` |
| 8021 | 0x1F55 | **Brewer Resume** | T1 | (none) | Resume brew. | `spec` |
| 8013 | 0x1F4D | **Brewer Quit** | T1 | (none) | Quit brewer. | `spec` |
| 8017 | 0x1F51 | **Recipe Start Quit** | T1 | (none) | Exit pre-start recipe screen. | `spec` |
| 8007 | 0x1F47 | **Brewer Enter** | T1 | `[pattern_byte, temp×10_floatbits]` | Navigate to FreeSolo brewer screen. | `single-source` (HomoLand) |
| 4506 | 0x119A | **Brewer Start** | T1 | `[flow×10_floatbits, vol×10_floatbits, temp×10_floatbits, water_feed, pattern]` | FreeSolo water dispense. | `single-source` (HomoLand) |
| 4507 | 0x119B | **Brewer Stop** | T1 | (none) | Stop FreeSolo dispense. | `spec` |
| 8016 | 0x1F50 | **Brewer Set Pattern** | T1 | `[pattern_byte]` | Change pattern mid-brew (live slider). | `single-source` (Alshekhi) |
| 4510 | 0x119E | **Brewer Set Temperature** | T1 | `[temp_c × 10]` | Change temp mid-pour (plain int × 10, not float bits). | `single-source` (Alshekhi) |
| 3500 | 0x0DAC | **Grinder Start** | T1 | `[1000, grind_size, speed]` | The leading 1000 is a constant from GrinderActivity. | `spec` |
| 3505 | 0x0DB1 | **Grinder Stop** | T1 | (none) | Stop grinding. | `spec` |
| 8006 | 0x1F46 | **Grinder Enter** | T1 | `[grind_size, speed]` | Navigate to grinder screen. | `spec` |
| 8012 | 0x1F4C | **Grinder Quit** | T1 | (none) | Exit grinder mode. | `single-source` (HomoLand) |
| 8018 | 0x1F52 | **Grinder Pause** | T1 | (none) | Pause grinder. | `spec` |
| 8020 | 0x1F54 | **Grinder Resume** | T1 | (none) | Resume grinder after pause. | `spec` |
| 8003 | 0x1F43 | **Scale Enter** | T1 | (none) | Navigate to scale screen (HomeActivity.onClickOperator3). | `single-source` (saya6k) |
| 8014 | 0x1F4E | **Scale Exit** | T1 | (none) | Leave scale screen (ScaleActivity.onBackPressed). | `spec` |
| 8500 | 0x2134 | **Scale Tare** | T1 | (none) | Zero the scale instantly. Confirmed on hardware. | `spec` |
| 8005 | 0x1F45 | **Weight Unit** | T1 | `[0=g, 1=oz, 2=ml]` | See CONTRADICTION C5 for unit ordering. | `spec` |
| 8010 | 0x1F4A | **Temperature Unit** | T1 | `[0=°C, 1=°F]` | See CONTRADICTION C6 for unit ordering. | `spec` |
| 4508 | 0x119C | **Water Source** | T1 | `[0=tank, 1=tap]` | | `spec` |
| 8103 | 0x1FA7 | **LED/Display Brightness** | T1 | `[1=low, 8=medium, 15=high]` | | `single-source` (HomoLand) |
| 11510 | 0x2CF6 | **Easy Recipe Send** | T2 | `[slot_index, flags, recipe_blob]` | Slot=0/1/2 (A/B/C). All 3 must be written in one batch. | `corroborated` |
| 11511 | 0x2CF7 | **Mode Switch** | T2 | `"00000000"=PRO` / `"91327856"=EASY` | Byte-exact confirmed on hardware. | `spec` |
| 11512 | 0x2CF8 | **Recipe Order** | T2 | hex payload | Confirmed real in APK decompile (BleCodeFactory.easyModeRecipesOrder). | `corroborated` |
| 40525 | 0x9E4D | **Send Recipe Count** | T1 | `[count]` | Sends count of recipes being synced. | `spec` |
| 11506 | 0x2CF2 | **Read Pour Radius** | T2 | (none) | Read current mechanical pour radius. | `single-source` (HomoLand) |
| 11507 | 0x2CF3 | **Write Pour Radius** | T2 | `[value]` | Range 400–1000, step 80. Mechanical calibration. | `single-source` (HomoLand) |
| 11508 | 0x2CF4 | **Read Vibration Amplitude** | T2 | (none) | Read current vibration amplitude setting. | `single-source` (HomoLand) |
| 11509 | 0x2CF5 | **Write Vibration Amplitude** | T2 | `[value]` | Range 1000–1500, step 100. Mechanical calibration. | `single-source` (HomoLand) |
| 4512 | 0x11A0 | **Tea Recipe Make (Execute)** | T1 | (none) | Execute previously uploaded tea recipe. | `spec` |
| 4513 | 0x11A1 | **Tea Recipe Code (Upload)** | T1 | tea blob | Upload tea recipe blob (same chunked format, different pause encoding). | `spec` |
| 8111 | 0x1FAF | **Easy Mode Begin** | T1 | (none) | Initiate Auto Mode recipe display. | `spec` |
| 40526 | 0x9E4E | **CurrentGrinder / Back to Normal** | T1 | (none) | Return from grinder to normal state. | `spec` |

---

#### Notifications (Device → App, FFE2)

| Code | Hex | Name | Data | Notes | Confidence |
|------|-----|------|------|-------|------------|
| 8100 | 0x1FA4 | Handshake ACK | — | Confirms handshake received | `spec` |
| 40521 | 0x9E49 | Machine Info | 61-byte blob | Serial, model, firmware, water level, mode, grinder size, LED, voltage, temp unit, weight unit, water source. See field map below. | `spec` |
| 0x57 frame | — | Status Frame | state byte after 0xC1 | See state table below | `corroborated` |
| 0x4B frame | — | Water Weight | float32 LE (milligrams) | Brew-record water stream, ~10×/s. Divide by 1000 for grams. | `corroborated` |
| 0x15 frame | — | Coffee/Cup Weight | float32 LE (grams) | Brew-record cup weight stream, ~10×/s. | `corroborated` |
| 20501 | 0x5015 | Scale Weight (alt) | float32 LE | brAzzi64 notation for the weight stream. See CONTRADICTION C7. | `spec` |
| 10507 | 0x290B | Scale Weight (alt-2) | float32 LE | Second alternative notation observed in some captures. | `single-source` (brAzzi64) |
| 40523 | 0x9E4B | Water Volume | float32 LE | Tank water volume, ~100ms interval. | `spec` |
| 8023 | 0x1F57 | Machine Activity | LE uint32 | Activity states: 1=Pro idle, 65=Easy idle, 34=brewing, 36=brew done, 16=grinding complete. | `corroborated` |
| 8011 | 0x1F4B | Machine Awake | — | Machine is not sleeping | `spec` |
| 8009 | 0x1F49 | Machine Sleeping | — | Machine entered sleep | `spec` |
| 11511 | 0x2CF7 | Mode Switch ACK | mode code | Status C2 = ACK | `spec` |
| 11510 | 0x2CF6 | Easy Recipe Send ACK | — | One per slot write | `spec` |
| 11512 | 0x2CF8 | Recipe Order ACK | — | | `spec` |
| 40502 | 0x9E26 | Coffee Starting / Grinder Start | — | Machine-side grinding begin | `spec` |
| 40506 | 0x9E2A | Brewer Start | — | Water heater spinning up; fires ~3s after grind start (before pours) | `single-source` (Alshekhi) |
| 40507 | 0x9E2B | Grinder Stop | — | Grinder finished | `spec` |
| 40510 | 0x9E2E | Bloom/Pour Start | pour_index | One per pour | `spec` |
| 40511 | 0x9E2F | Brewer Stop | — | Brew complete | `spec` |
| 40512 | 0x9E30 | Enjoy! | — | Final "coffee ready" notification | `spec` |
| 40513 | 0x9E31 | Enjoy (2) | — | Second enjoy notification | `spec` |
| 40515 | 0x9E33 | Pour Volume ACK | — | May be firmware-version dependent | `single-source` (brAzzi64) |
| 40516 | 0x9E34 | Pour Transition | — | May be firmware-version dependent | `single-source` (brAzzi64) |
| 40517 | 0x9E35 | Error: Idling | — | | `spec` |
| 40520 | 0x9E38 | RD_Bypass | — | Bypass/dilution pour event | `single-source` (Alshekhi) |
| 40522 | 0x9E3A | Error: No Water | — | Tank empty | `spec` |
| 8203 | 0x200B | Error: Gear Position | — | Grinder gear error | `spec` |
| 8204 | 0x200C | Error: Dose/Water | — | Dose or water mismatch | `spec` |
| 8107 | 0x1F6B | Brewer Mode | — | | `spec` |
| 8108 | 0x1F6C | Brewer Temp | — | | `spec` |
| 8105 | 0x1F69 | Grinder Size | — | | `spec` |
| 8106 | 0x1F6A | Grinder Speed | — | | `spec` |
| 9000 | 0x2328 | In Grinder | — | User navigated to grinder | `spec` |
| 9001 | 0x2329 | In Brewer | — | | `spec` |
| 9002 | 0x232A | In Scale | — | Object placed on scale | `spec` |
| 9003 | 0x232B | Grinder Begin | — | | `spec` |
| 9004 | 0x232C | Grinder Out | — | | `spec` |
| 9005 | 0x232D | Brewer Begin | — | | `spec` |
| 9006 | 0x232E | Brewer Out | — | | `spec` |
| 9008 | 0x2330 | Scale Out | — | Object removed from scale | `spec` |
| 9009 | 0x2331 | Grinder Paused | — | | `spec` |
| 9010 | 0x2332 | Brewer Paused | — | | `spec` |
| 40505 | 0x9E29 | Gear Report | — | Gear position report during grind | `spec` |

---

#### Machine State Byte (inside 0x57 notification frame)

| Byte | State Name | Meaning |
|------|-----------|---------|
| 0x01 | idle | Pro-mode home / ready |
| 0x02 | scale/grinder busy? | Observed after 8006 (grinder enter). Undocumented. `observed 2026-09-01, V12.0D.500` |
| 0x03 | brewer busy? | Observed after event 9001. Undocumented. `observed 2026-09-01, V12.0D.500` |
| 0x04, 0x05 | scale sub-states | Observed cycling around scale enter/tare/exit. Undocumented. `observed 2026-09-01, V12.0D.500` |
| 0x0C | no_water | No water (checked after commit) |
| 0x0F | no_beans | Waiting for beans |
| 0x10 | brewing | Live pour in progress |
| 0x1D | loading | Recipe being received |
| 0x1F | armed | Recipe loaded, awaiting approval |
| 0x1E | awaiting_confirm | Waiting for human confirm on device |
| 0x22 | starting | Post-confirm: grinding/spinning up |
| 0x23 | brewing (sub) | Mid-pour sub-state | 
| 0x24 | ready | Brew DONE — coffee ready beep (cup still on scale; machine waits for cup removal before → idle) |
| 0x3B | brewing | Brew in progress (alt firmware) |
| 0x41 | complete (Easy idle) | Brew complete OR Auto/Easy-mode home |
| 0x43 | saving_slots | Easy-Mode slot batch being stored |
| 0x25 | slots_saved | Slots stored OK (then → idle) |

`corroborated` for core states (0x01, 0x1F, 0x1E, 0x22, 0x24); `single-source` (Janczykkkko) for 0x23, 0x24 distinction.

> **Observed on hardware 2026-09-01 (V12.0D.500):** commit (`8002`) **auto-proceeds**. The machine went from commit straight to grinding, in both EASY and PRO, without ever passing through `0x1E`. `0x1E` is corroborated by three sources, so it is kept as a fallback path — but on this unit it is not the normal route.

> **Observed on hardware 2026-09-01:** a single BLE notification may carry **more than one frame**, back to back. Captured verbatim: `58 02 07 FE 2C 10 00 00 00 C1 91 32 78 56 67 74` immediately followed by `58 02 07 4B 9E 10 00 00 00 C1 00 00 00 00 FD 32` — event 11518 and a water-volume reading in one packet. The length field at offset 5 is the **total frame length**, so a reader must walk the packet by it rather than parsing the first frame and discarding the tail.

> **Observed on hardware 2026-09-01:** every command is acknowledged by an **event notification carrying the same code** — `→ 8003` is answered by `← event 8003`, likewise 8500, 8014, 8006, 8012. XBRW++ does not exploit this yet; it would turn a blind acknowledgement timeout into a precise "frame N never arrived".

> **Contradiction, unresolved:** the EASY-mode token appears in notification 11518 as the raw bytes `91 32 78 56`, not as the ASCII `"91327856"` (`39 31 33 32 37 38 35 36`) that command 11511's payload is documented as taking, "byte-exact, confirmed on hardware". These are a notification and a command respectively, so they need not agree — but nobody has tested the raw-byte form of 11511.

> ⚠️ The machine grinds SILENTLY after commit — it emits NO 0x57 status frames for ~20s during grinding before reporting 0x10. A client must not treat this gap as a stall. `single-source` (Janczykkkko, observed on hardware)

---

#### Machine Info Blob (cmd 40521, 61 bytes payload) `spec`

| Offset | Field | Decode |
|--------|-------|--------|
| 0–12 | serialNumber | ASCII |
| 13–18 | theModel | ASCII (0xFF = blank) |
| 19–28 | theVersion | ASCII firmware string |
| 29–32 | areaAp | LE float |
| 33 | waterEnough | uint8 (0=low, 1=ok) |
| 34 | systemStatus | uint8 |
| 35 | userCount | uint8 |
| 36 | waterFeed | uint8 (0=tank, 1=tap) |
| 37 | grinder (raw) | uint8 − 30, min 1 |
| 38 | ledType | uint8 |
| 39 | voltage | uint8 |
| 40 | tempUnit | uint8 (0=°C, 1=°F) |
| 41 | weightUnit | uint8 (0=g, 1=oz) |
| 51–54 | modeType | hex match vs `91327856` → EASY else PRO |
| 55–58 | pouringRadius | LE uint32 |
| 59–62 | vibrationInit | LE uint32 |

---

### Recipe Blob Format

Used by commands 8001 (grind) / 8004 (no-grind) and by Easy Mode slot saves.

```
[length_byte] [pour_segments...] [grinder_byte] [ratio_byte]
```

**Pour segment (normal, ≤ 127ml):** `[volume, temp_c, pattern, vibration, neg_post_wait, 0x00, rpm, flow×10]` (8 bytes)  
**Pour segment lead chunk (> 127ml):** `[127, temp_c, pattern, vibration]` (4 bytes, repeating until remainder fits in 8-byte trailing segment)  
**RPM byte:** Only non-zero in the FIRST pour's 8-byte segment; subsequent pours get 0. `corroborated`  
**Grinder byte:** 0 = no-grind → encoded as `0xFE` on wire (NOT `0x00`; `0x00` means grind at finest setting). `corroborated`  
**Ratio byte:** `round(total_water_ml / dose_g * 10)`. Range 1–255. See CONTRADICTION C8 for critical details.

**Pattern codes:** `0=center, 1=ring/circular, 2=spiral` `corroborated`  
**Vibration/agitation codes:** `0=none, 1=before, 2=after, 3=both` — this is an independent field from pattern. `corroborated` (HomoLand, Janczykkkko)

**Cup type** (xPod/xDripper/Omni/Other/Tea) is NOT encoded in the recipe blob. It affects the dose range UI only. `spec`

---

## B. Contradictions

### C1 — CRC Polynomial Description `inferred`
brAzzi64 describes CRC as poly `0x8408` (reversed CCITT). Others call it CRC-16/KERMIT with poly `0x1021`. These are the same algorithm; the computed outputs are identical. No real disagreement, only notation difference.

### C2 — Frame Length Field Width `inferred`
brAzzi64: 4-byte LE length at offset 5. Janczykkkko/HomoLand: 2-byte LE length at offset 5 + 2 zero bytes. The raw wire bytes are consistent across all sources; this is a documentation interpretation difference. Effect: zero.

### C3 — Command 8104 (Set Cup) Values `corroborated conflict`
- **brAzzi64:** Values come from xBloom cloud API per cup type. Observed from HCI: `(200.0, 80.0)` for cup types without HCI capture, `(110.0, 90.0)` for xDripper, `(200.0, 80.0)` for "other".
- **HomoLand:** Calls the field `COFFEE_CUP_GEOMETRY_COMPAT` with constant `(110.0, 90.0)` for ALL coffee recipes, explicitly stating "do not change without a controlled hardware A/B." The comment notes "APK 2.2.2 calls this APP_SET_CUP and treats both floats as cup geometry."
- **saya6k brewing.py:** Uses `(80.0–90.0, 40.0)` for coffee brews (grind), `(80.0–90.0, 0.0)` for no-grind.
- **Assessment:** The three implementations send materially different values. The machine reportedly brews correctly regardless (brAzzi64). The field's exact semantics — cup geometry, weight range, or something else — remain unverified. **Do not trust any single value set blindly.**
- **XBRW++ (M3, 2026-09-01):** ~~omits 8104 entirely~~ — **reversed, same day, after hardware testing.** The original reasoning misread the evidence: the sources disagree about the *values*, not about whether the command is sent. All three send it, and `xbloom.py`'s `run_brew` — the only brew sequence we have that is known to work on hardware — sends it between the dose and the recipe. XBRW++ now sends `(200.0, 80.0)`, the reference's default and HCI-confirmed for Free Solo, which is also the widest range and so the conservative choice for a field that appears to govern overflow protection.

### C4 — Command 40518 (0x9E46): Start vs Pause `single-source conflict`
- **brAzzi64 / Janczykkkko:** Treat this as the post-commit "start" frame (`build_start()`), sent ONLY when the machine stalls in awaiting-confirm. Janczykkkko warns: "sending it into a running brew aborts it back to armed — verified on hardware."
- **saya6k brewing.py (comment):** "Third-party notes (HomoLand/Janczykkkko) claim 40518 acts as 'start' from awaiting-confirm on their unit; tried live on this machine 2026-07-19 and it bounced the state back to `recipe_loaded` instead of starting." saya6k therefore does NOT send 40518 at all and instead waits for the machine to auto-start or prompts the user.
- **HomoLand protocol.py:** Names 40518 as `CMD_COFFEE_PAUSE` but also documents it as `START_OPCODE = 0x46`.
- **Assessment: HIGH-RISK CONTRADICTION.** The same command code may behave differently across units/firmware. On one machine it starts the brew; on another it sends the brew back to armed. **Do not send 40518 unconditionally after commit.** Safe strategy: observe state, send only if machine is in awaiting_confirm AND has been confirmed stable there for several seconds.
- **XBRW++ (M3, 2026-09-01):** the brew path never sends 40518 under any condition. When the machine parks in awaiting-confirm the app asks the user to press the button on the machine, which is a thing they are standing next to anyway. A regression test asserts the frame is absent and has been red-green verified against the guard. The command remains reachable from the machine console behind a confirmation that shows this disagreement verbatim — deliberately, because settling it needs somebody to send it on purpose and watch.

### C5 — Command 8005 (Weight Unit) Payload Values
- **brAzzi64 PROTOCOL.md:** `0=g, 1=oz, 2=ml`
- **HomoLand protocol.py `build_set_weight_unit`:** `ml=0, g=1, oz=2`
- **Assessment:** Direct conflict. These cannot both be correct. No hardware verification to resolve it. **Flag as unverified before implementing.** `single-source conflict`

### C6 — Command 8010 (Temperature Unit) Payload Values
- **brAzzi64 PROTOCOL.md:** `0=°C, 1=°F`
- **HomoLand protocol.py `build_set_temperature_unit`:** `F=0, C=1`
- **Assessment:** Direct conflict. Same note as C5. `single-source conflict`

### C7 — Scale Weight Notification Code
- **brAzzi64:** Uses command code `20501` (0x5015) and `10507` (0x290B) as scale weight notification identifiers.
- **Janczykkkko/HomoLand:** Use `TYPE` byte `0x4B` (water in milligrams) and `0x15` (coffee/cup weight in grams) as the notification type identifiers. These are the byte at offset 3 of the notification frame, not a command code in the same sense.
- **Assessment:** Different layers of abstraction, not an actual wire conflict. The brAzzi64 `CMD_NAMES` table and the Janczykkkko telemetry module are consistent when you align on the frame structure. The water weight is in milligrams (÷1000 for grams); brAzzi64 decodes it differently (directly as float). `inferred`

### C8 — Recipe Tail Byte (Ratio byte) Encoding — CRITICAL `corroborated`
**This was a known bug in brAzzi64's original script, since corrected.** The tail byte is `round(total_water / dose * 10)` (ratio × 10), **NOT** `total_water / 10`.

saya6k adds a further refinement: use **ceiling** not truncation/rounding:
> "18g/250ml truncated to 138 (18×13.8 = 248.4 < 250) and never ground; the same recipe with 139 (250.2) or 140 (252) grinds… A small overshoot is tolerated while any undershoot is fatal."

Janczykkkko uses `round(total/dose*10)`. saya6k uses `math.ceil(ratio * 10)`, clamped to 255.

**Assessment:** Use `min(math.ceil(total_water_ml / dose_g * 10), 255)` to be safe. Truncation can silently cause the machine to skip grinding with no error.

### C9 — No-Grind Wire Byte
**brAzzi64 original:** Sent `grinder_byte = 0` for no-grind recipes.  
**All later sources (Janczykkkko, HomoLand):** Send `0xFE` for no-grind. `0x00` grinds at the finest setting.  
**Assessment:** `0xFE` is the correct value, confirmed by HCI capture of the app's grinder-OFF slot save. `corroborated`

### C10 — Commit + Start Sequencing `corroborated conflict`
- **brAzzi64 / Janczykkkko / HomoLand (theory):** Send 8002 (commit), then observe; send 40518 (start) only if machine stalls.
- **saya6k (observed on hardware 2026-07-19):** Sends 8002, waits for state transition — auto-proceed works. Sending 40518 bounced state backward. Does NOT send 40518.
- **Assessment:** The machine's behavior after commit is firmware/unit dependent. Implement an observe-then-decide strategy. Do not hardcode a 40518 send.

### C11 — Tea Pause Byte Encoding `RESOLVED on hardware`
- **HomoLand (tea.py):** Pause bytes split as `((-remainder)&0xFF, (minutes*32)&0xFF)`.
- **saya6k (brewing.py):** Uses a soak byte in position [1] (positive, scaled by 0.6 = firmware runs it at ~1.67×). Byte [0] = 0 (no inter-pour wait). States the 0.6 scale is "approximate."
- **Assessment:** Fundamentally different encodings. Neither is hardware-confirmed for multi-steep tea. Tea protocol is the least-verified area.
- **XBRW++ (M3, 2026-09-01):** ships **both**, selected by the `teaSteepEncoding` setting. HomoLand's is the default on provenance; saya6k's own note calls its 0.6 scale "approximate". The console offers the switch. One stopwatched sixty-second steep on real hardware settles this, and the wrong choice produces no error at all — the tea simply steeps for the wrong length, which is why the app could not just pick one and hope.
- **Hardware verdict (2026-09-01, J15 firmware V12.0D.500):** the stopwatch was run. Tea brewed with the default `homoland` encoding and the steep timer was correct. HomoLand's encoding is confirmed; saya6k's remains available behind the setting but is no longer the one to reach for. This was the last open M3 acceptance criterion.

---

## C. Notifications / Telemetry

The machine pushes the following data unprompted on FFE2:

| Stream | Frequency | Format | Notes |
|--------|-----------|--------|-------|
| Water weight | ~10×/s | float32 LE, milligrams (÷1000 for g) | Frame type 0x4B. Streams during brew AND at idle (reads ~0 when idle/untared). |
| Coffee/cup weight | ~10×/s | float32 LE, grams | Frame type 0x15. Same timing. |
| Machine status | Event-driven | State byte after 0xC1 in 0x57 frame | State transitions: idle, loading, armed, awaiting_confirm, starting, brewing, complete, etc. |
| Machine activity | Periodic + on-event | LE uint32 in 8023 notification | 1=Pro idle, 65=Easy idle, 34=brewing active, 36=brew done. |
| Machine info | **On request only** (see note) | 61-byte blob in 40521 notification | Contains all persistent machine settings: firmware ver, grinder size, water level, temp unit, weight unit, water source, mode, LED brightness, pour radius, vibration amplitude. |
| Water volume | ~100ms | float32 LE in 40523 notification | Tank water level. |

> **The machine offers a third characteristic, `ffe3`.** Read off hardware
> (2026-09-01, V12.0D.500) with the console's radio dump: the service carries
> `ffe1 Write,WriteWithoutResponse`, `ffe2 Notify`, and
> `ffe3 WriteWithoutResponse,Notify,Write,Read`. No source mentions `ffe3`.
> XBRW++ subscribed only to `ffe2` until this was found, so anything the
> machine sends on `ffe3` was invisible to the app and indistinguishable from
> something it never sends at all. What travels on it is still unknown.

> **The info blob is not a heartbeat.** Sources describe 40521 as streaming
> periodically. On hardware (2026-09-01, V12.0D.500) it does not: a tank
> refilled after connect still read Low in XBRW++ until the app asked again.
> XBRW++ therefore sends 40521 before every brew and whenever the settings
> screen opens, rather than trusting the reading taken at connect.

| Pour events | Event-driven | 40510 per pour | pour_index in payload |
| Brew lifecycle | Event-driven | 40502, 40507, 40510, 40511, 40512, 40513 | Grinder start, stop, bloom, brewer stop, enjoy |
| Error events | Event-driven | 40517, 40522, 8203, 8204 | Idling error, no water, gear position, dose/water |
| Scale events | Event-driven | 9002 (In Scale), 9008 (Scale Out) | Object placed/removed |
| Grinder events | Event-driven | 9003, 40507, 40505 | Grinder begin, stop, gear report |
| Mode ACK | On command | 11511 notification | Status C2 confirms mode change |

**Key implication for XBRW++:** Live brew progress is fully available. The water and coffee weight streams at 10×/s are sufficient to show a real-time pour graph. The 40510 pour-index notification marks each pour boundary. The state machine (0x57 frames) provides structured lifecycle events. All of this is available without polling — the machine pushes it continuously.

**Scale accuracy note:** brAzzi64 observed a ~15–19g fixed thermal offset when weighing hot water. The machine scale is less accurate during hot brews; the gap is thermal (load cell heating), not proportional to volume. `spec`

**Firmware tare during bloom:** The firmware auto-tares the scale 2–3 times during the first ~4 seconds of a bloom pour (no-grind path). brAzzi64's `BrewWeightTracker` class handles this with a 10-second detection window and offset accumulation. `spec`

---

## D. Connection Lifecycle

### UUIDs `spec`
- Service: `0000E0FF-3C17-D293-8E48-14FE2E4DA212`
- Command (write): `0000FFE1-0000-1000-8000-00805F9B34FB`
- Status (notify): `0000FFE2-0000-1000-8000-00805F9B34FB`
- Aux: `0000FFE3-0000-1000-8000-00805F9B34FB`

### Post-Connect Handshake (Required) `spec`
1. Connect to device (by service UUID or name prefix `XBLOOM`).
2. Subscribe to FFE2 notifications.
3. Send handshake (command 8100) within ~200ms of connect:
   ```
   580101A41F1400000001B900000001000000BDD1
   ```
   = `build_packet_type1(8100, [185, 1])`
4. Machine display wakes, BLE indicator appears, status notifications begin.
5. **Not optional — inter-frame pacing is required.** `corroborated` (XBRW++, observed on hardware 2026-09-01) These are Write Without Response frames, so nothing flow-controls them. A single command lands reliably; a burst of five is dropped almost entirely, and the machine reports nothing at all — which a client sees only as a recipe that never reaches `loading`. `xbloom.py`'s `run_brew` sleeps **2.0 s after every packet**, including the handshake, and re-sends the handshake at the start of each brew. XBRW++ initially sent the brew sequence back-to-back and could not brew at all, while single console commands worked; spacing the frames is what the fix consisted of. Do not treat this as an optimisation to remove.
6. **Optional settle:** Janczykkkko recommends a ~2s settle after sending `a4` + `0x56` status query before sending recipe frames, to let the machine leave its post-connect transitional state. Without this settle, recipe loads may never reach the armed state. `single-source` (Janczykkkko, observed on hardware)

### Single-Client Limit `spec`
The machine allows **one BLE link at a time**. The official app holds the link when running; the third-party client must disconnect (or the official app must be closed and Bluetooth turned off on the phone) before connecting. No protocol-level indication of rejection — it simply fails to connect or ignores commands.

### Multiple Simultaneous Clients
**Not possible.** Single connection architecture. `spec`

### Keepalive
No periodic keepalive is needed. The machine maintains the connection without pings. The app sends none. `corroborated`

### Held Session Mode `single-source` (Janczykkkko, Alshekhi)
The `a4` session-start frame doubles as a held-session marker. Sending it on connect and keeping the FFE2 subscription active causes the machine to show its "connected" icon and stay warm between brews. This avoids the per-brew connect+handshake overhead. The Alshekhi integration uses a "connect-on-demand" model (BLE only during active brew) while Janczykkkko's TUI uses a persistent held session.

### Pairing/Bonding
Not required. All sources connect without bonding. `corroborated`

### Timeout/Reconnection
No explicit timeout documented. The machine will disconnect after an extended idle period (duration not measured). No reconnection protocol documented; reconnect by repeating the full connect + handshake sequence.

---

## E. Easy Mode Slots

### Slot Count: 3 (A, B, C) `corroborated`
The machine has exactly three on-board recipe slots. Confirmed across all sources. No source has discovered additional slots.

### Write-Only (No Read-Back) `corroborated`
The machine does NOT report the current slot contents over BLE. The only way to know what's in a slot is to track what was last written. Alshekhi and saya6k both store the last-written slot contents in HA's config entry because the machine cannot be queried.

### Slot Payload Format `corroborated`
Command 11510, Type 2 packet:
```
[slot_index (0–2)] [flags (1 byte)] [recipe_blob]
```
**Flags byte:**
- Bit 4 (0x10): Scale ON
- Bits 0–3: Grinder — `0x02`=ON, `0x04`=OFF
- Common values: `0x02`=scale-off+grind-on, `0x04`=scale-off+grind-off, `0x12`=scale-on+grind-on, `0x14`=scale-on+grind-off

Janczykkkko's implementation uses `SLOT_FLAG_SCALE_ON = 0x12`, `SLOT_FLAG_SCALE_OFF = 0x02` — note these both have grinder-ON in the lower nibble (0x02). `inferred` — may conflict with brAzzi64's `SLOT_GRINDER_OFF = 0x04`.

### Batch-Write Requirement `corroborated`
All three slots (A, B, C) MUST be written in a single batch. Writing only one or two leaves the machine hung at state `0x43` (saving_slots) and it displays RETRY. There is no "commit" frame — the machine saves atomically once all three 11510 frames have been received. Sequence:
1. Switch to PRO mode (11511, `"00000000"`) — slot writes are only accepted in PRO mode. In AUTO mode the machine sits at state `0x41` and rejects saves.
2. Send 11510 × 3 (slots A, B, C in order).
3. Machine ACKs each with a 11510 notification (status C2).
4. Machine progresses: state `0x43` (saving) → `0x25` (saved) → `0x01` (idle), confirmed by an `0xF8` notify.

### Sync Flow with 11512 `corroborated`
After the 3 slot writes, the app sends command 11512 (Recipe Order). APK decompile confirms this is a real command (`BleCodeFactory.easyModeRecipesOrder`). Its exact payload is documented but not always implemented.

---

## F. Capabilities Beyond Basic Brew

These exist in the protocol but a simple "brew a recipe" feature wouldn't need them:

### FreeSolo Brewer (Standalone Hot Water Dispense) `single-source` (HomoLand)
Commands 8007 (enter), 4506 (start), 4507 (stop), 8013 (quit), 8019 (pause), 8021 (resume), 8016 (set pattern live), 4510 (set temperature live).  
`build_brewer_start` takes volume (ml), temperature (°C), flow rate (ml/s), pattern, and water source. RT mode uses temperature = 20°C (sentinel). This is a standalone water dispenser, completely independent of the recipe system.

### FreeSolo Grinder (Standalone Grind) `spec`
Commands 8006 (enter), 3500 (start), 3505 (stop), 8012 (quit), 8018 (pause), 8020 (resume).  
`build_grinder_start` takes grind size (1–80) and RPM (60–120, 10-step). The machine grinds for as long as desired (no timer in the command; machine runs until stop command or manual intervention).

### Scale Mode `spec`
Commands 8003 (enter), 8014 (exit), 8500 (tare). Continuous weight stream on FFE2 (0x15/0x4B frames). Object presence events (9002 In Scale, 9008 Scale Out). Full standalone scale with tare.

### Machine Settings (Persistent) `corroborated`
- Weight unit (8005): g / oz / ml — values disputed (see C5)
- Temperature display unit (8010): °C / °F — values disputed (see C6)
- Water source (4508): tank / tap
- LED/Display brightness (8103): low(1) / medium(8) / high(15)

### Mechanical Calibration `single-source` (HomoLand)
- Pour radius (11506 read, 11507 write): 400–1000, step 80. The arm's sweep radius. Default baseline 560–840 per unit. Type 2 frames.
- Vibration amplitude (11508 read, 11509 write): 1000–1500, step 100. Type 2 frames.  
These are accessed via HomoLand as `ATTR_POUR_RADIUS_LEVEL` and `ATTR_VIBRATION_AMPLITUDE_LEVEL` in HA services.

### Firmware / Machine Info `spec`
Command 40521 notification: 61-byte blob with serial number, model, firmware version, and all persistent settings. Streams periodically while connected. No write equivalent documented.

### Grinder Calibration Sweep `single-source` (saya6k)
Referenced in the LLM prompt as `calibrate_xbloom_grinder` — "runs the grinder's gear-position calibration sweep (~2 minutes, runs on its own)." The BLE command backing this is not fully documented in any source; it may relate to the gear report command 40505 or a separate undocumented command.

### Tea Mode `corroborated`
Commands 4513 (upload tea recipe blob) + 4512 (execute). Tea blob uses the same chunked pour encoding but with a different pause byte scheme and a soak-byte in the timing block position [1] (which is 0x00 for coffee). The machine has a dedicated Omni Tea Brewer mode with siphon/drain cycles. Parameters: leaf weight 3–5g, 1–4 steeps, 40–100ml per steep, 70–99°C. See CONTRADICTION C11 for unresolved tea pause encoding dispute.

### Bypass Pour `spec`
Command 8102 carries a bypass volume and temperature (floats). When bypass is enabled, the machine dispenses a separate volume of water at a specified temperature alongside the main recipe (used for dilution/bypass brewing like Aeropress). Sending 0,0 for bypass args disables it while still communicating the dose weight.

### Cloud Recipe Sync `corroborated` (Janczykkkko, Alshekhi, saya6k)
The xBloom app has an unofficial cloud REST API at `https://...xbloom.com`. Janczykkkko's package and both HA integrations can authenticate (email + password, with RSA-encrypted credential exchange) and sync/create/delete recipes in the user's cloud account. This is not BLE — it's HTTPS. The community recipe hub (`collective.xbloom.com`) is a separate, unauthenticated API for browsing public recipes. **These APIs are unofficial and undocumented by xBloom; they could change or be locked without notice.**

---

## G. Implementation Technique Flags (Attribution / Permission)

The following non-obvious implementation approaches are distinctive enough that XBRW++ would want to note attribution if reusing the specific technique (vs. independently arriving at the same conclusion):

1. **`BrewWeightTracker` (tare compensation)** — `brAzzi64/xbloom-ble:python/xbloom.py`. The specific 10-second window + offset-accumulation approach for compensating firmware-triggered auto-tares during bloom is a non-obvious choice. The technique (detect drop > 1g, accumulate offset, monotonic clamp) is specific enough to merit acknowledgment if adopted verbatim.

2. **Batch-of-three slot requirement discovery** — `Janczykkkko/xbloom-ble:xbloom_ble/client.py` / `xbloom_ble/protocol.py`. The `save_slots()` method and the comment explaining WHY (machine hangs at 0x43 if fewer than 3 slots written) represents original testing. The knowledge is now documented in multiple sources, but Janczykkkko appears to have been the first to document the batch requirement clearly in code.

3. **Ratio byte ceil (not round) fix** — `saya6k/hacs-xbloom:custom_components/xbloom/brewing.py`. The discovery that truncation/rounding can cause silent grind-skip and that ceiling is required is a hardware-verified finding by saya6k. The comment is very specific with the root-cause example. Worth acknowledging if used.

4. **`_tea_pause_bytes` split encoding** — `HomoLand/xbloom-studio-brew:packages/core/xbloom_ble/protocol.py`. The specific `divmod(seconds, 60)` → `((-remainder)&0xFF, (minutes*32)&0xFF)` derivation claims to be a port of the official Android app's `TeaRecipeCreate` native pause transform. If correct, this is the authoritative encoding.

5. **0.6 soak-time scaling for tea** — `saya6k/hacs-xbloom:brewing.py`. The empirical `soak_byte = max(1, min(round(pour.pausing * 0.6), 255))` constant was derived from two stopwatch measurements. It is an approximation and self-described as such. Do not adopt as authoritative.

---

## H. Gaps, Uncertainties, and Suggested Follow-Up

1. **C4/C10 (40518 behavior)** is the most operationally dangerous gap. The command may start or un-start a brew depending on machine state and firmware. Hardware testing on the target device before shipping is mandatory.

2. **C5/C6 (unit command payload values)** are a direct conflict with no hardware resolution. A simple test (send each value, observe machine display) would resolve in under a minute.

3. **C3 (8104 Set Cup values)** — the field's semantics are unknown. The machine brews without it (tested by brAzzi64). XBRW++ could safely omit this command initially and add it once semantics are understood.

4. **Tea protocol** was the least verified area overall. C11 (pause encoding) is now resolved in HomoLand's favour by a stopwatched steep on hardware (2026-09-01, V12.0D.500). Multi-steep tea beyond a single steep is still unverified.

5. **FFE3 (aux characteristic)** — no source documents what this is used for. All implementations ignore it.

6. **Firmware versions** — all testing is against V12.0D.500. Protocol may differ on other versions. No cross-firmware comparison exists.

7. **Slot read-back** — confirmed impossible over BLE. Apps must track slot state locally.

8. **8102 bypass semantics** — the exact meaning of `bypass_temp * 10` (is it temp in tenths of a degree, or temp × 10 in Celsius?) and how the machine uses bypass volume are not documented beyond the packet format.

9. **Scale Enter (8003)** — confirmed from APK decompile by saya6k (2026-07-19), not yet confirmed by hardware test in any documented session.

10. **Grinder calibration command** — referenced in saya6k's LLM prompt but the underlying BLE command is not documented.

11. **Pour radius / vibration amplitude reads** — the notify response format for commands 11506 and 11508 (read requests) is not documented by HomoLand. `inferred` that the machine returns a value in a notification but the notification format is unknown.
