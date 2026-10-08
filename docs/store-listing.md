# App Store listing — XBRW++ 2.0.0

Draft metadata for the 2.0.0 submission. Every claim here is checked against the
code; the audit that backs it is summarised at the bottom under **Claims we
deliberately did not make**.

Apple's limits: name 30, subtitle 30, promotional text 170, keywords 100,
description 4000, what's new 4000.

---

## 1. App name — decided

**`XBRW++ - xBloom Brew & Cards`** (28), replacing `XBRW++ - xBloom Recipe Writer` (29).

"Recipe Writer" is now the smallest thing the app does, and as a search term
"writer" is worth nothing. "Brew" is the term people actually type. `xBloom`
must stay wherever it is: it is the single highest-value word in the listing,
and the name field is weighted far above the keyword field.

| # | Option | Chars |
|---|--------|-------|
| A | `XBRW++ - xBloom Brew & Cards` | 28 |
| B | `XBRW++ - Brew with xBloom` | 25 |
| C | `XBRW++ - xBloom Companion` | 25 |
| D | `XBRW++ - xBloom Recipe Writer` | 29 (the old one) |

**A** keeps the card story existing users recognise, adds the word the app is
now really about, and drops the one nobody searches.

One risk worth recording: the name is re-reviewed when it changes, and it
contains a third-party trademark. The old name has already cleared review, so
`xBloom` stays in the position it already occupied.

## 2. Subtitle — decided

**`Your xBloom, unleashed`** (22), replacing `Your card, your coffee` (22).

Every literal phrasing we tried named three of the things the app does and
therefore implicitly disowned the rest, which is the wrong shape for a release
whose whole argument is completeness. An evocative line does not have that
problem.

It does spend the subtitle on `xBloom`, which the name already carries and
Apple only indexes once, so the field earns nothing as a keyword. That is a
deliberate trade of ASO for a line that reads.

## 3. Promotional text

Editable without shipping a build, so this is the field to change when something
lands. For launch:

```
Version 2.0 brews. Connect over Bluetooth, watch the pour on a live graph, then put two brews side by side to work out what to change next time. No card needed.
```

## 4. Keywords

Current:

```
xbloom,xbloom studio,pour over,brew,nfc,tag,,grind,dose,ratio,pod,recipe,scan,tea,filter,coffee
```

Three things are wasting space. There is an **empty keyword** (`tag,,grind`).
`xbloom` and `brew` are in the app name, and Apple already indexes the name, so
repeating them buys nothing. `xbloom studio` repeats `xbloom` a second time, when
Apple builds phrases out of single keywords on its own, so `studio` alone covers
it.

Proposed:

```
studio,pourover,dripper,grinder,dose,ratio,nfc,pod,tea,barista,drip,timer,scale,dial,espresso
```

## 5. Description

```
XBRW++ started as a way to rewrite the card that came with your coffee. It does a lot more than that now.

Import a recipe. Change anything in it. Write it to a card, or skip the card and brew straight from your phone. Then keep what happened, so the next one is better.

BREW FROM YOUR PHONE
Connect over Bluetooth and brew with no card at all. The water draws itself on a graph as it lands, next to the flow rate into the cup and the stage you are on. The drawdown gets its own timer once the pouring stops.

BREW WHAT A CARD CANNOT HOLD
A card holds a whole number ratio. It has nowhere to put bypass water, and only so much room for stages. Bluetooth has none of those problems. Brew 1:15.5. Add bypass. Write a recipe longer than a card can carry.

EDIT EVERY STAGE
Dose, ratio, grind size and grind speed. Then each pour on its own: volume, temperature, pattern, agitation, flow rate, and the pause after it. Change one degree, or everything.

WRITE IT TO A CARD
Hold a card to your phone and the recipe is on it. Read a card the same way to pull its recipe into your library, including cards that never show up in the official app.

BRING RECIPES IN
Paste an xBloom share link, or share one into the app from your browser. Type a pod code. Sign in to xBloom and pull your own recipes over. Build one in BrewMind without leaving the app.

Or open the community catalogue. XBRW++ downloads it and then searches it here on the phone, which is why a search for Colombia turns up hundreds of recipes instead of a dozen.

A LIBRARY THAT KEEPS UP
Search by name, author, note or pod. Tag anything. Sort by name, date, rating, ratio, how often you brew it, or how long it has been. Shelves build themselves out of what you actually have, and you can put away any that do not describe how you brew.

DIAL IT IN
Every brew is recorded, and what gets recorded is what the machine did rather than what you asked for. Rate it out of five. Write a note. Pin the ones worth keeping. Put two next to each other and see exactly what moved.

SHARE THE GOOD ONES
Turn a brew into a card for social, graph and figures included, and pick what goes on it. Or make a share link and send the recipe itself.

YOURS, AND ONLY YOURS
There is no XBRW++ account and there never will be. No analytics, no ads, no tracking. Your recipes, brews and notes sit on your phone. Signing in to xBloom is optional, and it only ever reads. If you want the detail, there is a screen in the app listing every network call it can make and what each one sends.

WHAT YOU NEED
• An xBloom Studio or an original xBloom. This is a companion to hardware you already own.
• Genuine xBloom cards, for the card features. The first 32 bytes of every card are a signature xBloom derives from the card's serial number. XBRW++ preserves that signature but cannot create one, so blank third-party tags will not work.

A couple of things the machine insists on, which the app handles for you: pour volumes have to add up to dose × ratio, so the app rebalances them, which can move the total by a millilitre or two. A card takes whole number ratios. A Bluetooth brew does not have to.

XBRW++ is free and open source.

Not made by, affiliated with, or endorsed by xBloom.
```

