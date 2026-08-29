# BLE recipe blob vs. `Recipe.getData()` — overlap analysis

**Date:** 2026-08-29
**Method:** desk comparison. No hardware verification.
**Sources:** `brAzzi64/xbloom-ble` (MIT) `PROTOCOL.md` and `python/xbloom.py` `encode_recipe()`;
XBRW++ `library/Recipe.ts`, `library/Pour.ts`, `library/cardLimits.ts` at `856413b`.

## Headline

**The per-pour block is byte-identical between the NFC card and the BLE recipe
blob, with one exception.** This is not a coincidence — the same firmware
consumes both, so both carry the same recipe encoding wrapped in different
framing.

The practical consequence: "brew a recipe over BLE" is mostly a **transport and
framing** problem, not an encoding problem. The encoding already exists, and it
is already covered by 1217 tests and an independent fixture reimplementation.

## The per-pour block

Both formats emit 8 bytes per pour, in the same order.

| Byte | Card — `Recipe.getData()` | BLE — `encode_recipe()` | Match |
|---|---|---|---|
| 0 | `pour.getVolume()` | `int(volume)` | identical |
| 1 | `pour.getTemperature()` | `int(temperature)` | identical |
| 2 | `pour.getPourPattern()` | `_PATTERN_CODE[pattern]` | identical |
| 3 | `pour.getAgitation()` | `_vibration_code(before, after)` | identical |
| 4 | `256 + (0 - waitSeconds)` | `(-post_wait) & 0xFF` | identical |
| 5 | `(minutes << 5) \| dosage` (pour 1) | always `0x00` | **differs** |
| 6 | `this.grindRPM` (pour 1), else `0` | `rpm` (pour 1), else `0` | identical |
| 7 | `pour.getFlowRate()` | `int(flow_rate * 10)` | identical |

Confirmations worth stating explicitly, because each could plausibly have gone
the other way:

- **Pattern.** Ours is `CENTERED: 0, CIRCULAR: 1, SPIRAL: 2` (`Pour.ts`). BLE is
  `{'center': 0, 'circular': 1, 'spiral': 2}`. Same values, same order. `spec`
- **Agitation.** Ours packs before into bit 0 and after into bit 1, giving
  0/1/2/3. `_vibration_code()` returns 3 for both, 1 for before, 2 for after,
  0 for neither. Same bit semantics. `spec`
- **Pause.** `256 + (0 - n)` and `(-n) & 0xFF` are the same arithmetic written
  two ways. `spec`
- **RPM in pour 1 only.** Both do this, and both zero it for later pours. `spec`
- **Flow rate.** We store the ×10 integer (`cardLimits.ts` `FLOW_RATE {min: 30,
  max: 35}`, `StageTile.tsx` divides by 10 to display). BLE computes
  `int(rate * 10)`. Same byte on the wire; we simply hold it pre-encoded. `spec`

### The one difference: byte 5, and it is smaller than it first looked

The card packs two things into byte 5 of pour 1: the dose in the low five bits,
and the whole-minutes part of the pause in the top three.

**Dose** is genuinely not in the BLE blob. It is relocated out into its own
command, **8102** (`APP_BYPASS`, `[0, 0, int(dose)]`). Not absent — moved. `spec`

**Minutes are in the same place on both.** My first reading of the coffee-brew
path was that BLE simply left byte 5 at zero, which would have meant long pauses
could not survive a BLE brew at all. That was wrong, and the correction matters.
`HomoLand/xbloom-studio-brew`'s tea encoder splits a pause as
`divmod(seconds, 60)` and writes `(-remainder) & 0xFF` to byte 4 and
`(minutes * 32) & 0xFF` to byte 5. `minutes * 32` **is** `minutes << 5` — the
identical field, in the identical bit positions, as our card format. HomoLand
describes this as a port of the official Android app's `TeaRecipeCreate`
transform. `single-source`

Byte 5 reads as zero in most captured coffee brews because coffee pauses are
under a minute, not because the field does not exist.

So our `(minutes << 5) | dosage` packing is very likely the *same* packing the
BLE path uses, with the low five bits vacated because dose travels separately.
That is a much better position than "the blob has nowhere to put it" — but it
rests on a single unlicensed source describing tea, and our card path allows
pauses up to 360s (6 minutes, needing 3 bits — exactly what is there). **Confirm
on hardware before relying on it.**

## The framing, which does not match

Everything around the pour blocks is different.

