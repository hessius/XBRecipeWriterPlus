# Easy Mode three-slot writer

Package 10 of 2.1.0. Bounded design approved on 2026-10-09.
Base: `origin/integration/2.1.0` at `d0f60dd`.

## Scope and ownership

Own slot assignments, persistence, a dedicated A/B/C screen, recipe-context
entry and library markers. No changes to NFC bytes, Recipe serialization,
backup structures or the brew lifecycle.

The pause/overflow session remains the named owner of `Machine.ts`,
`protocol.ts` and global machine-operation exclusion. This session builds a
typed slot port and scripted implementation tests, not an alternative machine
state machine. Production transport wiring requires coordination with that
owner. Until the agreed port is installed, real writes are explicitly blocked.
This is an integration gate, not a finished production writer.

Do not merge into main, open a PR, request automated review or deploy.

## Screen and entry points

A stacked A/B/C editor is canonical. A three-step wizard would obscure the
complete replacement set; a per-recipe direct write would misrepresent the
batch-of-three requirement.

Use existing ScreenHeader, Tamagui controls, XbrwSheet and the central palette.
The screen scrolls independently of its bottom write action. No new native
dependencies or changes to the existing sheet/navigation idiom.

The machine panel offers an Easy Mode entry. Recipe actions in the library and
editor open this screen with that recipe ready to assign. Fill the first empty
draft slot; when all three are occupied, ask which slot to replace. A context
entry never silently displaces an assignment. A recipe may occupy several
slots. The recipe picker reads the entire library, not the visible shelf/query.

On first use, each unassigned slot says its existing machine contents are
unknown. All three require deliberate assignments; do not invent filler
recipes, read back nonexistent data or imply an empty draft means an empty
machine slot.

Always show before sending:

> Writing replaces A, B and C and leaves your machine in EASY.
> Changes made outside XBRW++ cannot be detected.

After success, say "Last written by XBRW++", with the time and an explicit
no-read-back qualification. Never label a remembered set as machine-verified,
current or synced.

During a transaction, lock assignment controls. Show each slot's receipt state
and the overall completion state. Leaving the screen cannot cancel already
sent frames or destroy the journal. Do not offer a generic Cancel or Reset
that makes a partial machine batch disappear from the app.

## Assignment and snapshot model

Use a new slot domain under `library/slots/`, not fields on Recipe. A slot
snapshot contains a source UUID, display name, serialized recipe and prepared
wire content. Snapshot creation validates the recipe before it can be written.

Drafts are explicit snapshots, not live references. Later library edits show an
update-needed state with an explicit update action; they never silently alter
the pending set. Deletion retains the snapshot and labels it as removed from
the library. Renaming does not change the wire fingerprint or machine history.

Last-written snapshots are separate from drafts. Promote them only after
receipt and final completion evidence. A failed replacement retains the prior
last-written set, while visibly marking an incomplete replacement.

Library markers distinguish planned assignments from last-written assignments,
including multiple letters and whether library brewing parameters differ.
Markers are app records, not a claim about the physical machine. Feed markers
to list cards and shelf tiles from one shared slot read, not per-row SQL.

## Persistence and machine identity

New SQLite storage uses the existing `appDatabase()` connection and database
file. Store drafts, last-written snapshots and an incomplete journal per
remembered BLE device ID. Empty/unpaired identity has no writable machine set.

Bind a transaction to the reported machine serial when available. A conflicting
serial blocks continuation. Never move a pending journal to another device,
discard it on recipe deletion or clear it as an incidental effect of unpairing.

Persist all three exact prepared frames and snapshots atomically before the
first send. Persist the uncertain-send boundary before dispatch, and each
acknowledged boundary before dispatching the next frame. Persistence failure
prevents further sends; it is surfaced, not swallowed.

Completed snapshots and clearing the journal are one database transaction.
Relaunch must reconstruct incomplete state without automatically sending.
Malformed stored state is an explicit storage error, not an empty-success
fallback. Machine-bound records and recovery journals are intentionally absent
from existing recipe backups; changing that trust boundary is out of scope.

## Supported recipes and encoding

V1 supports valid coffee recipes through the existing `encodeCoffeeBlob`.
Reject tea and enabled bypass recipes explicitly: the documented slot frame
does not establish equivalent tea/bypass behaviour. Do not silently omit an
unsupported part of a recipe. These restrictions were explicitly approved.

Reuse `brewProblems` and require finite, valid values for every encoded field.
Prepare all three blobs before sending A. Flags are `0x02`, proven to defer to
the blob's grinder byte; grinder off therefore comes from the existing `0xFE`
encoder sentinel. No speculative `0x04`, scale toggle, PRO switch or `11512`
ordering command. The latter's required payload/completion role is not settled
by the documented hardware batch.

Do not encode card bytes with `Recipe.getData()` for BLE.

## Shared transport contract

The feature consumes an exclusive slot port. Its contract must:

1. Acquire machine-operation exclusion before any outgoing slot frame.
   A running/held brew, another write, raw console command or pending slot
   recovery cannot interleave. A slot reservation lasts through incomplete
   recovery, not merely until a send promise settles.
