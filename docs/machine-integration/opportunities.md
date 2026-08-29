# Opportunities, dependencies, and my read

**Researched 2026-08-29.** This is the synthesis file. It assumes the findings
in `ble-protocol.md`, `cloud-api.md`, `platform-ble.md`, `app-survey.md` and
`recipe-overlap.md`, and does not repeat their evidence.

**It deliberately does not sequence anything.** That is a conversation to have
with this in hand.

## What the research actually changed

Four things are different from the assumptions the roadmap started with.

**1. Share links are cheaper than expected mechanically, and dearer than
expected politically.** There is no "mint a link" API. You POST a recipe and
base64 the row id you get back. `spec` But that POST needs an authenticated
xBloom account, and there is no anonymous path — which turns a small feature
into an identity decision. See `identity-and-privacy.md`.

**2. "Share a recipe" was two features wearing one coat.** Sharing to another
XBRW++ user needs no account and no network. Sharing into the official app needs
both. The first is nearly free and got hidden behind the second.

**3. Brewing over BLE is mostly transport on top of code we already have.** The
per-pour block is byte-identical to our card format, field for field. `spec`
`Recipe.getData()` is already most of a BLE encoder. The work is the radio, the
state machine and the safety, not the encoding.

**4. `react-native-ble-plx` is not usable here.** It is the obvious default and
it is bridge-mode only; its New Architecture rewrite is still a draft PR. SDK 57
is New-Arch-mandatory. `react-native-ble-manager` 12.5.1 is the viable choice.
`verified` This is the single most useful thing to know before anyone starts.

## Opportunities, grouped by what they cost

### Group A — needs nothing new

No network, no account, no native module, no new review surface. These sit
entirely inside the app we already ship.

| # | Opportunity | Note |
|---|---|---|
| A1 | **Per-recipe share and import** in our own format | We already serialise `Recipe` to JSON for backups and already have a file-share path in `useBackup.ts`. Deep link or file. |
| A2 | **Grind-size guidance in the editor** | Our editor's range is 40–80 (`cardLimits.ts`), and a bare number in it means nothing to a new user. A brew-method reference scale is factual coffee knowledge, not anyone's IP. |
| A3 | **Tea recipe templates** | The card format already supports tea and we already special-case it. Templates are content, not capability. |
| A4 | **Iced / cold-brew template** | Same. The invariant is `total beverage = brew water + ice`, derived independently. |
| A5 | **Post-brew notes and rating** | Purely local. Turns the app from a writer into something you come back to. No protocol involvement at all. |

### Group B — needs the cloud and an account decision

Blocked on `identity-and-privacy.md`, not on any technical unknown.

| # | Opportunity | Note |
|---|---|---|
| B1 | **Mint a share link for a recipe you made** | The original idea 1. Mechanically small. Gated entirely on the account model. |
| B2 | **Import your xBloom cloud library** | `tuMyTeaRecipeCreated.tuhtml` lists recipes for an authenticated member. Same gate. |
| B3 | **Push an edited recipe back to the cloud library** | `tuRecipeUpdate.tuhtml`. Same gate, plus a sync/conflict model that no surveyed project has. |

### Group C — needs BLE

All of these need the same foundation: a native module, permission strings, a
connection state machine, and hardware to test against.

| # | Opportunity | Note |
|---|---|---|
| C1 | **BLE foundation** — connect, discover, handshake, disconnect | Load-bearing for everything else in this group. Valuable to build and prove on its own. |
| C2 | **Brew a recipe directly** | The original idea 2A. Mostly `Recipe.getData()` plus a command sequence. |
| C3 | **Write the three Easy Mode slots** | The machine's on-board library is exactly three slots, A/B/C. Must be written as a batch of three or the machine hangs. `corroborated` |
| C4 | **Live brew telemetry** | Two float32 weight streams at ~10 Hz plus lifecycle events, all pushed. Nothing to poll. |
| C5 | **Machine settings and standalone grinder** | Catalogued because it exists, not because anyone asked. |

### Not recommended

**Bean photo → recipe via an LLM.** Several surveyed projects do this and it is
clearly popular. It would mean an API key, a cost model, and either a backend or
the user's own key — all of it foreign to what this app is. Noted, and set aside.

**An MCP server.** Already exists elsewhere, desktop-only, and does not fit a
phone app that writes cards.

## Dependency map

```
A1 per-recipe share ──┐
A2 grind guidance     ├── independent, no blockers, no order between them
A3 tea templates      │
A4 iced template      │
A5 notes and rating ──┘

identity decision ─────┬──> B1 mint share link
  (identity-and-        ├──> B2 import cloud library
   privacy.md)          └──> B3 push to cloud library ──> sync/conflict model
                                                            (unsolved anywhere)

C1 BLE foundation ─────┬──> C2 brew a recipe ──> hardware verification
                       ├──> C3 Easy Mode slots      (mandatory, see below)
                       ├──> C4 live telemetry
                       └──> C5 settings / grinder

recipe-overlap.md ─────────> C2  (already done; de-risks C2 substantially)
```

**The only hard technical blocker in the whole map is C1.** Everything in Group
A is unblocked today. Everything in Group B is blocked on a decision rather than
on work.

## Annotated backlog

My read on each, for us to sequence together.

**A1 — per-recipe share.** The clearest win in the entire study. Small, useful
on its own, no cost of any kind, and it delivers most of what "share a recipe"
was reaching for without touching an account. If one thing comes out of this
research, it should be this.

**A2, A3, A4, A5.** Cheap, additive, and they make the app better at the thing
it already does rather than turning it into something else. A5 is the one with
real product weight — it gives a reason to open the app when you are not writing
a card.

**B1 — mint share links.** Genuinely wanted, and the mechanics are a day's work.
But it cannot be built without answering the account question, and none of the
three answers is good. **Try asking xBloom first.** That is a cheaper move than
any of the alternatives and it is the only one that removes the risk rather than
accepting it.

**B2, B3.** B3 needs a sync model that nobody in an eleven-project corpus has
solved, and offline editing is the whole point of this app. Treat with caution.

**C1 — BLE foundation.** The real question is not whether it works but whether
it should be built at all, and that is a product question about what XBRW++ is.
Today it is a focused tool that does one thing well. If BLE is wanted, C1 is a
genuine project and should be scoped as one — not smuggled in as part of C2.

**C2 — brew a recipe.** The most exciting item and the one carrying the most
risk. Two specific traps, both of which cause **silent** wrong behaviour rather
than an error:

- The ratio byte must be **ceiling**, not rounding. An undershoot by one makes
  the machine skip grinding entirely, with no error. Hardware-root-caused by
  `saya6k`. `corroborated`
- Grinder-off is `0xFE` over BLE. It is `41` on our cards, and `0` — which the
  original spec author first used — means *finest grind*. `corroborated`

Also unresolved: command `40518` may start or un-start a brew depending on
machine state, and sources disagree. `ble-protocol.md` calls this the most
operationally dangerous gap in the protocol, and it is the one thing that
absolutely must be settled on hardware before anything ships.

**C4 — telemetry.** Lovely, and the cheapest thing to add once C1 exists, since
it is pure listening with nothing written to the machine. If C1 ever happens,
this is the natural second step, ahead of C2.

## The standing caveat

Nothing in this study is hardware-verified — see `README.md`. That is
tolerable for Group A and B, which do not touch the machine. It is **not**
tolerable for Group C. Card writes already carry this exposure (issue #48); a
malformed brew command is worse, because it moves water and heat rather than
bytes.