## 6. What's New

```
This is the big one.

BREW FROM THE APP
Connect to your xBloom over Bluetooth and brew with no card involved. A graph draws the water as it arrives, with the flow rate into the cup and the stage you are on, and the drawdown gets its own timer at the end.

RECIPES A CARD CANNOT HOLD
Half step ratios like 1:15.5. Bypass water. More stages than a card has room for. None of it fits the card format. All of it brews over Bluetooth.

BREW HISTORY
Every brew is kept, with what the machine actually did. Rate it, note it, pin it. Then put two next to each other and see what moved.

SHARE A BREW
Turn a finished brew into a card for social, and pick what appears on it.

THE COMMUNITY CATALOGUE
Browse the whole xBloom community recipe list. XBRW++ searches and filters it here on the phone, so a search for Colombia turns up hundreds of recipes instead of a dozen. Save anything you like into your library.

MORE WAYS IN
Sign in to xBloom and import your own recipes. Build one in BrewMind without leaving the app. Make a share link for anything you have.

A BIGGER LIBRARY
Tags, shelves that build themselves, and sorting by rating, ratio, brew count or how long it has been.

There is also a screen listing every network call the app can make, backups now carry your brew history, and a long list of smaller fixes.
```

---

## Claims we deliberately did not make

- **Beanconqueror.** It is behind LABS and defaults to off
  (`library/Settings.ts:269`), because the receiving end is not in
  Beanconqueror's own release yet. A reviewer installing the app cannot find it,
  so it cannot go on the store page. Worth adding to the description the moment
  the gate comes off.
- **"Brew recipes the official app cannot brew."** Refused at first, then
  **reversed by the owner on 3 October**, who has both machines and both apps
  and is content to drop the line if review objects. It now appears in the
  description and in slide 3's headline, "Brew what neither a card nor the
  official app can".

  What changed is that the claim got narrow enough to measure. The general
  version is still refused: what the official app will or will not send over
  its own Bluetooth link is not something this repo can stand behind. The
  version we ship is about **stages only**, and that one is corroborated.
  Fetching xBloom's own community catalogue whole, both machine partitions,
  gives a hard ceiling at nine:

  | Machine | Rows | Pour counts seen |
  |---|---|---|
  | Studio (`J15`) | 1,667 | 2:26 3:287 4:675 5:554 6:73 7:42 8:7 **9:2** |
  | Original (`J20`) | 1,345 | 2:23 3:241 4:518 5:460 6:62 7:35 **8:6** |

  Not one of the 3,012 live recipes exceeds nine, and only two reach it.
  A ceiling in published data is evidence rather than proof, but it agrees
  with what the owner sees in the official editor.

  The slide's three chips are **not** all comparisons, and the headline does
  not ask them to be. Only `17 stages` clears both bars. Bypass is a field in
  xBloom's own share-link format (`isEnableBypassWater`,
  `library/shareLink.ts:33`), so the official app has it, and the owner
  confirms a 1:15.5 brews there too. Both chips are examples of what a **card**
  cannot hold, which is the first half of the headline, and the capture
  underneath is the recipe they describe.

  An earlier draft put the app comparison in a separate foot line reading "the
  official app stops at nine stages", precisely so the chips could not be read
  as covering it. The owner chose the combined headline instead, taking the
  chips as examples rather than as a comparison list. Recording the trade
  rather than the outcome: **if review queries slide 3, the foot-line version
  is the fallback**, because it says only the thing that is measured.
- **"Unlimited stages."** The code documents seventeen stages run successfully
  over Bluetooth (`library/cardLimits.ts:53-66`), not an unbounded number, so
  the copy says "more stages than a card can carry".
- **"Works with any xBloom."** Only Studio and the original are supported
  (`library/machine/machineModel.ts:17-25`).
- **"Backups keep every graph."** They keep brew records, not the sample
  streams (`library/backup.ts:87-88`).
- **"No network at all."** It makes seven kinds of call, all listed in
  `constants/network.ts`. The copy points at the in-app screen rather than
  claiming silence.
