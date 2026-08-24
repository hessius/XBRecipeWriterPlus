# Editor help copy

Every word of explanation the editor can show, as it stands today. Rewrite
the text in place and leave the `##` headings and the `Title:` / `Hint:` /
`Question:` / `Answer:` labels alone — they are what map each entry back to
`constants/recipeHelp.ts`.

- **Title** is the field's label on screen.
- **Hint** is the one-line version, drawn under the label when *One-line
  hints* is on in settings. It has to fit on one line on a phone, so six to
  nine words.
- **Question** and **Answer** are one entry of the help sheet, reached from
  Help under the caret. The question is the heading, so write it as something
  somebody would actually ask — the reader has just come from the label and
  is scanning for their own problem, not for a glossary term they already
  found on the screen.
- A field with no question has nothing in the sheet: its hint is the whole
  story. Give one a question and an answer and it appears there.

A note before editing: some of this describes machine behaviour that is
documented nowhere else and was learned by trial against a real machine — the
grinder-off workaround especially. Rewrite it for clarity, but do not shorten
away a fact.

## dose

**Title:** Dose

**Hint:** Coffee in the basket. Sets the target with the ratio.

**Question:** _(none — not in the help sheet)_

**Answer:** _(none)_

## ratio

**Title:** Ratio

**Hint:** Whole numbers only. Sets the target volume.

**Question:** What does the ratio set?

**Answer:** The target volume is the dose multiplied by the ratio. The stage volumes have to add up to it exactly or the machine will refuse the card. Half ratios cannot be stored on a card.

## grindSize

**Title:** Grind size

**Hint:** 40 to 80. Lower is finer.

**Question:** _(none — not in the help sheet)_

**Answer:** _(none)_

## grindSpeed

**Title:** Grind speed

**Hint:** 60 to 120 rpm, in tens.

**Question:** Why is there only one grind speed?

**Answer:** Only the first stage's speed is stored on the card, so this is one setting for the whole recipe rather than one per stage.

## grinder

**Title:** Grinder

**Hint:** Turning it off is experimental.

**Question:** Can I turn the grinder off?

**Answer:** Turning the grinder off writes grind size 81, one past the maximum, and the machine will refuse a card in that state outright. The workaround is to load any other recipe with the grinder enabled first — a shortcut button, another card, or the xBloom app — after which this card will be accepted and the machine will show '--' for the grind size. There is no better way to disable the grinder from a recipe card.

## cup

**Title:** Cup

**Hint:** Omni turns overflow protection off.

**Question:** Which cup type should I pick?

**Answer:** XPod is the standard cup. Omni disables overflow protection, which is what you want when the vessel is not the one the machine expects. Other is for third-party brewers.

## xid

**Title:** Recipe ID

**Hint:** Without one, a written card reads back nameless.

**Question:** What is the recipe ID for?

**Answer:** The recipe ID is how the app finds a recipe online. It is a three-letter vendor code, an optional T for tea, then two or three digits — CGL12, CGLT123. The card stores this ID and not the name, so a card written without one will read back nameless. Changing or clearing it stops the wrong recipe being shown in the app; the machine brews the same either way.

## name

**Title:** Name

**Hint:** Yours. The xBloom name is kept separate and not overwritten.

**Question:** _(none — not in the help sheet)_

**Answer:** _(none)_

## volume

**Title:** Stage volume

**Hint:** All stages together must equal the target.

**Question:** Why must the stage volumes add up?

**Answer:** The machine checks the stage volumes against the dose times the ratio and refuses the card if they differ. Auto fix rescales every stage to close the gap and spreads the rounding error across the stages it fits worst. Changing the dose or the ratio moves the target instead of the stages, which is often the better fix.

## temperature

**Title:** Temperature

**Hint:** 39 to 99 °C.

**Question:** _(none — not in the help sheet)_

**Answer:** _(none)_

## flowRate

**Title:** Flow rate

**Hint:** 3.0 to 3.5 ml per second.

**Question:** _(none — not in the help sheet)_

**Answer:** _(none)_

## pause

**Title:** Pause

**Hint:** How long the machine waits once this stage has poured.

**Question:** Does the pause come before or after the pour?

**Answer:** The wait comes after the water, not before it: this is the bloom on a first stage and the steep on a tea one, which is why a coffee stage stops at 59 seconds and a tea steep goes to 360.

## pattern

**Title:** Pattern

**Hint:** The path the water takes over the bed.

**Question:** What do the pour patterns do?

**Answer:** Centered holds the stream in one place. Circular walks it round the bed at a fixed radius. Spiral works outward from the middle.

## agitation

**Title:** Agitation

**Hint:** Shakes the basket, before this stage's pour or after it.

**Question:** What does agitation do?

**Answer:** Each stage can agitate before it pours, after it pours, both or neither. Before settles the bed the last stage left; after breaks up what this one has just built.

## tea

**Title:** Tea

**Hint:** Steeps are capped at 90 ml.

**Question:** How is tea different?

**Answer:** A tea recipe shows 90 ml per steep, but roughly 30 ml more than that reaches the cup: the machine adds it to trigger the siphon, so a steep lands at about 120 ml. If the siphon triggers early because the leaf has swollen, take volume off the later steeps. Tea recipes are also limited to 3 steeps.