2. Validate the connected device and reported serial against the journal.
3. Observe notifications before dispatch, pace frames through the established
   machine transport, and distinguish native dispatch from machine receipt.
4. Correlate one `11510` receipt per slot in a serial, non-retrying attempt.
   Identical code-only ACKs do not provide a slot identifier.
5. Require all three receipts and a fresh `SLOTS_SAVED` event belonging to the
   attempt before reporting completed storage. Idle alone proves nothing.
6. Surface link loss, ambiguity, refusal, missing completion and blocked
   operations explicitly. No automatic reconnect-and-replay.

The domain writer accepts an injected port. Scripted tests can establish the
software contract, but cannot establish firmware replay/idempotence.
Production uses no raw `Machine.send` workaround while the shared owner has
not installed this contract. The unavailable production port reports a
specific integration block before journal creation or radio use.

### Bounded production-port clarification (2026-10-09)

`installMachineSlotPort` is implemented separately from the approved domain/UI.
Its early shared-owner installation, app-state forwarding and settings-forget
notification contract are recorded in the package 10 handoff in
`docs/release-2.1.0-changes.md`; route-effect installation is insufficient.
The route remains unavailable until that owner/UI work is wired.

Command 11510's receipt status is byte 9 (C2 ACK), as documented in
brAzzi64/xbloom-ble's PROTOCOL.md notification format; it carries no slot index.
The port serializes one outstanding receipt, uses the existing 2-second frame
gap and never automatically retries. A delayed duplicate from a prior slot
arriving in the next slot's window is not distinguishable in software.
Firmware ordering remains an explicit hardware gate, not a solved correlation
problem. The native notification format also contains no connection epoch;
generation guards reject observable stale callbacks, not unknowable wire age.

Native dispatch, receipt and final storage completion each have a separate,
conservative **unmeasured 15-second software budget**. Dispatch includes
pacing; receipt's budget begins after native dispatch resolves. An early ACK
does not excuse a hung native dispatch. Only fresh SLOTS_SAVED after C's
receipt satisfies final completion; early final evidence is buffered while
native dispatch resolves. Invalidation is checked again at durable mutation
boundaries. No change to the slot bytes, mode flags or recovery policy is made.

## Recovery and uncertainty

Hardware proves that completing an interrupted set releases the machine; it
does not prove that a lost ACK can safely be treated as a missing slot.

An acknowledged boundary with no subsequent dispatch can continue with the
remaining immutable frames, under an explicitly authorised recovery attempt.
After native write error, timeout, restart at an in-flight boundary or lost ACK,
receipt is unknown. Freeze that slot and later slots; do not advance, mark
success, automatically resend or start a new set.

If C was acknowledged but final completion was not observed, retain
"completion unconfirmed". A later bare idle state is not retrospective proof.
The shared owner must provide verified recovery evidence/semantics before
production can resolve ambiguous receipt or missing final completion.

Keep the prior snapshots labelled as last written, not verified current
contents. Explain that the machine may be waiting for this incomplete batch
and that another brew/write must not begin.

## Scripted evidence and release gates

Use real SQLite persistence tests, an injected scripted exclusive port and
async provider-aware UI tests on both Jest platforms. Cover:

- Complete prevalidation and no radio/journal mutation on invalid input.
- A/B/C ordering, `0x02`, grinder on/off and the independent wire fixtures.
- Persist-before-send, receipt boundaries and atomic promotion.
- Failure before A, uncertain receipt, lost/delayed/duplicate ACK and missing
  completion without false success.
- Relaunch, reconnect identity mismatch, immutable recovery frames and
  persistence failures.
- Operation contention, navigation without cancellation and stale callbacks.
- First use, full-set replacement choice, edited/deleted recipes, whole-library
  picker, context entry and markers on list/shelf surfaces.

Update `docs/release-2.1.0-changes.md` with implemented versus integration-blocked
behaviour and actual scripted results. Required production gates:

1. Shared owner integrates and verifies exclusion across brew, slots, console
   and link lifecycle; no competing Machine/protocol edits.
2. Hardware uses three distinct ratios and both grinder states. Check the
   actual brewed recipes as well as the limited ratio/grind display.
3. Interrupt after A/B, drop a link, lose ACKs and test restart/reconnect.
   Establish safe ambiguous-receipt recovery and final completion evidence.
4. Verify the EASY side effect and ordinary app brewing afterwards. Confirm
   that omitting PRO and `11512` remains correct on supported firmware.
5. Native iOS/Android checks: narrow widths, large text, VoiceOver/TalkBack,
   picker/sheet isolation, pinned action and recovery copy.
6. Verify brewer/cup and overflow behaviour. The documented slot blob carries
   neither cup type nor phone-side overflow policy; do not imply that either
   protection transfers to standalone EASY brewing.

Hardware is unavailable during development. These gates remain explicitly
unverified and must clear before shipping; scripted fakes cannot clear them.