| Element | Card | BLE blob |
|---|---|---|
| 32-byte xBloom signature | yes — read off the card, never computed | absent |
| XID | 7 bytes ASCII | absent |
| Cup type | one byte (tea packs cup count into the high nibble) | absent — sent via command 8104 as a float weight range |
| Pour count | `pours.length << 3` | absent — implied by the length byte |
| Leading length byte | none | yes — total data byte count |
| Grind size | `grindSize - 40`, or `41` to disable | raw value, `0` to disable |
| Ratio | raw (`16`) | ×10 (`160`) |
| Checksum | CRC-8/MAXIM-DOW over the payload | none in the blob; CRC-16 sits on the outer packet |

Two of these are traps for anyone assuming symmetry:

- **Ratio.** The card stores `16`; BLE stores `160`. Getting this backwards
  produces a recipe the machine may accept while brewing something else
  entirely. The protocol spec itself records that this byte was misread once
  already (as `grand_water / 10`) before HCI capture corrected it. `spec`
- **Grinder off.** The card uses the sentinel `41` (`GRINDER_OFF`); BLE uses
  `0`. On the card, `0` would mean grind size 40 — the finest setting — so a
  naive port of this field would silently grind instead of not grinding.
  `inferred` from the two encoders side by side.

## What is directly reusable

**The domain model and its validation, essentially wholesale.** These encode
machine constraints, not card constraints, so they apply unchanged to BLE:

- `getTotalVolume()` — `dosage * ratio`. The protocol spec independently
  confirms this from decompiled source: `RecipeDetailActivity` validates
  `dose × grandWater == totalPourVolume`, and notes that the field named
  `grandWater` in xBloom's own model is the ratio, not a water volume. Our
  `isPourVolumeValid()` is the same rule. `corroborated`
- `autoFixPourVolumes()`, `fixRatio()` — rebalancing to satisfy that rule.
- `cardLimits.ts` — the range table is mostly machine ranges. `FLOW_RATE 30–35`
  matches the spec's 3.0–3.5 exactly. `corroborated`
- All of `Pour.ts`.

**The editor, the library, the import path, and the backup format** are all
format-agnostic and need no change.

### What is not reusable

The framing above, plus `NFC.ts` in its entirety — BLE needs its own transport
with its own packet builder (header `0x58`, little-endian command code, 4-byte
length, CRC-16 poly `0x8408` init `0`) and its own connection lifecycle.

### Where the ranges disagree

Worth checking before trusting either:

| Field | `cardLimits.ts` | Protocol spec (app UI ranges) |
|---|---|---|
| Temperature | 39–99 | 40–95, plus 98 for "BP" |
| Grind size | 40–80 | 1–100 raw |
| Pause | up to 360s | 0–59s |
| Volume | single byte, ≤255 | 0–240 app limit; >127 **chunked** into 127 ml substeps |

The chunking is the notable one: BLE splits any pour above 127 ml into multiple
4-byte substeps carrying the same temperature, pattern and vibration. The card
has no such mechanism. A 300 ml pour becomes `127 + 127 + 46`, and the spec
records a confirmed brew doing exactly that. `spec`

## Implications for the roadmap

1. **"Brew a recipe" is smaller than it looks.** The expensive, dangerous part —
   getting recipe bytes right — is already built and tested. What is missing is
   a BLE transport, an outer packet builder, a small reframing layer, and the
   brew command sequence.

2. **The reframing layer is the risk, and it is testable without hardware.** The
   ratio ×10 and grinder-`0` divergences are exactly the kind of thing that
   passes review and misbrews. This should be built the way the card format
   already is: an independent fixture reimplementation in the tests, so a
   round-trip is not tautological.

3. **The existing `NFC.ts` / `Recipe.ts` seam is the right shape.** Transport is
   already separated from encoding. BLE slots in beside `NFC.ts` as a second
   transport rather than requiring the model to change.

4. **Dose relocating to command 8102 breaks the "one blob is the recipe"
   assumption** that holds for cards. A BLE brew is a *sequence* — handshake,
   bypass+dose, set cup, recipe, execute — where the card is a single write.
   Any UI must model a multi-step exchange that can fail partway.

## Open questions this analysis could not settle

- What the machine does with a pause longer than 59s over BLE.
- Whether the cup weight ranges for command 8104 matter. The spec's author
  observed the machine brewing correctly regardless and used the observed
  defaults (200.0/80.0), with only two of four cup types HCI-confirmed.
  `single-source`
- Whether tea recipes go through the same path. There are separate commands
  (`APP_TEA_RECIP_MAKE` 4512, `APP_TEA_RECIP_CODE` 4513) that nothing in the
  spec documents in detail, and tea is special-cased throughout our card code.
- Whether the card's temperature sentinels at 39 and 99 mean room temperature
  and boiling point, matching the app's "RT" and "BP". Suggestive, unconfirmed.
