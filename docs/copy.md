# XBRW++ — user-facing copy

Every piece of English a person reads in the app, in one place. This is the
whole voice of the product, gathered so it can be read as prose, edited, and
handed back for the edits to be applied to source unambiguously.

## How to use this file

- **Edit the `Current text` column only.** Rewrite the wording there. Leave the
  `ID` and `Source` columns exactly as they are.
- **The `ID` is the contract.** Each ID is unique across this file and maps to
  exactly one string in the code. When you hand this back, the ID is what tells
  the implementer which string you changed. If an ID or its source looks wrong,
  say so — do not guess.
- **`Source` is `path/to/file.ts:line`**, with the object key named where the
  string lives inside a literal. Line numbers were accurate at the time of
  writing (branch `m4-watch-it-brew`); if code has moved, re-grep the current
  text before applying.
- **Placeholders** are shown as `${...}`. The surrounding prose explains what
  each one holds. Keep the placeholder token intact when you rewrite — only the
  words around it are yours to change.
- **Accessibility labels and hints are marked `(a11y)`** in the Context column.
  They are spoken by VoiceOver / TalkBack, never drawn on screen. They are part
  of the voice and worth reviewing, but they follow different rules from visible
  copy: they spell things out (`ratio 1 to 16`, not `1:16`) because a screen
  reader would otherwise say "one colon sixteen".

## Voice and style rules the code actually follows

These are conventions observed in the codebase, not aspirations. Breaking one is
usually a mistake, but they are surfaced here so you can change them deliberately.

1. **Two typographic registers, and they carry meaning.**
   `components/DotMatrixText.tsx:108-110` states the rule the component exists to
   enforce: *"Doto is for machine-derived values and system status. Anything a
   human typed — a recipe name, an error message — stays in Inter and must not be
   rendered through here."*
   - **Doto** (the dot-matrix font) is rendered UPPERCASE, with no trailing full
     stop, for machine readouts and system labels: `ML TOTAL`, `AUTO FIX`,
     `WATER`, `NO BREWS YET`, `BREW`, `WRITE`, `SAVE`, `SEND`, `POUR 2 OF 4`.
     When you edit a Doto string, keep it short and caption-like; a sentence with
     punctuation does not belong here.
   - **Inter** (the prose font) is sentence case with full stops on full
     sentences, for anything a person authored or would read as prose: error
     messages, help text, dialog copy, empty-state explanations.
   Some strings appear in both registers deliberately (a Doto caption plus an
   Inter explanation). The **Inconsistencies** section flags where the split has
   drifted.
2. **Toast labels are three fixed words** (`library/notify.ts:45-47`): success
   is `DONE`, error is `ERROR`, info is `NOTE`. Not `SUCCESS` — the comment there
   explains the choice.
3. **Sentence case, not Title Case**, for visible prose and buttons in Inter
   ("Start brewing", "Try again", "Keep this brew"). Doto captions are all-caps.
4. **Ellipsis is the unicode character `…`**, not three dots.
5. **The interpunct `·`** separates fields in dense readouts (`18 g · 1:16`,
   `POUR 2 OF 4 · 0:41`). The degree sign is `°`; the play glyph is `▶`.
6. **Grams:** the editor writes a lowercase `g`; dot-matrix readouts write an
   uppercase `G`. This is a register split, not an error, but it is inconsistent
   enough to note (see Inconsistencies).

---

## System — permissions and app identity

`app.json` strings a user sees at the OS level, and the shared toast labels.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `system.appName` | `app.json:3` (`expo.name`) | App name under the icon and in the app switcher. | `XBRW++` |
| `system.permission.bluetooth` | `app.json:60` (`ios.infoPlist.NSBluetoothAlwaysUsageDescription` via `bluetoothAlwaysPermission`) | iOS system prompt the first time the app uses Bluetooth. | `XBRW++ uses Bluetooth to connect to your xBloom Studio coffee machine so it can send a recipe and start a brew.` |
| `system.permission.nfc` | `app.json:67` (`nfcPermission`) | iOS system prompt the first time the app uses NFC. | `This app uses NFC to read and write xBloom coffee recipe cards held near your iPhone.` |
| `system.toast.done` | `library/notify.ts:45` (`success`) | Label above a success toast. | `DONE` |
| `system.toast.error` | `library/notify.ts:46` (`error`) | Label above an error toast. | `ERROR` |
| `system.toast.note` | `library/notify.ts:47` (`info`) | Label above an informational toast. | `NOTE` |

---

## Home / recipe library

The recipe list (`app/index.tsx`), its empty state, recipe cards, the swipe
tray, and the overflow sheet.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `home.cta.readCard` | `app/index.tsx:474` (a11y) | (a11y) The circular "read a card" button on the home screen. | `Read a card` |
| `home.toast.alreadyInLibrary.open` | `app/index.tsx:220` | Info toast when a shared/imported recipe is already saved and is simply reopened. | `Already in your library` |
| `home.toast.cardRead` | `app/index.tsx:336` | Success toast after a card is read. | `Recipe read from card` |
| `home.toast.holdCard` | `app/index.tsx:337` | Instruction toast shown while waiting for the card. | `Hold the card to the top of the phone.` |
| `home.toast.alreadyInLibrary.read` | `app/index.tsx:371` | Info toast when a just-read card matches a recipe already saved. | `Already in your library` |
| `home.toast.readFailed` | `app/index.tsx:378` | Error toast when a card cannot be read. | `Could not read the card. Please try again.` |
| `home.toast.machineBusy` | `app/index.tsx:420` | Info toast when trying to brew while the machine is already brewing. `${...}` is the running recipe's display name. | `The machine is busy brewing ${liveRun.recipe.displayName()}.` |
| `home.empty.title` | `components/EmptyLibrary.tsx:30` | Heading when the library has no recipes. | `No recipes yet` |
| `home.empty.body` | `components/EmptyLibrary.tsx:33` | Sub-line under the empty-state heading. | `Read a card or import a recipe using the buttons above.` |
| `home.card.marker.tea` | `components/RecipeCard.tsx:151` | Doto marker on a recipe card for tea recipes. | `TEA` |
| `home.card.marker.coffee` | `components/RecipeCard.tsx:151` | Doto marker on a recipe card for coffee recipes (toggleable in Settings). | `COFFEE` |
| `home.card.willNotWrite` | `components/RecipeCard.tsx:263` (a11y) | (a11y) Warning glyph on a card whose grind is too fine to write. | `Will not write` |
| `home.card.stat.dose` | `components/RecipeCard.tsx:270` | Doto stat label on a recipe card. | `DOSE` |
| `home.card.stat.ratio` | `components/RecipeCard.tsx:271` | Doto stat label on a recipe card. | `RATIO` |
| `home.card.stat.grind` | `components/RecipeCard.tsx:272` | Doto stat label on a recipe card (coffee only). | `GRIND` |
| `home.card.a11y.duplicate` | `components/RecipeCard.tsx:186,278` (a11y) | (a11y) Context action / button to duplicate a recipe. | `Duplicate recipe` |
| `home.card.a11y.delete` | `components/RecipeCard.tsx:188,284` (a11y) | (a11y) Context action / button to delete a recipe. | `Delete recipe` |
| `home.card.a11y.brew` | `components/RecipeCard.tsx:190` (a11y) | (a11y) Context action to brew a recipe. | `Brew this recipe` |
| `home.swipe.brew.caption` | `components/SwipeableRecipeRow.tsx:136` | Doto caption on the swipe-tray brew tile. | `BREW` |
| `home.swipe.brew.a11y` | `components/SwipeableRecipeRow.tsx:138` (a11y) | (a11y) Swipe-tray brew tile. `${...}` is the recipe name. | `Brew ${recipe.displayName()}` |
| `home.swipe.duplicate.caption` | `components/SwipeableRecipeRow.tsx` (`caption="COPY"`) | Doto caption on the swipe-tray duplicate tile. | `COPY` |
| `home.swipe.duplicate.a11y` | `components/SwipeableRecipeRow.tsx:146` (a11y) | (a11y) Swipe-tray duplicate tile. `${...}` is the recipe name. | `Duplicate ${recipe.displayName()}` |
| `home.swipe.delete.caption` | `components/SwipeableRecipeRow.tsx` (`caption="DELETE"`) | Doto caption on the swipe-tray delete tile. | `DELETE` |
| `home.swipe.delete.a11y` | `components/SwipeableRecipeRow.tsx:153` (a11y) | (a11y) Swipe-tray delete tile. `${...}` is the recipe name. | `Delete ${recipe.displayName()}` |

### Recipe overflow sheet (`components/RecipeOverflowSheet.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `home.overflow.title` | `components/RecipeOverflowSheet.tsx:80` | Doto title of the per-recipe overflow sheet. | `RECIPE` |
| `home.overflow.hints.label` | `components/RecipeOverflowSheet.tsx` (`"Show hints"`) | Row label for the field-hints toggle. | `Show hints` |
| `home.overflow.hints.hint` | `components/RecipeOverflowSheet.tsx:91` | (a11y hint) / sub-note for the hints toggle. | `Draws a short note under each field's label.` |
| `home.overflow.hints.on` | `components/RecipeOverflowSheet.tsx:108` | Doto state when hints are on. | `ON` |
| `home.overflow.hints.off` | `components/RecipeOverflowSheet.tsx:108` | Doto state when hints are off. | `OFF` |
| `home.overflow.share.label` | `components/RecipeOverflowSheet.tsx:116` | Row label. | `Share` |
| `home.overflow.share.hint` | `components/RecipeOverflowSheet.tsx:118` | Sub-note under Share. | `Creates a link that opens this recipe in the xBloom app.` |
| `home.overflow.duplicate` | `components/RecipeOverflowSheet.tsx:120` | Row label. | `Duplicate` |
| `home.overflow.history.label` | `components/RecipeOverflowSheet.tsx` (`"Brew history"`) | Row label. | `Brew history` |
| `home.overflow.history.hint` | `components/RecipeOverflowSheet.tsx:122` | Sub-note under Brew history. | `Shows every recorded brew of this recipe.` |
| `home.overflow.refresh.label` | `components/RecipeOverflowSheet.tsx` (`"Refresh name from xBloom"`) | Row label. | `Refresh name from xBloom` |
| `home.overflow.refresh.caption` | `components/RecipeOverflowSheet.tsx:129` | Shorter caption for the refresh row. | `Refresh name` |
| `home.overflow.revert` | `components/RecipeOverflowSheet.tsx:131` | Row label. | `Revert` |
| `home.overflow.delete.label` | `components/RecipeOverflowSheet.tsx:136` | Row label. | `Delete` |
| `home.overflow.delete.hint` | `components/RecipeOverflowSheet.tsx` (delete `hint`) | Sub-note under Delete. | `Removes this recipe from the app. This cannot be undone.` |

### Wordmark (`components/Wordmark.tsx`, `components/LivingMark.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brand.wordmark.a11y` | `components/Wordmark.tsx:50` (a11y) | (a11y) The `XBRW++` lockup, announced as one word. | `XBRW++` |
| `brand.wordmark.letters` | `components/Wordmark.tsx:56` | Doto: the letters half of the wordmark. | `XBRW` |
| `brand.wordmark.plus` | `components/Wordmark.tsx:61` | Doto: the `++` half of the wordmark. | `++` |
| `brand.livingMark.a11y` | `components/LivingMark.tsx:306` (a11y) | (a11y) The animated dot-disc mark (About screen). | `XBRW++` |

---

## Recipe editor

`app/editRecipe.tsx` and its stage/field components. Recipe display names come
from `library/Recipe.ts`.

### Header, provenance and display names

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.hero.back` | `components/RecipeHero.tsx:110` (a11y) | (a11y) Back button in the editor header. | `Back` |
| `editor.hero.help` | `components/RecipeHero.tsx:124` (a11y) | (a11y) Help button in the editor header. | `Help` |
| `editor.hero.help.visible` | `components/RecipeHero.tsx:130` | Doto label on the help button. | `HELP` |
| `editor.hero.more` | `components/RecipeHero.tsx:135` (a11y) | (a11y) Overflow ("More") button in the editor header. | `More` |
| `recipe.name.read` | `library/Recipe.ts:311` (`read`) | Placeholder display name for a card-read recipe with no name, joined with a date (e.g. `Read 5 Jan`). | `Read` |
| `recipe.name.import` | `library/Recipe.ts:312` (`import`) | Placeholder display name for an imported recipe with no name, joined with a date. | `Imported` |
| `recipe.name.duplicate` | `library/Recipe.ts:313` (`duplicate`) | Placeholder display name for a duplicated recipe. | `Copy` |
| `recipe.name.manual` | `library/Recipe.ts:314` (`manual`) | Placeholder display name for a manually created recipe with no name. | `Untitled` |
| `recipe.cup.xpod` | `library/Recipe.ts:365` | Cup-type name, xPod. | `xPod` |
| `recipe.cup.omni` | `library/Recipe.ts:367` | Cup-type name, Omni ("overflow protection off"). | `Omni` |
| `recipe.cup.tea` | `library/Recipe.ts:369` | Cup-type name, Tea. | `Tea` |
| `recipe.cup.other` | `library/Recipe.ts:371` | Cup-type name, Other. | `Other` |
| `recipe.cup.unknown` | `library/Recipe.ts:373` | Cup-type name fallback. | `Unknown` |

### Brew-settings deck

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.deck.brew.label` | `components/DeckSwitch.tsx:60` | Doto tab for the brew-settings deck. | `BREW` |
| `editor.deck.brew.a11y` | `components/DeckSwitch.tsx:60` (a11y) | (a11y) Brew-settings tab. | `Brew settings` |
| `editor.deck.stages.label` | `components/DeckSwitch.tsx:61` | Doto tab for the stages deck. `${...}` is the stage count. | `STAGES · ${stageCount}` |
| `editor.deck.stages.a11y` | `components/DeckSwitch.tsx:61` (a11y) | (a11y) Stages tab. `${...}` is the stage count. | `Stages, ${stageCount}` |
| `editor.field.grind.display` | `app/editRecipe.tsx:257` | Doto readout of the current grind size. `${...}` is the number. | `GRIND ${recipe.grindSize}` |
| `editor.field.grind.tooFine` | `app/editRecipe.tsx:261` | Warning shown when the grind is below the minimum a card can store. `${CARD_GRIND_MIN}` is 40. | `A card cannot store a grind below ${CARD_GRIND_MIN}.` |
| `editor.field.grind.tooFine.imported` | `app/editRecipe.tsx:262` | Variant shown for an imported recipe ground finer than a card allows. First `${...}` is a human band label; `${CARD_GRIND_MIN}` is 40. | `Ground for ${fineBand.longLabel}. A card cannot store a grind below ${CARD_GRIND_MIN}.` |
| `editor.field.grind.setTo.a11y` | `app/editRecipe.tsx:266` (a11y) | (a11y) Button that raises the grind to the minimum. `${CARD_GRIND_MIN}` is 40. | `Set grind size to ${CARD_GRIND_MIN}` |
| `editor.field.grind.setTo` | `app/editRecipe.tsx:271` | Doto label on that button. `${CARD_GRIND_MIN}` is 40. | `SET TO ${CARD_GRIND_MIN}` |
| `editor.field.mlTotal` | `app/editRecipe.tsx:232` | Doto caption under the target-volume figure. | `ML TOTAL` |
| `editor.cup.xpod` | `app/editRecipe.tsx:45` (`CUP_OPTIONS`) | Doto segment for the xPod cup type. | `XPOD` |
| `editor.cup.omni` | `app/editRecipe.tsx:46` (`CUP_OPTIONS`) | Doto segment for the Omni cup type. | `OMNI` |
| `editor.cup.other` | `app/editRecipe.tsx:47` (`CUP_OPTIONS`) | Doto segment for the Other cup type. | `OTHER` |
| `editor.grinder.on` | `app/editRecipe.tsx:51` (`GRINDER_OPTIONS`) | Doto segment, grinder on. | `ON` |
| `editor.grinder.off` | `app/editRecipe.tsx:52` (`GRINDER_OPTIONS`) | Doto segment, grinder off. | `OFF` |
| `editor.field.recipeId.label` | `app/editRecipe.tsx:348` | Label of the Recipe ID field. | `Recipe ID` |
| `editor.field.recipeId.invalid` | `app/editRecipe.tsx:352` | Validation message under the Recipe ID field. | `Not a valid ID: three letters, an optional T, then two or three digits, like CGL12.` |
| `editor.field.name.label` | `app/editRecipe.tsx:356` | Label of the Name field. | `Name` |

### Stepper fields (`components/Stepper.tsx`, `hooks/useRecipeEditor.ts`)

Steppers draw a label, and speak `${label}, ${value} ${unit}`. The spoken labels
come from `hooks/useRecipeEditor.ts`.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.stepper.value.a11y` | `components/Stepper.tsx:182` (a11y) | (a11y) The value display. `${...}` are the field label, value and unit. | `${label}, ${value} ${unit}` |
| `editor.stepper.decrease.a11y` | `components/Stepper.tsx:192` (a11y) | (a11y) Decrement button. `${label}` is the field name. | `Decrease ${label}` |
| `editor.stepper.edit.a11y` | `components/Stepper.tsx:228` (a11y) | (a11y) Tap-to-type affordance. | `Edit ${label}` |
| `editor.stepper.increase.a11y` | `components/Stepper.tsx:239` (a11y) | (a11y) Increment button. | `Increase ${label}` |

### Stages

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.stage.a11y` | `components/StageTile.tsx:111` (a11y) | (a11y) A stage tile. `${...}` are the stage index and total. | `Stage ${index + 1} of ${count}` |
| `editor.stage.agitate.before` | `components/StageTile.tsx:248` (a11y, `spoken`) | (a11y) Spoken form of the before-pour agitation toggle. | `Agitate before` |
| `editor.stage.agitate.after` | `components/StageTile.tsx:255` (a11y, `spoken`) | (a11y) Spoken form of the after-pour agitation toggle. | `Agitate after` |
| `editor.stage.agitate.before.label` | `components/StageTile.tsx:247` (`label`) | Doto label on the before-pour agitation toggle. | `BEFORE` |
| `editor.stage.agitate.after.label` | `components/StageTile.tsx:254` (`label`) | Doto label on the after-pour agitation toggle. | `AFTER` |
| `editor.stage.delete.a11y` | `components/StageTile.tsx:266` (a11y) | (a11y) Delete-stage button. `${...}` is the stage index. | `Delete stage ${index + 1}` |
| `editor.stage.delete.label` | `components/StageTile.tsx:273` | Doto label on the delete-stage button. | `REMOVE` |
| `editor.stages.balance` | `app/editRecipe.tsx:489` | Doto readout of poured vs target volume. `${...}` are millilitre totals. | `${balance.poured} OF ${balance.target} ML` |
| `editor.stages.mismatch` | `app/editRecipe.tsx:492` | Prose warning when stage volumes do not sum to the target. | `The machine rejects a recipe whose stages do not add up to the dose times the ratio.` |
| `editor.stages.autoFix.a11y` | `app/editRecipe.tsx:496` (a11y) | (a11y) The Auto fix button. | `Auto fix` |
| `editor.stages.autoFix.label` | `app/editRecipe.tsx:501` | Doto label on the Auto fix button. | `AUTO FIX` |
| `editor.stages.add.a11y` | `app/editRecipe.tsx:531` (a11y) | (a11y) The add-stage button. | `Add stage` |
| `editor.stages.add.label` | `app/editRecipe.tsx:545` | Doto label on the add-stage button. | `+ ADD STAGE` |
| `editor.tea.banner.title` | `components/TeaBanner.tsx:23` | Doto title of the tea explainer banner. | `TEA` |
| `editor.tea.banner.body` | `components/TeaBanner.tsx:26` | Prose body of the tea explainer banner. | `Tea stages are capped at 90 ml each and the grinder is not used. The siphon draws roughly 30 ml more than the recipe asks for, so a cup finishes fuller than the numbers here.` |

### Editor action bar

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.action.brew.a11y` | `app/editRecipe.tsx:610` (a11y) | (a11y) Brew button in the editor action bar. | `Brew` |
| `editor.action.brew.label` | `app/editRecipe.tsx:616` | Doto label on the Brew button. | `BREW` |
| `editor.action.write.a11y` | `app/editRecipe.tsx:623` (a11y) | (a11y) Write-card button. | `Write card` |
| `editor.action.write.label` | `app/editRecipe.tsx:635` | Doto label on the Write button. | `WRITE` |
| `editor.action.save.a11y` | `app/editRecipe.tsx:641` (a11y) | (a11y) Save button. | `Save` |
| `editor.action.save.label` | `app/editRecipe.tsx:647` | Doto label on the Save button. | `SAVE` |

### Editor toasts and errors

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.share.network` | `app/editRecipe.tsx:749` (`network`) | Share failed: no network. | `Could not reach the sharing service. Check your connection.` |
| `editor.share.limited` | `app/editRecipe.tsx:750` (`limited`) | Share failed: rate limited. | `Sharing is busy right now. Try again in a few minutes.` |
| `editor.share.unavailable` | `app/editRecipe.tsx:751` (`unavailable`) | Share failed: service down. | `Sharing is temporarily unavailable. Everything else still works.` |
| `editor.share.unusable` | `app/editRecipe.tsx:752` (`unusable`) | Share failed: recipe is not shareable yet. | `This recipe cannot be shared yet. Check the pour volumes and dose.` |
| `editor.share.pending` | `app/editRecipe.tsx:753` (`pending`) | Share failed: link still being created. | `This recipe's link is still being created. Try again in a moment.` |
| `editor.toast.duplicateFailed` | `app/editRecipe.tsx:817` | Error toast when duplication fails. | `Could not duplicate the recipe.` |
| `editor.toast.deleteFailed` | `app/editRecipe.tsx:878` | Error toast when deletion fails. | `Could not delete the recipe.` |
| `editor.toast.saveFailed` | `app/editRecipe.tsx:992` | Error toast when saving fails. | `Could not save the recipe.` |
| `editor.toast.teaPourLimit` | `hooks/useRecipeEditor.ts:154` | Info toast when adding a 4th tea pour. | `Tea recipes are limited to 3 pours.` |
| `editor.toast.restored.nfc` | `hooks/useRecipeEditor.ts:241` | Success toast after restoring from the on-card backup. | `Recipe restored from the NFC backup.` |
| `editor.toast.restored.offline` | `hooks/useRecipeEditor.ts:248` | Success toast after restoring from the offline backup. | `Recipe restored from the offline backup.` |
| `editor.toast.restored.xid` | `hooks/useRecipeEditor.ts:259` | Success toast after re-fetching by recipe ID. | `Recipe restored from the XID.` |
| `editor.toast.restored.share` | `hooks/useRecipeEditor.ts:272` | Success toast after re-fetching from the share link. | `Recipe restored from the share link.` |

### Help sheet / field help (`components/HelpSheet.tsx`, `constants/recipeHelp.ts`)

The help sheet is titled `Help`. Its body and every field label/hint come from
`constants/recipeHelp.ts` (`RECIPE_HELP`). Titles are field labels drawn on the
row; hints are the short notes under them; questions head the long form; details
are the long form. Some `detail` strings are concatenated across several source
lines — the cited line is the property's first line.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `help.sheet.title` | `components/HelpSheet.tsx:39` | Title of the help sheet. | `Help` |
| `help.dose.title` | `constants/recipeHelp.ts:45` | Dose field label. | `Dose` |
| `help.ratio.title` | `constants/recipeHelp.ts:48` | Ratio field label. | `Ratio` |
| `help.ratio.hint` | `constants/recipeHelp.ts:49` | Ratio field hint. | `Whole numbers only. Sets the target volume.` |
| `help.ratio.question` | `constants/recipeHelp.ts:50` | Ratio help-sheet heading. | `What does the ratio set?` |
| `help.ratio.detail` | `constants/recipeHelp.ts:51` | Ratio long-form help. | `The target volume is the dose multiplied by the ratio. The stage volumes have to add up to it exactly or the machine will refuse the card. Half ratios cannot be stored on a card.` |
| `help.grindSize.title` | `constants/recipeHelp.ts:56` | Grind size field label. | `Grind size` |
| `help.grindSize.hint` | `constants/recipeHelp.ts:57` | Grind size field hint. | `40 to 80. Lower is finer.` |
| `help.grindSize.question` | `constants/recipeHelp.ts:58` | Grind size help-sheet heading. | `What do the grind numbers mean?` |
| `help.grindSize.detail` | `constants/recipeHelp.ts:59` | Grind size long-form help. | `40 to 55 is the pourover range, and 56 to 80 suits a French press or cold brew. Lower is finer. The xBloom app shows a 1 to 80 scale, which is the grinder's own range and includes espresso and Aeropress grinds; a recipe card stores the grind as an offset from 40, so it cannot carry anything finer than that. Those finer bands are the ones you would grind for and then brew somewhere else. An imported recipe can hold one, and the editor will offer to coarsen it.` |
| `help.grindSpeed.title` | `constants/recipeHelp.ts:69` | Grind speed field label. | `Grind speed` |
| `help.grindSpeed.hint` | `constants/recipeHelp.ts:70` | Grind speed field hint. | `60 to 120 rpm, in tens.` |
| `help.grinder.title` | `constants/recipeHelp.ts:73` | Grinder field label. | `Grinder` |
| `help.grinder.hint` | `constants/recipeHelp.ts:74` | Grinder field hint. | `Turning it off is experimental.` |
| `help.grinder.question` | `constants/recipeHelp.ts:75` | Grinder help-sheet heading. | `Can I turn the grinder off?` |
| `help.grinder.detail` | `constants/recipeHelp.ts:76` | Grinder long-form help. Note: says grind size **81** disables the grinder. | `Turning the grinder off writes grind size 81, one past the maximum, and the machine will refuse a card in that state outright. The workaround is to load any other recipe with the grinder enabled first: a shortcut button, another card, or the xBloom app. After which this card will be accepted and the machine will show '--' for the grind size. There is no better way to disable the grinder from a recipe card.` |
| `help.cup.title` | `constants/recipeHelp.ts:86` | Cup field label. | `Cup` |
| `help.cup.hint` | `constants/recipeHelp.ts:87` | Cup field hint. | `Omni turns overflow protection off.` |
| `help.cup.question` | `constants/recipeHelp.ts:88` | Cup help-sheet heading. | `Which cup type should I pick?` |
| `help.cup.detail` | `constants/recipeHelp.ts:89` | Cup long-form help. | `Omni disables overflow protection. Other is for third-party brewers.` |
| `help.xid.title` | `constants/recipeHelp.ts:93` | Recipe ID field label. | `Recipe ID` |
| `help.xid.hint` | `constants/recipeHelp.ts:94` | Recipe ID field hint. | `xBloom online lookup ID. Without one, a written card reads back nameless (but works the same).` |
| `help.xid.question` | `constants/recipeHelp.ts:96` | Recipe ID help-sheet heading. | `What is the recipe ID for?` |
| `help.xid.detail` | `constants/recipeHelp.ts:97` | Recipe ID long-form help. | `The recipe ID is how the app finds a recipe online. It is a three-letter vendor code, an optional T for tea, then two or three digits, like CGL12 or CGLT123. The card stores this ID and not the name, so a card written without one will read back nameless. Changing or clearing it stops the wrong recipe being shown in the app; the machine brews the same either way.` |
| `help.name.title` | `constants/recipeHelp.ts:105` | Name field label. | `Name` |
| `help.name.hint` | `constants/recipeHelp.ts:106` | Name field hint. | `For your own organization in this app. The xBloom name is kept separate, derived from the XID.` |
| `help.volume.title` | `constants/recipeHelp.ts:110` | Stage volume field label. | `Stage volume` |
| `help.volume.hint` | `constants/recipeHelp.ts:111` | Stage volume field hint. | `All stages together must equal the target.` |
| `help.volume.question` | `constants/recipeHelp.ts:112` | Stage volume help-sheet heading. | `Why must the stage volumes add up?` |
| `help.volume.detail` | `constants/recipeHelp.ts:113` | Stage volume long-form help. | `The machine checks the stage volumes against the dose times the ratio and refuses the card if they differ. Auto fix rescales every stage to close the gap and spreads the rounding error across the stages it fits worst. Manually assigning volumes to stages is recommended. Changing the dose or the ratio moves the target instead of the stages, which is also often a better fix.` |
| `help.temperature.title` | `constants/recipeHelp.ts:122` | Temperature field label. | `Temperature` |
| `help.temperature.hint` | `constants/recipeHelp.ts:123` | Temperature field hint. `${...}` are the °C/°F ranges. | `${CELSIUS_RANGE.min} to ${CELSIUS_RANGE.max} °C, or ${FAHRENHEIT_RANGE.min} to ${FAHRENHEIT_RANGE.max} °F.` |
| `help.flowRate.title` | `constants/recipeHelp.ts:127` | Flow rate field label. | `Flow rate` |
| `help.flowRate.hint` | `constants/recipeHelp.ts:128` | Flow rate field hint. | `3.0 to 3.5 ml per second.` |
| `help.pause.title` | `constants/recipeHelp.ts:131` | Pause field label. | `Pause` |
| `help.pause.hint` | `constants/recipeHelp.ts:132` | Pause field hint. | `How long the machine waits once this stage has poured.` |
| `help.pause.question` | `constants/recipeHelp.ts:133` | Pause help-sheet heading. | `Does the pause come before or after the pour?` |
| `help.pause.detail` | `constants/recipeHelp.ts:134` | Pause long-form help. | `The wait comes after the water, not before it: this is the bloom on a first stage and the steep on a tea one, which is why a coffee stage stops at 59 seconds and a tea steep goes to 360.` |
| `help.pattern.title` | `constants/recipeHelp.ts:140` | Pattern field label. | `Pattern` |
| `help.pattern.hint` | `constants/recipeHelp.ts:141` | Pattern field hint. | `The path the water takes over the bed.` |
| `help.pattern.question` | `constants/recipeHelp.ts:142` | Pattern help-sheet heading. | `What do the pour patterns do?` |
| `help.pattern.detail` | `constants/recipeHelp.ts:143` | Pattern long-form help. | `Centered holds the stream in one place. Circular walks it round the bed at a fixed radius. Spiral works outward from the middle.` |
| `help.agitation.title` | `constants/recipeHelp.ts:148` | Agitation field label. | `Agitation` |
| `help.agitation.hint` | `constants/recipeHelp.ts:149` | Agitation field hint. | `Shakes the basket, before this stage's pour or after it.` |
| `help.agitation.question` | `constants/recipeHelp.ts:150` | Agitation help-sheet heading. | `What does agitation do?` |
| `help.agitation.detail` | `constants/recipeHelp.ts:151` | Agitation long-form help. | `Each stage can agitate, or shake the bed of coffee slightly before it pours, after it pours, both or neither. Agitation might provide a flatter, more evenly distributed bed of coffee but might also contribute to fines migration and slower drawdown.` |
| `help.tea.title` | `constants/recipeHelp.ts:158` | Tea field label. | `Tea` |
| `help.tea.hint` | `constants/recipeHelp.ts:159` | Tea field hint. | `Steeps are capped at 90 ml.` |
| `help.tea.question` | `constants/recipeHelp.ts:160` | Tea help-sheet heading. | `How is tea different?` |
| `help.tea.detail` | `constants/recipeHelp.ts:161` | Tea long-form help. | `A tea recipe shows 90 ml per steep, but roughly 30 ml more than that reaches the cup: the machine adds it to trigger the siphon, so a steep lands at about 120 ml. If the siphon triggers early because the leaf has swollen, take volume off the later steeps. Tea recipes are also limited to 3 steeps.` |

---

## Import

The import sheet (`components/ImportSheet.tsx`), its result panel
(`components/ImportResult.tsx`), and the lookup failures from
`hooks/useRecipeImport.ts`.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `import.sheet.title` | `components/ImportSheet.tsx:164` | Title of the import sheet. | `Import` |
| `import.field.label` | `components/ImportSheet.tsx:14` (`FIELD_LABEL`) | Label above the paste field. | `Share link or pod code` |
| `import.field.hint` | `components/ImportSheet.tsx:15` (`FORMAT_HINT`) | Format hint under the field (shown when idle). | `Paste an xBloom share link, or a pod code like ETH120.` |
| `import.paste.label` | `components/ImportSheet.tsx:37` | Doto label on the paste button. | `PASTE` |
| `import.paste.a11y` | `components/ImportSheet.tsx:212` (a11y) | (a11y) The paste button. | `Paste from clipboard` |
| `import.resolving` | `components/ImportSheet.tsx:226` | Status text while a code/link is being looked up. | `Looking it up…` |
| `import.result.figure.a11y` | `components/ImportResult.tsx:50` (a11y) | (a11y) The grouped dose/ratio/stages figures. `${...}` hold dose grams, ratio and stage count. | `${recipe.dosage} grams, ratio 1 to ${recipe.ratio}, ${recipe.pours.length} stages` |
| `import.result.stat.dose` | `components/ImportResult.tsx:132` | Doto figure label. | `DOSE` |
| `import.result.stat.ratio` | `components/ImportResult.tsx:133` | Doto figure label. | `RATIO` |
| `import.result.stat.stages` | `components/ImportResult.tsx:134` | Doto figure label. | `STAGES` |
| `import.result.existing.named.a11y` | `components/ImportResult.tsx:149` (a11y) | (a11y) Note when the imported recipe already exists under a custom name. `${customName}` is that name. | `Already in your library as ${customName}` |
| `import.result.existing.named` | `components/ImportResult.tsx:150` | Visible note when the recipe already exists under a custom name. `${customName}` is that name (quoted). | `Already in your library as "${customName}"` |
| `import.result.existing.plain` | `components/ImportResult.tsx:154` | Visible note when the recipe already exists. | `Already in your library` |
| `import.result.tooFine` | `components/ImportResult.tsx:161` | Note when the imported recipe is ground too fine to write to a card. `${...}` is a human band label. | `Ground for ${fineBand.longLabel}. You will need to coarsen it to write a card.` |
| `import.result.open.a11y` | `components/ImportResult.tsx:168` (a11y) | (a11y) The open/import action. `${name}` is the recipe name. | `Open ${name}` |
| `import.result.button.open` | `components/ImportResult.tsx:182` | Doto label when the recipe already exists (opens it). | `OPEN` |
| `import.result.button.import` | `components/ImportResult.tsx:182` | Doto label when the recipe is new (imports it). | `IMPORT` |
| `import.error.network` | `hooks/useRecipeImport.ts:294` (`network`) | Lookup failed: no connection. | `Couldn't reach xBloom. Check your connection.` |
| `import.error.notFound` | `hooks/useRecipeImport.ts:304` (`notFound`) | Lookup failed: no such code. | `No recipe with that code.` |
| `import.error.unusable` | `hooks/useRecipeImport.ts:315` (`unusable`) | Lookup succeeded but the recipe cannot be used. | `That recipe can't be used here.` |

Note: `components/ImportResult.tsx:87` renders `preview.subtitle`, which is
dynamic text fetched from xBloom (`hooks/useRecipeImport.ts:348`,
`xb.getSubtitle()`) — not an app-authored string, so not edited here.

---

## Brewing — phases

The brew screen (`app/brew.tsx`) and the phase copy it draws from
`constants/brewCopy.ts` (`PHASE_COPY`), plus the live stage card
(`components/BrewNowCard.tsx`) and pour/agitation sentences.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brew.close.a11y` | `app/brew.tsx:148` (a11y) | (a11y) Close button on the brew screen. | `Close` |
| `brew.phase.idle` | `constants/brewCopy.ts:6` (`idle`) | Phase line before anything starts. | `Ready when you are.` |
| `brew.phase.connecting` | `constants/brewCopy.ts:15` (`connecting`) | Phase line while connecting. | `Connecting to the machine…` |
| `brew.phase.waking` | `constants/brewCopy.ts:18` (`waking`) | Phase line while waiting for the machine to answer. | `Waiting for the machine to answer…` |
| `brew.phase.sending` | `constants/brewCopy.ts:21` (`sending`) | Phase line while the recipe uploads. | `Sending the recipe… this takes a few seconds.` |
| `brew.phase.readyToStart` | `constants/brewCopy.ts:22` (`readyToStart`) | Phase line once the recipe is loaded and the machine waits for you. | `Recipe loaded. Ready when you are.` |
| `brew.phase.armed` | `constants/brewCopy.ts:23` (`armed`) | Phase line once the recipe is loaded (auto-start on). | `Recipe loaded.` |
| `brew.phase.pressPlay` | `constants/brewCopy.ts:27` (`pressPlay`) | Doto prompt to press play on the machine. `▶` is the play glyph. | `PRESS ▶ ON THE MACHINE` |
| `brew.phase.grinding` | `constants/brewCopy.ts:28` (`grinding`) | Phase line while grinding. | `Grinding…` |
| `brew.phase.done` | `constants/brewCopy.ts:29` (`done`) | Phase line when the brew finishes. | `Enjoy.` |
| `brew.phase.cancelled` | `constants/brewCopy.ts:30` (`cancelled`) | Phase line after cancelling. | `Stopped.` |
| `brew.phase.lostContact` | `constants/brewCopy.ts:31` (`lostContact`) | Phase line when the link drops mid-brew. | `Lost contact. The machine is still brewing.` |
| `brew.headline.fallback` | `app/brew.tsx:121` | Generic headline if no phase-specific copy applies. | `The brew did not start.` |
| `brew.action.start` | `app/brew.tsx:239` | Button to start brewing. | `Start brewing` |
| `brew.action.cancel` | `app/brew.tsx:242` | Button to cancel a running brew. | `Cancel` |
| `brew.action.tryAgain` | `app/brew.tsx:257` | Button to retry after a failure. | `Try again` |
| `brew.action.switchToPro` | `app/brew.tsx:261` | Button offered when the machine is in Easy mode. | `Switch to PRO` |
| `brew.action.export` | `app/brew.tsx:265` | Button to export the finished brew. | `Export this brew` |
| `brew.firstBrewReminder` | `constants/brewCopy.ts:85` (`FIRST_BREW_REMINDER`); shown `app/brew.tsx:221` | Shown once, on a user's first brew. | `Check there is a cup under the spout and a pod in the holder.` |
| `brew.proModePrompt` | `constants/brewCopy.ts:89` (`PRO_MODE_PROMPT`); shown `app/brew.tsx:224` | Shown when a send stalled because the machine is in Easy mode. | `Your machine is in Easy mode. Switch it to Pro and try again?` |
| `brew.now.pattern.centered` | `components/BrewNowCard.tsx:25` (`PATTERN_WORD`) | Doto pattern word in the live stage heading. | `CENTRED` |
| `brew.now.pattern.circular` | `components/BrewNowCard.tsx:26` (`PATTERN_WORD`) | Doto pattern word. | `CIRCULAR` |
| `brew.now.pattern.spiral` | `components/BrewNowCard.tsx:27` (`PATTERN_WORD`) | Doto pattern word. | `SPIRAL` |
| `brew.now.pattern.agitation` | `components/BrewNowCard.tsx:28` (`PATTERN_WORD`) | Doto pattern word. | `AGITATION` |
| `brew.now.heading` | `components/BrewNowCard.tsx:43` | Doto heading for the live stage. `${...}` are RESTING/POURING, the pattern word and the temperature. | `${resting ? "RESTING" : "POURING"} · ${PATTERN_WORD[kind]} · ${temperature}°` |
| `brew.pattern.centered` | `constants/brewCopy.ts:134` (`PATTERN_SENTENCE.centered`) | Prose clause describing the centred pour. | `Straight down onto the middle of the bed` |
| `brew.pattern.circular` | `constants/brewCopy.ts:135` (`PATTERN_SENTENCE.circular`) | Prose clause describing the circular pour. | `Round the bed in a steady ring` |
| `brew.pattern.spiral` | `constants/brewCopy.ts:136` (`PATTERN_SENTENCE.spiral`) | Prose clause describing the spiral pour. | `Out from the centre and back` |
| `brew.pattern.agitation` | `constants/brewCopy.ts:145` (`PATTERN_SENTENCE.agitation`) | Prose clause (unreachable in normal use; kept for totality). | `It stirs the bed rather than pouring` |
| `brew.agitation.before` | `constants/brewCopy.ts:157` (`AGITATION_SENTENCE`, BEFORE_ON_AFTER_OFF) | Appended to the stage description when it stirs first. | `It stirs the bed first.` |
| `brew.agitation.after` | `constants/brewCopy.ts:158` (`AGITATION_SENTENCE`, BEFORE_OFF_AFTER_ON) | Appended when it stirs afterwards. | `It stirs the bed afterwards.` |
| `brew.agitation.both` | `constants/brewCopy.ts:159` (`AGITATION_SENTENCE`, BEFORE_ON_AFTER_ON) | Appended when it stirs before and after. | `It stirs the bed before and after.` |

Note: `components/PourGlyph.tsx:27-32` also holds a11y labels for the pour
glyphs — `Centred pour`, `Circular pour`, `Spiral pour`, `Agitation` — spoken
where a pour icon appears.

---

## Brewing — failures and pre-flight refusals

Failure lines (`FAILURE_COPY`) and pre-flight refusal headlines
(`BLOCKED_HEADLINE`, `blockedWaterCopy`) from `constants/brewCopy.ts`, plus the
mid-brew block messages from `library/machine/Machine.ts` that surface as the
phase detail. These are variants of one another; kept adjacent so the wording
can be kept parallel.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brew.failure.noWater` | `constants/brewCopy.ts:37` (`noWater`) | Brew failed: out of water. | `The machine ran out of water.` |
| `brew.failure.noBeans` | `constants/brewCopy.ts:38` (`noBeans`) | Brew failed: stopped during grinding. | `The machine stopped during grinding. Check there are beans in the hopper.` |
| `brew.failure.gearPosition` | `constants/brewCopy.ts:39` (`gearPosition`) | Brew failed: grinder gear position. | `The grinder could not find its gear position.` |
| `brew.failure.doseMismatch` | `constants/brewCopy.ts:40` (`doseMismatch`) | Brew failed: dose/volume refused. | `The machine would not accept that dose and water volume.` |
| `brew.failure.idling` | `constants/brewCopy.ts:41` (`idling`) | Brew failed: went idle before starting. | `The machine went idle before the brew started.` |
| `brew.failure.rejected` | `constants/brewCopy.ts:42` (`rejected`) | Brew failed: recipe refused. | `The machine would not take the recipe.` |
| `brew.blocked.water.body` | `constants/brewCopy.ts:53` (`blockedWaterCopy`) | Refusal detail when the tank cannot cover the recipe. `${totalMl}` is the recipe's total volume. | `The tank will not cover this recipe's ${totalMl} ml. Fill it and try again. No recipe was sent. Your dose is still in the hopper.` |
| `brew.blocked.water.headline` | `constants/brewCopy.ts:57` (`BLOCKED_WATER_HEADLINE`) | Doto headline for the not-enough-water refusal. | `NOT ENOUGH WATER FOR THIS BREW` |
| `brew.blocked.headline.notConnected` | `constants/brewCopy.ts:69` (`notConnected`) | Doto headline: machine not connected. | `THE MACHINE IS NOT CONNECTED` |
| `brew.blocked.headline.noVitals` | `constants/brewCopy.ts:70` (`noVitals`) | Doto headline: machine has not answered. | `THE MACHINE HAS NOT ANSWERED YET` |
| `brew.blocked.headline.noWater` | `constants/brewCopy.ts:71` (`noWater`) | Doto headline: tank empty. | `THE MACHINE'S TANK IS EMPTY` |
| `brew.blocked.headline.noBeans` | `constants/brewCopy.ts:72` (`noBeans`) | Doto headline: hopper empty. | `THE HOPPER IS EMPTY` |
| `brew.blocked.headline.busy` | `constants/brewCopy.ts:73` (`busy`) | Doto headline: machine busy. | `THE MACHINE IS BUSY` |
| `brew.blocked.headline.recipe` | `constants/brewCopy.ts:74` (`recipe`) | Doto headline: recipe cannot go on a card. | `THIS RECIPE WILL NOT GO ON A CARD` |
| `brew.blocked.detail.noWater` | `library/machine/Machine.ts:105` | Detail when the machine reports an empty tank. | `The machine's water tank is empty. Fill it and try again.` |
| `brew.blocked.detail.noBeans` | `library/machine/Machine.ts:109` | Detail when the machine is waiting for beans. | `The machine is waiting for beans. Fill the hopper and try again.` |
| `brew.blocked.detail.inUse` | `library/machine/Machine.ts:302` | Surfaced when the machine is claimed by another app. | `The machine is already in use by another app.` |
| `brew.blocked.detail.notConnected` | `library/machine/Machine.ts:637` | Detail when not connected. | `The machine is not connected.` |
| `brew.blocked.detail.noVitals` | `library/machine/Machine.ts:647` | Detail when the machine has not reported status. | `The machine has not said how it is doing yet. Reconnect and try again.` |
| `brew.blocked.detail.waterLow` | `library/machine/Machine.ts:651` | Detail when the tank is low. | `The machine's water tank is low.` |
| `brew.blocked.detail.busy` | `library/machine/Machine.ts:660` | Detail when the machine is busy. | `The machine is busy. Wait for it to finish.` |
| `brew.blocked.detail.noRecipe` | `library/machine/Machine.ts:799` | Surfaced when there is no recipe queued to start. | `There is no recipe waiting to be started.` |
| `brew.rejected.fallback` | `app/brew.tsx:216` | Fallback headline when the machine refuses the brew and no reason is given. | `The machine would not take this brew.` |

---

## Brew — live bar and mini bar

The persistent live brew bar (`components/LiveBrewBar.tsx` →
`components/BrewMiniBar.tsx`) and its readouts. `MINI_FAILURE_WHY` is from
`constants/brewCopy.ts`.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brew.mini.open.a11y` | `components/BrewMiniBar.tsx:130` (a11y) | (a11y) Tap target that opens the full brew screen. | `Open the brew` |
| `brew.mini.dismiss.a11y` | `components/BrewMiniBar.tsx:163` (a11y) | (a11y) Dismiss button on the mini bar. | `Dismiss` |
| `brew.mini.didNotStart.title` | `components/BrewMiniBar.tsx:50` | Mini-bar title when nothing was sent. | `Did not start` |
| `brew.mini.didNotStart.detail` | `components/BrewMiniBar.tsx:51` | Doto detail when nothing was sent. | `NOTHING WAS SENT · TAP TO SEE WHY` |
| `brew.mini.stopped.title` | `components/BrewMiniBar.tsx:64` | Mini-bar title after stopping. `${why}` is one of the reasons below. | `Stopped: ${why}` |
| `brew.mini.stopped.detail` | `components/BrewMiniBar.tsx:65` | Doto detail after stopping. | `KEPT IN YOUR BREW HISTORY` |
| `brew.mini.why.youStopped` | `components/BrewMiniBar.tsx:59` | "Why" clause: user cancelled. | `you stopped it` |
| `brew.mini.why.lostContact` | `components/BrewMiniBar.tsx:61` | "Why" clause: link lost. | `lost contact` |
| `brew.mini.why.fallback` | `components/BrewMiniBar.tsx:62` | "Why" clause fallback. | `the machine stopped` |
| `brew.miniWhy.noWater` | `constants/brewCopy.ts:119` (`noWater`) | Short "why" for the mini bar. | `no water` |
| `brew.miniWhy.noBeans` | `constants/brewCopy.ts:120` (`noBeans`) | Short "why". | `no beans` |
| `brew.miniWhy.gearPosition` | `constants/brewCopy.ts:121` (`gearPosition`) | Short "why". | `the grinder jammed` |
| `brew.miniWhy.doseMismatch` | `constants/brewCopy.ts:122` (`doseMismatch`) | Short "why". | `the dose was refused` |
| `brew.miniWhy.idling` | `constants/brewCopy.ts:123` (`idling`) | Short "why". | `it went idle` |
| `brew.miniWhy.rejected` | `constants/brewCopy.ts:124` (`rejected`) | Short "why". | `the recipe was refused` |
| `brew.mini.ready.title` | `components/BrewMiniBar.tsx:73` | Mini-bar title when the brew is done and ready. | `Ready` |
| `brew.mini.ready.detail` | `components/BrewMiniBar.tsx:74` | Doto detail when ready. `${...}` are cup grams and clock. | `${cup} G · ${clock(elapsed)} · TAP TO SEE IT` |
| `brew.mini.waiting.title` | `components/BrewMiniBar.tsx:81` | Mini-bar title while waiting for the cup. | `Waiting for the cup` |
| `brew.mini.waiting.detail` | `components/BrewMiniBar.tsx:82` | Doto detail while waiting. `${...}` is held seconds. | `+${Math.round(heldSeconds)} S · CARRIES ON BY ITSELF` |
| `brew.mini.pouring.title` | `components/BrewMiniBar.tsx:88` | Mini-bar title while pouring. `${...}` is the recipe name. | `${recipeName}` |
| `brew.mini.pouring.detail` | `components/BrewMiniBar.tsx:90` | Doto detail while pouring. `${...}` are pour number, total and clock. | `POUR ${phase.pour} OF ${phase.pours} · ${clock(elapsed)}` |
| `brew.mini.grinding.title` | `components/BrewMiniBar.tsx:96` | Mini-bar title while grinding. | `Grinding` |
| `brew.mini.grinding.detail` | `components/BrewMiniBar.tsx:96` | Doto detail while grinding. `${...}` are the pattern word (uppercased) and dose grams. | `${upper} · ${dose} G` |

---

## Brew — figures, trace and stage ladder

Shared readouts on the brew screen and record (`components/BrewFigures.tsx`,
`components/BrewTrace.tsx`, `components/BrewStageRung.tsx`).

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brew.figures.water` | `components/BrewFigures.tsx:43` | Doto figure label. | `WATER` |
| `brew.figures.cup` | `components/BrewFigures.tsx:44` | Doto figure label. | `CUP` |
| `brew.figures.time` | `components/BrewFigures.tsx:45` | Doto figure label. | `TIME` |
| `brew.trace.a11y` | `components/BrewTrace.tsx:111,152` (a11y) | (a11y) The brew trace graph. | `Brew trace` |
| `brew.trace.legend.water` | `components/BrewTrace.tsx:218` | Doto legend item. | `WATER` |
| `brew.trace.legend.cup` | `components/BrewTrace.tsx:219` | Doto legend item. | `CUP` |
| `brew.trace.legend.plan` | `components/BrewTrace.tsx:221` | Doto legend item. | `PLAN` |
| `brew.trace.overrun` | `components/BrewTrace.tsx:228` | Doto overrun label. `${overrun}` is seconds over plan. | `+${overrun} S` |
| `brew.rung.a11y` | `components/BrewStageRung.tsx:47,70` (a11y) | (a11y) A stage row on the ladder, composed from parts. `${...}` describe the stage, pattern, temperature, volume, pause, agitation and any holds. | `${stage}, ${pattern}, ${temp}, ${vol}${pause}${agitation}${held}` |

Note: `BrewStageRung` builds its a11y sentence from spelled-out fragments —
`Stage 01`, `centred pour`, `92 degrees`, `250 millilitres`, `, then 30 seconds
pause`, `, held once, 12 seconds` — for the screen reader. These are cited at
`components/BrewStageRung.tsx:47-70`.

---

## Brew history

`app/brewHistory.tsx` and `components/BrewHistoryRow.tsx`.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brewHistory.title` | `app/brewHistory.tsx:116` | Screen header title. | `Brew history` |
| `brewHistory.empty.title` | `app/brewHistory.tsx:154` | Doto empty-state heading. | `NO BREWS YET` |
| `brewHistory.empty.body` | `app/brewHistory.tsx:157` | Empty-state sub-line. | `Brew a recipe and it will appear here.` |
| `brewHistory.row.delete.a11y` | `app/brewHistory.tsx:32` (a11y) | (a11y) Swipe delete on a history row. | `Delete brew` |
| `brewHistory.row.delete.label` | `app/brewHistory.tsx:45` | Doto label on the delete tile. | `DELETE` |
| `brewHistory.confirm.title` | `app/brewHistory.tsx:182` | Title of the delete-confirmation dialog. | `Delete brew` |
| `brewHistory.confirm.body` | `app/brewHistory.tsx:186` | Confirmation body. `${...}` is the recipe name. | `Delete ${pendingBrew?.recipeName}? This cannot be undone.` |
| `brewHistory.confirm.delete.a11y` | `app/brewHistory.tsx:190` (a11y) | (a11y) Confirm-delete button. `${...}` is the recipe name (or "brew"). | `Delete ${pendingBrew?.recipeName ?? "brew"}` |
| `brewHistory.confirm.delete` | `app/brewHistory.tsx:193` | Confirm-delete button label. | `Delete` |
| `brewHistory.confirm.keep.a11y` | `app/brewHistory.tsx:197` (a11y) | (a11y) Cancel button. | `Keep this brew` |
| `brewHistory.confirm.keep` | `app/brewHistory.tsx:200` | Cancel button label. | `Keep this brew` |
| `brewHistory.row.a11y` | `components/BrewHistoryRow.tsx:41` (a11y) | (a11y) / title of a brew-history row. `${...}` is the recipe name. | `${brew.recipeName}` |
| `brewHistory.row.cup` | `components/BrewHistoryRow.tsx:60` | Doto cup weight on a row. `${...}` is grams. | `${Math.round(brew.cupTotal)} G` |
| `brewHistory.row.stopped` | `components/BrewHistoryRow.tsx:68` | Doto flag on a stopped brew. | `STOPPED` |
| `brewHistory.row.noTrace` | `components/BrewHistoryRow.tsx:74` | Doto flag when no trace was kept. | `NO TRACE KEPT` |

---

## Brew record and export

`app/brewRecord.tsx`.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `brewRecord.allBrews.a11y` | `app/brewRecord.tsx:57` (a11y) | (a11y) "All brews" header button. | `All brews` |
| `brewRecord.allBrews.label` | `app/brewRecord.tsx:61` | Doto label on the "All brews" button. | `ALL BREWS` |
| `brewRecord.notFound.title` | `app/brewRecord.tsx:191` | Doto heading when the record is gone. | `BREW NOT FOUND` |
| `brewRecord.notFound.body` | `app/brewRecord.tsx:194` | Sub-line when the record is gone. | `That brew is no longer here.` |
| `brewRecord.noTrace.title` | `app/brewRecord.tsx:253` | Doto heading when no trace was kept. | `NO TRACE KEPT` |
| `brewRecord.noTrace.body` | `app/brewRecord.tsx:257` | Sub-line when no trace was kept. | `No trace was kept for this brew.` |
| `brewRecord.recipeDeleted` | `app/brewRecord.tsx:285` | Note when the source recipe was deleted. | `Recipe deleted. Stages not available.` |
| `brewRecord.export.image` | `app/brewRecord.tsx:293` | Button to export the record as an image. | `Save as image` |
| `brewRecord.export.data` | `app/brewRecord.tsx:295` | Button to export the record data. | `Export the data` |

---

## NFC card read/write

The card overlay (`components/NfcOverlay.tsx`), the write path
(`hooks/useCardWriter.ts`), and the iOS NFC system sheet line
(`library/NFC.ts`). The read path's toasts live under **Home**.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `nfc.overlay.verb.read` | `components/NfcOverlay.tsx:59` | Doto verb shown while reading (uppercased to `READING`). | `Reading` |
| `nfc.overlay.verb.write` | `components/NfcOverlay.tsx:59` | Doto verb shown while writing (uppercased; may show `WRITING 42%`). | `Writing` |
| `nfc.overlay.hold` | `components/NfcOverlay.tsx:111` | Instruction under the overlay verb. | `Hold the card to the top of the phone.` |
| `nfc.overlay.cancel.a11y` | `components/NfcOverlay.tsx:119` (a11y) | (a11y) Cancel button on the overlay. | `Cancel` |
| `nfc.overlay.cancel` | `components/NfcOverlay.tsx:130` | Visible cancel button label. | `Cancel` |
| `nfc.write.toast.done` | `hooks/useCardWriter.ts:65` | Success toast after a card is written. | `Recipe written to card` |
| `nfc.write.toast.hold` | `hooks/useCardWriter.ts:66` | Instruction toast shown while writing. | `Hold the card to the top of the phone.` |
| `nfc.write.error.outOfRange` | `hooks/useCardWriter.ts:84` | Error toast when values cannot be written. | `The recipe cannot be written to the card. Check that all values are within range.` |
| `nfc.write.error.generic` | `hooks/useCardWriter.ts:93` | Error toast when the write fails. | `Could not write the recipe to the card.` |
| `nfc.ios.alert.writeError` | `library/NFC.ts:274` | Text written into the iOS NFC system sheet on a write error. | `Error writing to card` |

---

## Revert sheet

`components/RevertSheet.tsx` — choosing a source to revert a recipe to.

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `revert.title` | `components/RevertSheet.tsx:101` | Doto title of the revert sheet. | `REVERT TO` |
| `revert.card.label` | `components/RevertSheet.tsx:23` (`card`) | Doto label for the on-card backup source. | `THE CARD'S OWN BACKUP` |
| `revert.card.note` | `components/RevertSheet.tsx:24` (`card`) | Note under the card source when available. | `The bytes read off the card the last time it was scanned.` |
| `revert.card.absent` | `components/RevertSheet.tsx:26` (`card`) | Note when the card source is unavailable. | `This recipe has never been read from a card.` |
| `revert.saved.label` | `components/RevertSheet.tsx:30` (`saved`) | Doto label for the cached published copy. | `THE SAVED COPY` |
| `revert.saved.note` | `components/RevertSheet.tsx:31` (`saved`) | Note under the saved source. | `The recipe as xBloom published it, cached on this device.` |
| `revert.saved.absent` | `components/RevertSheet.tsx:33` (`saved`) | Note when the saved source is unavailable. | `No copy was cached for this recipe.` |
| `revert.xid.label` | `components/RevertSheet.tsx:37` (`xid`) | Doto label for re-fetching by ID. | `XBLOOM, BY RECIPE ID` |
| `revert.xid.note` | `components/RevertSheet.tsx:38` (`xid`) | Note under the ID source. | `Fetch the published recipe again using its ID.` |
| `revert.xid.absent` | `components/RevertSheet.tsx:40` (`xid`) | Note when there is no ID. | `This recipe has no xBloom recipe ID.` |
| `revert.share.label` | `components/RevertSheet.tsx:44` (`share`) | Doto label for re-fetching from the share link. | `XBLOOM, BY SHARE LINK` |
| `revert.share.note` | `components/RevertSheet.tsx:45` (`share`) | Note under the share source. | `Fetch it again from the link it was imported from.` |
| `revert.share.absent` | `components/RevertSheet.tsx:47` (`share`) | Note when there is no share link. | `This recipe was not imported from a share link.` |

Note: `components/RevertSheet.tsx:91` shows a raw error via
`notify({message: String(error)})` — a developer-facing fallback, not
app-authored copy, so not edited here.

---

## Machine connection

The machine card in Settings (`components/MachineSection.tsx`), the header dot
(`components/MachineDot.tsx`), the water/mode popover
(`components/MachinePopover.tsx`), and the Bluetooth errors from
`hooks/useMachine.ts` and `library/machine/Transport.ts` (surfaced via the
machine card's error line).

### Machine card (`components/MachineSection.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `machine.section.title` | `components/MachineSection.tsx:79` | Section title. | `Machine` |
| `machine.section.idle.connecting` | `components/MachineSection.tsx:58` | Status while connecting. | `Connecting…` |
| `machine.section.idle.none` | `components/MachineSection.tsx:59` | Status when no machine is paired. | `No machine paired` |
| `machine.section.idle.notConnected` | `components/MachineSection.tsx:60` | Status when a machine is remembered but not connected. `${remembered}` is the machine name. | `Not connected · ${remembered}` |
| `machine.section.connect.connected` | `components/MachineSection.tsx:96` | Row label when connected. | `Connected` |
| `machine.section.connect.connect` | `components/MachineSection.tsx:96` | Row label when not connected. | `Connect to my machine` |
| `machine.section.connected.desc` | `components/MachineSection.tsx:98` | Sub-note when connected. | `The link is held while XBRW++ is open.` |
| `machine.section.disconnected.desc` | `components/MachineSection.tsx:99` | Sub-note when not connected. | `Your xBloom Studio has to be switched on and nearby.` |
| `machine.section.vital.serial` | `components/MachineSection.tsx:108` | Vital label. | `Serial` |
| `machine.section.vital.model` | `components/MachineSection.tsx:109` | Vital label. | `Model` |
| `machine.section.vital.firmware.a11y` | `components/MachineSection.tsx:111` (a11y) | (a11y) Firmware vital. `${...}` is the firmware string. | `Firmware, ${info.firmware}` |
| `machine.section.vital.firmware` | `components/MachineSection.tsx:113` | Vital label. | `Firmware` |
| `machine.section.vital.water` | `components/MachineSection.tsx:115` | Vital label; value is OK/Low. | `Water` |
| `machine.section.vital.water.ok` | `components/MachineSection.tsx:115` | Vital value when the tank is fine. | `OK` |
| `machine.section.vital.water.low` | `components/MachineSection.tsx:115` | Vital value when the tank is low. | `Low` |
| `machine.section.vital.grind` | `components/MachineSection.tsx:116` | Vital label. | `Grind size` |
| `machine.section.vital.mode` | `components/MachineSection.tsx:117` | Vital label; value is the machine mode (PRO/EASY). | `Mode` |
| `machine.section.autostart.label` | `components/MachineSection.tsx:122` | Toggle label. | `Start brewing automatically` |
| `machine.section.autostart.desc` | `components/MachineSection.tsx:123` | Toggle description. | `Off, BREW loads the recipe onto the machine and waits for you to press START. On, it starts grinding the moment the recipe lands.` |
| `machine.section.animate.label` | `components/MachineSection.tsx:128` | Toggle label. | `Animate the brew chart` |
| `machine.section.animate.desc` | `components/MachineSection.tsx:129` | Toggle description. | `When off, each phase change holds its end state immediately. The system Reduced Motion switch also disables animation independently.` |
| `machine.section.traces.label` | `components/MachineSection.tsx:134` | Toggle/choice label. | `Keep raw brew traces` |
| `machine.section.traces.desc` | `components/MachineSection.tsx:135` | Description. | `How many past brews keep their full sample stream. Records are always kept; only the detail behind them expires.` |
| `machine.section.traces.off` | `components/MachineSection.tsx:22` (`TRACE_RETENTION`) | Choice value: keep no traces. | `Don't keep traces` |
| `machine.section.forget.label` | `components/MachineSection.tsx:141` | Action row label. | `Forget this machine` |
| `machine.section.forget.detail` | `components/MachineSection.tsx:142` | Action row detail. | `XBRW++ will scan again next time.` |

### Header dot (`components/MachineDot.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `machine.dot.connected.a11y` | `components/MachineDot.tsx:31` (a11y, `connected`) | (a11y) Header dot when connected. | `Machine connected` |
| `machine.dot.connecting.a11y` | `components/MachineDot.tsx:32` (a11y, `connecting`) | (a11y) Header dot while connecting. | `Machine connecting` |
| `machine.dot.disconnected.a11y` | `components/MachineDot.tsx:33` (a11y, `disconnected`) | (a11y) Header dot when out of range. | `Machine not in range` |
| `machine.dot.failed.a11y` | `components/MachineDot.tsx:34` (a11y, `failed`) | (a11y) Header dot after a failed link. | `Machine not in range` |

### Popover (`components/MachinePopover.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `machine.popover.title` | `components/MachinePopover.tsx:141` | Sheet title (not shown visibly; used for the frame). | `Machine` |
| `machine.popover.water.label` | `components/MachinePopover.tsx:73` | Doto row label. | `WATER` |
| `machine.popover.water.ok` | `components/MachinePopover.tsx:76` | Doto water value. | `OK` |
| `machine.popover.water.low` | `components/MachinePopover.tsx:76` | Doto water value. | `LOW` |
| `machine.popover.water.refresh.a11y` | `components/MachinePopover.tsx:84` (a11y) | (a11y) Refresh-the-water button. | `Refresh the water reading` |
| `machine.popover.water.fillPrompt` | `components/MachinePopover.tsx:93` | Doto prompt when the tank is low. | `FILL THE TANK, THEN REFRESH` |
| `machine.popover.mode.label` | `components/MachinePopover.tsx:96` | Doto row label. | `MODE` |
| `machine.popover.grind.label` | `components/MachinePopover.tsx:102` | Doto row label. | `GRIND` |
| `machine.popover.connecting` | `components/MachinePopover.tsx:113` | Doto status while connecting. | `CONNECTING…` |
| `machine.popover.outOfRange` | `components/MachinePopover.tsx:121` | Prose when out of range. | `Not in range. It will reconnect by itself when it is.` |
| `machine.popover.lastSeen` | `components/MachinePopover.tsx:122` | Prose with last-seen age. `${age(...)}` is a human age; sentence continues on line 123. | `Last seen ${age(vitals.askedAt, now)}. It will reconnect by itself when it is in range.` |
| `machine.popover.tryNow.a11y` | `components/MachinePopover.tsx:125` (a11y) | (a11y) Try-now button. | `Try now` |
| `machine.popover.tryNow` | `components/MachinePopover.tsx:131` | Doto label on the try-now button. | `TRY NOW` |
| `machine.popover.age.justNow` | `components/MachinePopover.tsx:36` | Doto age helper. | `JUST NOW` |
| `machine.popover.age.minAgo` | `components/MachinePopover.tsx:37` | Doto age helper. `${minutes}` is the count. | `${minutes} MIN AGO` |

### Bluetooth errors (`hooks/useMachine.ts`, `library/machine/Transport.ts`)

These are thrown and surfaced on the machine card's error line
(`hooks/useMachine.ts:320`, `setError((e as Error).message)`).

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `machine.error.needsPermission` | `hooks/useMachine.ts:194` | Connect blocked: permission denied. | `XBRW++ needs permission to use Bluetooth.` |
| `machine.error.cancelled` | `hooks/useMachine.ts:207` | Connect cancelled. | `Connecting was cancelled.` |
| `machine.error.couldNotConnect` | `hooks/useMachine.ts:218` | Connect failed generically. | `Could not connect to the machine.` |
| `machine.error.notFound` | `hooks/useMachine.ts:226` | No machine found while scanning. | `Could not find a machine. Check it is switched on and nearby.` |
| `machine.error.btOff` | `library/machine/Transport.ts:91` | Bluetooth is off. | `Bluetooth is switched off. Turn it on and try again.` |
| `machine.error.btPermission` | `library/machine/Transport.ts:95` | Bluetooth permission denied. | `XBRW++ does not have permission to use Bluetooth. Allow it in Settings and try again.` |
| `machine.error.btUnsupported` | `library/machine/Transport.ts:99` | Device lacks BLE. | `This device cannot use Bluetooth Low Energy.` |
| `machine.error.btNotReady` | `library/machine/Transport.ts:210` | Bluetooth did not initialise. | `Bluetooth did not come up. Check that it is switched on, and try again.` |

---

## Settings

`app/settings.tsx`, the restore sheet (`components/RestoreSheet.tsx`), the
delete-all sheet (`components/DeleteAllSheet.tsx`), and the backup/restore
messages from `hooks/useBackup.ts` and `library/backup.ts`.

### Settings screen (`app/settings.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `settings.title` | `app/settings.tsx:231` | Screen header title. | `Settings` |
| `settings.about.label` | `app/settings.tsx:240` | Row that opens About. | `About XBRW++` |
| `settings.about.detail` | `app/settings.tsx:241` | Version line under About. `${VERSION}` is the app version. | `Version ${VERSION}` |
| `settings.section.recipeList` | `app/settings.tsx:245` | Section title. | `Recipe list` |
| `settings.coffeeMarker.label` | `app/settings.tsx:247` | Toggle label. | `Show the COFFEE marker` |
| `settings.coffeeMarker.desc` | `app/settings.tsx:248` | Toggle description. | `The TEA marker is always shown. COFFEE is redundant in a mostly-coffee library.` |
| `settings.dotMatrix.label` | `app/settings.tsx:252` | Toggle label. | `Dot matrix pour profile` |
| `settings.dotMatrix.desc` | `app/settings.tsx:253` | Toggle description. | `Fill the graph behind each recipe with a screen of dots instead of a flat tint.` |
| `settings.brewOnRows.label` | `app/settings.tsx:257` | Toggle label. | `Show BREW on recipe rows` |
| `settings.brewOnRows.desc` | `app/settings.tsx:258` | Toggle description. | `Add a BREW shortcut to every recipe card. Turn it off if you brew rarely and prefer a quieter list.` |
| `settings.brewShape.label` | `app/settings.tsx:264` | Choice label. | `BREW shortcut shape` |
| `settings.brewShape.desc` | `app/settings.tsx:265` | Choice description. | `Four shapes to try on the device. One of them will win and the rest will go.` |
| `settings.brewShape.edge` | `app/settings.tsx:36` (`BREW_SHORTCUT_OPTIONS`) | Doto choice value. | `EDGE` |
| `settings.brewShape.tab` | `app/settings.tsx:37` (`BREW_SHORTCUT_OPTIONS`) | Doto choice value. | `TAB` |
| `settings.brewShape.chip` | `app/settings.tsx:38` (`BREW_SHORTCUT_OPTIONS`) | Doto choice value. | `CHIP` |
| `settings.brewShape.swipe` | `app/settings.tsx:39` (`BREW_SHORTCUT_OPTIONS`) | Doto choice value. | `SWIPE` |
| `settings.section.units` | `app/settings.tsx:272` | Section title. | `Units` |
| `settings.temperature.label` | `app/settings.tsx:274` | Choice label. | `Temperature` |
| `settings.temperature.desc` | `app/settings.tsx:275` | Choice description. | `What the editor shows and takes. The card always stores Celsius, so switching back and forth changes nothing that is written.` |
| `settings.temperature.celsius` | `app/settings.tsx:30` (`TEMPERATURE_OPTIONS`) | Doto choice value. | `°C` |
| `settings.temperature.fahrenheit` | `app/settings.tsx:31` (`TEMPERATURE_OPTIONS`) | Doto choice value. | `°F` |
| `settings.section.library` | `app/settings.tsx:283` | Section title. | `Library` |
| `settings.history.label` | `app/settings.tsx:284` | Action row label. | `Brew history` |
| `settings.history.detail` | `app/settings.tsx:285` | Action row detail. | `Every brew you have recorded.` |
| `settings.backup.label` | `app/settings.tsx:287` | Action row label. | `Back up my recipes` |
| `settings.backup.detail` | `app/settings.tsx:288` | Action row detail. | `Writes a file and hands it to the share sheet.` |
| `settings.restore.label` | `app/settings.tsx:290` | Action row label. | `Restore from a backup` |
| `settings.restore.detail` | `app/settings.tsx:291` | Action row detail. | `Adds anything your library does not already have.` |
| `settings.deleteAll.label` | `app/settings.tsx:293` | Action row label. | `Delete all recipes` |
| `settings.deleteAll.detail` | `app/settings.tsx:294` | Action row detail. | `Everything on this phone. There is no undo.` |
| `settings.toast.restoreFailed` | `app/settings.tsx:181` | Error toast when a restore fails. | `The restore could not be completed, so your library was left unchanged.` |
| `settings.toast.settingsRestored` | `app/settings.tsx:194` | Success toast when only settings were restored. | `Settings restored` |
| `settings.toast.recipeRestored.one` | `app/settings.tsx:201` | Success toast, one recipe. | `1 recipe restored` |
| `settings.toast.recipeRestored.many` | `app/settings.tsx:202` | Success toast, many recipes. `${outcome.added}` is the count. | `${outcome.added} recipes restored` |
| `settings.toast.deleteFailed` | `app/settings.tsx:217` | Error toast when deletion fails. | `Your recipes could not be deleted, so nothing was removed.` |
| `settings.toast.deleted.one` | `app/settings.tsx:224` | Success toast, one recipe deleted. | `1 recipe deleted` |
| `settings.toast.deleted.many` | `app/settings.tsx:225` | Success toast, many deleted. `${outcome.deleted}` is the count. | `${outcome.deleted} recipes deleted` |

### Restore sheet (`components/RestoreSheet.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `settings.restore.sheet.title` | `components/RestoreSheet.tsx:90` | Sheet title. | `Restore` |
| `settings.restore.replaceWarning` | `components/RestoreSheet.tsx:95` | Confirmation before replacing the whole library. `${...}` are recipe counts. | `Replacing deletes ${plural(existing.length, "recipe", "recipes")} and puts ${plural(replaceCount, "recipe", "recipes")} in their place. This cannot be undone.` |
| `settings.restore.replace.back` | `components/RestoreSheet.tsx:102` | Back button in the replace confirmation. | `Back` |
| `settings.restore.replace.confirm` | `components/RestoreSheet.tsx:108` | Confirm button. | `Yes, replace` |
| `settings.restore.replace.confirm.a11y` | `components/RestoreSheet.tsx:105` (a11y) | (a11y) Confirm-replace button. | `Yes, replace my library` |
| `settings.restore.allPresent` | `components/RestoreSheet.tsx:116` | Note when the backup has nothing new. | `Every recipe in this backup is already in your library.` |
| `settings.restore.hasNew` | `components/RestoreSheet.tsx:117` | Note with the count of new recipes. `${...}` is the count. | `This backup has ${plural(toAdd.length, "new recipe", "new recipes")}.` |
| `settings.restore.alreadyPresent` | `components/RestoreSheet.tsx:121` | Detail about recipes already present. `${...}` is the count. | `${plural(alreadyPresent, "recipe is", "recipes are")} already in your library and will be left exactly as they are.` |
| `settings.restore.skipped` | `components/RestoreSheet.tsx` (skipped detail) | Detail about unreadable entries. `${...}` is the count. | `${plural(skipped, "entry", "entries")} in this file could not be read and will be skipped.` |
| `settings.restore.includeSettings.label` | `components/RestoreSheet.tsx:133` | Toggle label. | `Take the settings from this backup` |
| `settings.restore.includeSettings.desc` | `components/RestoreSheet.tsx:134` | Toggle description. | `Off by default: restoring someone else's library should not change your preferences.` |
| `settings.restore.add.settings` | `components/RestoreSheet.tsx:80` | Primary button when there is nothing new but settings. | `Take the settings` |
| `settings.restore.add.library` | `components/RestoreSheet.tsx:81` | Primary button to add recipes. | `Add to my library` |
| `settings.restore.replaceInstead` | `components/RestoreSheet.tsx:166` | Destructive alternative. | `Replace my library instead` |
| `settings.restore.replaceInstead.a11y` | `components/RestoreSheet.tsx:163` (a11y) | (a11y) The replace-instead button. | `Replace my library` |

### Delete-all sheet (`components/DeleteAllSheet.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `settings.deleteAll.sheet.title` | `components/DeleteAllSheet.tsx:38` | Sheet title. | `Delete all recipes` |
| `settings.deleteAll.body` | `components/DeleteAllSheet.tsx:41` | Warning body. `${subject}` is "1 recipe"/"N recipes". | `This deletes ${subject} from this phone. It cannot be undone, and a recipe already written to a card is not a copy of this library.` |
| `settings.deleteAll.backup.a11y` | `components/DeleteAllSheet.tsx:45` (a11y) | (a11y) Back-up-first button. | `Back up first` |
| `settings.deleteAll.backup` | `components/DeleteAllSheet.tsx:47` | Back-up-first button label. | `Back up first` |
| `settings.deleteAll.confirm` | `components/DeleteAllSheet.tsx:34` (`deleteLabel`) | Destructive confirm label. `${subject}` is "1 recipe"/"N recipes". | `Delete all ${subject}` |
| `settings.deleteAll.keep.a11y` | `components/DeleteAllSheet.tsx:56` (a11y) | (a11y) Cancel button. | `Keep my recipes` |
| `settings.deleteAll.keep` | `components/DeleteAllSheet.tsx:58` | Cancel button label. | `Keep my recipes` |

### Backup / restore messages (`hooks/useBackup.ts`, `library/backup.ts`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `backup.export.noShare` | `hooks/useBackup.ts:71` | Backup failed: device cannot share. | `This device cannot share files, so the backup was not made.` |
| `backup.export.writeFailed` | `hooks/useBackup.ts:91` | Backup failed: could not write. | `The backup could not be written to this device.` |
| `backup.export.dialogTitle` | `hooks/useBackup.ts:97` | Share-sheet dialog title. | `Back up your recipes` |
| `backup.export.shareFailed` | `hooks/useBackup.ts:102` | Backup made but sharing failed. | `The backup was made but could not be shared.` |
| `backup.import.noPicker` | `hooks/useBackup.ts:127` | Restore failed: no file browser. | `No file browser could be opened on this device.` |
| `backup.import.noFile` | `hooks/useBackup.ts:134` | Restore failed: nothing selected. | `No file came back from the file browser.` |
| `backup.import.unreadable` | `hooks/useBackup.ts:149` | Restore failed: file unreadable. | `That file could not be read.` |
| `backup.parse.notJson` | `library/backup.ts:65` | Backup invalid: not JSON. | `That file could not be read. It is not valid JSON.` |
| `backup.parse.notBackup` | `library/backup.ts:69,75,84,95` | Backup invalid: not an XBRW++ backup. (Same message at four validation points.) | `That file is not an XBRW++ backup.` |
| `backup.parse.newerVersion` | `library/backup.ts:90` | Backup made by a newer app version. | `That backup was made by a newer version of XBRW++. Update the app and try again.` |
| `backup.parse.noRecipes` | `library/backup.ts:119` | Backup has no recipes. | `There are no recipes in that backup.` |

---

## About and licences

`app/about.tsx` and `app/licences.tsx`.

### About screen (`app/about.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `about.title` | `app/about.tsx:82` | Screen header title. | `About` |
| `about.versionLine` | `app/about.tsx:94` | Doto version/build line. `${...}` hold version and build. | `V${VERSION}  ·  BUILD ${BUILD}` |
| `about.section.independent` | `app/about.tsx:99` | Section heading. | `Independent` |
| `about.independent.p1` | `app/about.tsx:101` | Paragraph. | `XBRW++ is not affiliated with, endorsed by or supported by xBloom. xBloom and its logos are the trademarks of their owner, used here only to say which machine and which cards this app works with.` |
| `about.independent.p2` | `app/about.tsx:107` | Paragraph. | `It reads and writes recipe cards for that machine, and it can import a recipe shared through the manufacturer's own service. Neither capability is documented or guaranteed, and either may stop working without notice.` |
| `about.section.whatLeaves` | `app/about.tsx:114` | Section heading. | `What leaves your phone` |
| `about.whatLeaves.p1` | `app/about.tsx:116` | Paragraph. | `Your recipes stay on this phone unless you ask to import or share one. There is no personal account, no sync and no analytics.` |
| `about.whatLeaves.p2` | `app/about.tsx:121` | Paragraph. | `Importing a shared recipe sends that recipe's ID to the manufacturer's service in order to fetch it. Sharing sends the recipe to the XBRW++ share service to create an xBloom link. Those two are the only things that use the network; leave both alone and XBRW++ sends nothing anywhere. A backup goes only where you send it.` |
| `about.whatLeaves.p3` | `app/about.tsx:129` | Paragraph. | `Brewing uses Bluetooth to reach the machine in the room with you, and it goes no further than that. Nothing about a brew is sent over the network or recorded off this phone. The machine's identifier is kept here so the next brew reconnects without scanning, and Forget this machine deletes it.` |
| `about.section.genuineCards` | `app/about.tsx:138` | Section heading. | `Why only genuine cards work` |
| `about.genuineCards.p1` | `app/about.tsx:140` | Paragraph. | `The first 32 bytes of every recipe card are a signature derived from that card's serial number. This app cannot compute one, so it never writes those bytes at all. It reads them because the checksum at the end of a recipe is calculated over the signature as well as the recipe, then it begins writing at the byte after them, leaving the signature exactly as the manufacturer left it.` |
| `about.genuineCards.p2` | `app/about.tsx:150` | Paragraph. | `That is why a recipe can be written to a card that came with coffee in it, and why a blank card will not take one.` |
| `about.section.madeBy` | `app/about.tsx:155` | Section heading. | `Made by` |
| `about.madeBy.p1` | `app/about.tsx:157` | Paragraph. | `XBRW++ is built by Jesper Hessius. Free, not for sale, and its source is public.` |
| `about.madeBy.p2` | `app/about.tsx:161` | Paragraph. | `It stands on two people's work. terminaldisclaimer wrote the original XBRecipeWriter and worked out the card format this app still writes. Serge Baranov's XBRecipeWriterPlus is the fork this one grew from.` |
| `about.link.original` | `app/about.tsx:166` | Link label. | `XBRecipeWriter, by terminaldisclaimer` |
| `about.link.fork` | `app/about.tsx:167` | Link label. | `XBRecipeWriterPlus, by Serge Baranov` |
| `about.link.source` | `app/about.tsx:168` | Link label. | `Source code` |
| `about.link.issue` | `app/about.tsx:169` | Link label. | `Report an issue` |
| `about.section.licences` | `app/about.tsx:172` | Section heading. | `Third-party licences` |
| `about.licences.p1` | `app/about.tsx:174` | Paragraph. `${LICENCES.length}` is the package count. | `This app stands on ${LICENCES.length} open-source packages. Where a package ships its licence text, it is reproduced in full, along with the copyright notice that licence requires. Where it ships only a name, that is recorded.` |
| `about.link.licences` | `app/about.tsx:179` | Link to the licences screen. | `Read the licences` |
| `about.link.error` | `app/about.tsx:240` | Error toast when a link cannot open. | `Could not open that link.` |

#### About ticker (`app/about.tsx:34`, `TICKER_LINES`)

A looping Doto joke ticker. All lines are uppercase, no full stops.

| ID | Source | Current text |
|----|--------|--------------|
| `about.ticker.01` | `app/about.tsx:35` | `GREETZ TO EVERYONE STILL WEIGHING BEANS BY EYE` |
| `about.ticker.02` | `app/about.tsx:36` | `NO BEANS WERE HARMED: SEVERAL WERE SEVERELY GROUND` |
| `about.ticker.03` | `app/about.tsx:37` | `THIS RECIPE HAS BEEN BLESSED BY A SMALL ANTENNA` |
| `about.ticker.04` | `app/about.tsx:38` | `THIRTEEN POINT FIVE SIX MEGAHERTZ OF PURE GOSSIP` |
| `about.ticker.05` | `app/about.tsx:39` | `THE CARD KNOWS WHAT YOU DID LAST BREW` |
| `about.ticker.06` | `app/about.tsx:40` | `WATER IS JUST COFFEE THAT GAVE UP` |
| `about.ticker.07` | `app/about.tsx:41` | `SHOUTS TO THE ONE POUR THAT HOLDS ALL THE SECRETS` |
| `about.ticker.08` | `app/about.tsx:42` | `RATIOS ARE WHOLE NUMBERS BECAUSE HALF A RATIO IS A LIE` |
| `about.ticker.09` | `app/about.tsx:43` | `GRIND SIZE FORTY-ONE MEANS THE GRINDER IS ON STRIKE` |
| `about.ticker.10` | `app/about.tsx:44` | `SOMEWHERE A CHECKSUM IS DISAPPOINTED IN YOU` |
| `about.ticker.11` | `app/about.tsx:45` | `DECAF DETECTED: DEPLOYING JUDGEMENT` |
| `about.ticker.12` | `app/about.tsx:46` | `PLEASE DO NOT LICK THE NFC CARD` |
| `about.ticker.13` | `app/about.tsx:47` | `ALL YOUR BREW ARE BELONG TO US` |
| `about.ticker.14` | `app/about.tsx:48` | `THE PAUSE IS STORED BACKWARDS AND WE HAVE MADE PEACE WITH IT` |
| `about.ticker.15` | `app/about.tsx:49` | `ROASTED IN A HURRY: DOCUMENTED AT LEISURE` |
| `about.ticker.16` | `app/about.tsx:50` | `IF YOU ARE READING THIS THE COFFEE HAS GONE COLD` |
| `about.ticker.17` | `app/about.tsx:51` | `BLOOM RESPONSIBLY` |
| `about.ticker.18` | `app/about.tsx:52` | `TWO PLUSES BETTER THAN ONE PLUS: MATHEMATICS CONFIRMS` |
| `about.ticker.19` | `app/about.tsx:53` | `EIGHT BLOCKS SKIPPED: NOBODY SAW ANYTHING` |
| `about.ticker.20` | `app/about.tsx:54` | `OUR LAWYER IS A SINGLE PARAGRAPH FURTHER DOWN THIS PAGE` |
| `about.ticker.21` | `app/about.tsx:55` | `TEA MODE EXISTS AND WE ARE NOT TAKING QUESTIONS` |
| `about.ticker.22` | `app/about.tsx:56` | `THIS SCROLLER TOOK LONGER THAN THE CARD FORMAT` |
| `about.ticker.23` | `app/about.tsx:57` | `HAND ROLLED BYTES: NO ARTIFICIAL FLAVOURS` |
| `about.ticker.24` | `app/about.tsx:58` | `PRESS THE MARK ABOVE UNTIL SOMETHING GIVES` |
| `about.ticker.25` | `app/about.tsx:59` | `CAFFEINE IS A CIRCLE AND SO IS THIS LIST` |
| `about.ticker.26` | `app/about.tsx:60` | `GREETZ TO THE MACHINE THAT REFUSED SIX HUNDRED RECIPES` |
| `about.ticker.27` | `app/about.tsx:61` | `OVERFLOW PROTECTION OFF: LIVE A LITTLE` |
| `about.ticker.28` | `app/about.tsx:62` | `NO CLOUD NO ACCOUNT NO NEWSLETTER NO THANKS` |

### Licences screen (`app/licences.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `licences.title` | `app/licences.tsx:44` | Screen header title. | `Licences` |
| `licences.row.a11y` | `app/licences.tsx:119` (a11y) | (a11y) A tappable licence row. `${entry.name}` is the package name. | `Read the ${entry.name} licence` |

Note: licence names, versions and body text (`app/licences.tsx:60,97`) come from
the generated `constants/licences.ts` and third-party packages, not app-authored
copy, so they are not edited here.

---

## Machine console (developer, gated)

`app/machine.tsx` is a developer-oriented console reached behind an "I
understand" gate. Everything here **is** shown to a user who opens it, so it is
catalogued, but it is written in a terser, more technical register than the rest
of the app and reviewed on those terms. The command table's `name`, `note` and
`contradiction` fields live in `library/machine/commands.ts`.

### Console chrome (`app/machine.tsx`)

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `console.title` | `app/machine.tsx:417,433` | Screen header title. | `Machine console` |
| `console.warning` | `app/machine.tsx:27` (`CONSOLE_WARNING`) | The gate warning. | `This sends raw commands straight to your machine. It can start the grinder, the water heater and the pouring arm. Nothing here is verified: most of it was reverse-engineered from other people's captures of one firmware revision, and some of it the sources disagree about. Read what each command says before you send it.` |
| `console.gate.confirm.a11y` | `app/machine.tsx:420` (a11y) | (a11y) The "I understand" gate button. | `I understand` |
| `console.gate.confirm` | `app/machine.tsx:424` | Gate button label. | `I understand` |
| `console.state.a11y` | `app/machine.tsx:438` (a11y) | (a11y) The machine-state readout. | `Machine state` |
| `console.telemetry.a11y` | `app/machine.tsx:442` (a11y) | (a11y) The telemetry summary readout. | `Telemetry summary` |
| `console.connect.a11y.connecting` | `app/machine.tsx:451` (a11y) | (a11y) Connect button while connecting. | `Connecting to the machine` |
| `console.connect.a11y.connect` | `app/machine.tsx:452` (a11y) | (a11y) Connect button. | `Connect to the machine` |
| `console.connect.connecting` | `app/machine.tsx:457` | Connect button label while connecting. | `Connecting…` |
| `console.connect.connect` | `app/machine.tsx:457` | Connect button label. | `Connect` |
| `console.section.session` | `app/machine.tsx:462` | Section title. | `Session` |
| `console.confirm.label` | `app/machine.tsx:464` | Toggle label. | `Confirm before sending` |
| `console.confirm.desc` | `app/machine.tsx:465` | Toggle description. | `For the one session spent working through the hardware checklist, where confirming forty sends is its own hazard.` |
| `console.telemetry.label` | `app/machine.tsx:469` | Toggle label. | `Show telemetry` |
| `console.telemetry.desc` | `app/machine.tsx:470` | Toggle description. | `Log the weight and tank-volume streams, and the info blob, instead of summarising them in place. The info blob is not a stream: it answers when asked, inside a fresh session.` |
| `console.teaSteep.label` | `app/machine.tsx:474` | Toggle label. | `Tea steep encoding` |
| `console.teaSteep.desc` | `app/machine.tsx:475` | Toggle description. | `The two sources disagree; a single stopwatched sixty-second steep settles which is right.` |
| `console.teaSteep.homoland` | `app/machine.tsx:242` (`TEA_STEEP_OPTIONS`) | Choice value. | `HomoLand` |
| `console.teaSteep.saya6k` | `app/machine.tsx:243` (`TEA_STEEP_OPTIONS`) | Choice value. | `saya6k` |
| `console.section.rawFrame` | `app/machine.tsx:481` | Section title. | `Raw frame` |
| `console.rawFrame.prose` | `app/machine.tsx:484` | Prose above the raw-frame field. | `An undocumented code is a paste away. The checksum is sent exactly as typed, never recomputed.` |
| `console.rawFrame.placeholder` | `app/machine.tsx:489` | Placeholder in the raw-frame field. | `58 01 01 …` |
| `console.rawFrame.a11y` | `app/machine.tsx:490` (a11y) | (a11y) The raw-frame field. | `Raw frame` |
| `console.rawFrame.send.a11y` | `app/machine.tsx:494` (a11y) | (a11y) Send-raw-frame button. | `Send raw frame` |
| `console.section.commands` | `app/machine.tsx:503` | Section title. | `Commands` |
| `console.command.send` | `app/machine.tsx:300` | Doto send label on a command row. | `SEND` |
| `console.command.send.a11y` | `app/machine.tsx:296` (a11y) | (a11y) Send button on a command row. `${...}` is the command name. | `Send ${command.name}` |
| `console.command.arg.a11y` | `app/machine.tsx:290` (a11y) | (a11y) A command argument field. `${...}` are the command name and argument label. | `${command.name}, ${arg.label}` |
| `console.section.connection` | `app/machine.tsx:509` | Section title. | `Connection` |
| `console.connection.describe.a11y` | `app/machine.tsx:512` (a11y) | (a11y) Describe-the-radio button. | `Describe the radio` |
| `console.connection.describe` | `app/machine.tsx:516` | Describe-the-radio button label. | `Describe the radio` |
| `console.connection.empty` | `app/machine.tsx:520` | Empty state for the connection log. | `Nothing yet. This records every attempt at a link, including the ones that fail before a single frame is exchanged.` |
| `console.connection.log.a11y` | `app/machine.tsx:525` (a11y) | (a11y) The connection log field. | `Connection log` |
| `console.section.log` | `app/machine.tsx:532` | Section title. | `Log` |
| `console.log.copy.a11y` | `app/machine.tsx:534` (a11y) | (a11y) Copy-log button. | `Copy log` |
| `console.log.copy` | `app/machine.tsx:538` | Copy-log button label. | `Copy log` |
| `console.log.empty` | `app/machine.tsx:541` | Empty state for the frame log. | `Nothing sent or received yet.` |
| `console.log.a11y` | `app/machine.tsx:544` (a11y) | (a11y) The frame log field. | `Frame log` |
| `console.toast.logCopied` | `app/machine.tsx:410` | Success toast after copying the log. | `Log copied` |
| `console.confirm.sheet.title` | `app/machine.tsx:555` | Title of the confirm-send sheet. | `Confirm send` |
| `console.confirm.unresolved` | `app/machine.tsx:559` | Confirm body for an unresolved command. | `Nobody agrees what this does. What the sources actually observed:` |
| `console.confirm.moves` | `app/machine.tsx:560` | Confirm body for a hardware-moving command. | `This starts a motor, a heater, or rewrites a machine setting.` |
| `console.confirm.send.a11y` | `app/machine.tsx:566` (a11y) | (a11y) Confirm-send button. `${...}` is the command name. | `Confirm send ${pending?.command.name ?? ""}` |
| `console.confirm.send` | `app/machine.tsx:570` | Confirm-send button label. | `Send it` |
| `console.confirm.cancel.a11y` | `app/machine.tsx:573` (a11y) | (a11y) Cancel-send button. | `Cancel send` |
| `console.confirm.cancel` | `app/machine.tsx:574` | Cancel-send button label. | `Cancel` |
| `console.tier.inert` | `app/machine.tsx:42` (`TIER_LABEL`) | Doto tier badge on a command. | `INERT` |
| `console.tier.moves` | `app/machine.tsx:43` (`TIER_LABEL`) | Doto tier badge. | `MOVES HARDWARE` |
| `console.tier.unresolved` | `app/machine.tsx:44` (`TIER_LABEL`) | Doto tier badge. | `UNRESOLVED` |

### Command table (`library/machine/commands.ts`)

Each command shows its `name`, and where present a `note` or (for unresolved
commands) a `contradiction`. These are the tersest, most technical strings in
the app.

| ID | Source | Field | Current text |
|----|--------|-------|--------------|
| `console.cmd.handshake.name` | `library/machine/commands.ts:74` | name | `Session handshake` |
| `console.cmd.handshake.note` | `library/machine/commands.ts:75` | note | `Must arrive within about 200 ms of connecting. Until it does, the machine ignores everything else.` |
| `console.cmd.backHome.name` | `library/machine/commands.ts:76` | name | `Back to home` |
| `console.cmd.readInfo.name` | `library/machine/commands.ts:77` | name | `Read machine info` |
| `console.cmd.readInfo.note` | `library/machine/commands.ts:78` | note | `Asks for the 61-byte blob: firmware, grind size, mode, and the water flag the brew gate reads. Sources call this a heartbeat; on hardware it answers only when asked.` |
| `console.cmd.scaleTare.name` | `library/machine/commands.ts:80` | name | `Scale tare` |
| `console.cmd.scaleTare.note` | `library/machine/commands.ts:81` | note | `Zeroes the scale instantly. Confirmed on hardware.` |
| `console.cmd.scaleEnter.name` | `library/machine/commands.ts:82` | name | `Scale enter` |
| `console.cmd.scaleExit.name` | `library/machine/commands.ts:83` | name | `Scale exit` |
| `console.cmd.bypassDose.name` | `library/machine/commands.ts:86` | name | `Bypass and dose` |
| `console.cmd.bypassDose.note` | `library/machine/commands.ts:88` | note | `Carries the dose even with bypass off. Skipping it makes the grind drift.` |
| `console.cmd.commit.name` | `library/machine/commands.ts:89` | name | `Commit` |
| `console.cmd.commit.note` | `library/machine/commands.ts:90` | note | `Starts the brew. On hardware it goes straight to grinding rather than waiting for the button. Only useful once a recipe has been uploaded from a recipe screen.` |
| `console.cmd.cancel.name` | `library/machine/commands.ts:91` | name | `Cancel` |
| `console.cmd.coffeeResume.name` | `library/machine/commands.ts:92` | name | `Coffee resume` |
| `console.cmd.coffeeResume.note` | `library/machine/commands.ts:93` | note | `Resume after a pause. Single-source from HomoLand.` |
| `console.cmd.teaExecute.name` | `library/machine/commands.ts:94` | name | `Tea recipe execute` |
| `console.cmd.teaExecute.note` | `library/machine/commands.ts:95` | note | `Only useful once a tea recipe has been uploaded from a recipe screen.` |
| `console.cmd.grinderStart.name` | `library/machine/commands.ts:98` | name | `Grinder start` |
| `console.cmd.grinderStart.note` | `library/machine/commands.ts:99` | note | `The leading 1000 is a constant from the official app's grinder screen.` |
| `console.cmd.grinderStop.name` | `library/machine/commands.ts:100` | name | `Grinder stop` |
| `console.cmd.grinderEnter.name` | `library/machine/commands.ts:101` | name | `Grinder enter` |
| `console.cmd.grinderQuit.name` | `library/machine/commands.ts:102` | name | `Grinder quit` |
| `console.cmd.grinderPause.name` | `library/machine/commands.ts:103` | name | `Grinder pause` |
| `console.cmd.grinderResume.name` | `library/machine/commands.ts:104` | name | `Grinder resume` |
| `console.cmd.brewerEnter.name` | `library/machine/commands.ts:105` | name | `Brewer enter` |
| `console.cmd.brewerEnter.note` | `library/machine/commands.ts:106` | note | `Navigate to the FreeSolo brewer screen.` |
| `console.cmd.brewerStart.name` | `library/machine/commands.ts:107` | name | `Brewer start` |
| `console.cmd.brewerStart.note` | `library/machine/commands.ts:109` | note | `FreeSolo water dispense.` |
| `console.cmd.brewerStop.name` | `library/machine/commands.ts:110` | name | `Brewer stop` |
| `console.cmd.brewerPause.name` | `library/machine/commands.ts:111` | name | `Brewer pause` |
| `console.cmd.brewerResume.name` | `library/machine/commands.ts:112` | name | `Brewer resume` |
| `console.cmd.brewerQuit.name` | `library/machine/commands.ts:113` | name | `Brewer quit` |
| `console.cmd.recipeStartQuit.name` | `library/machine/commands.ts:114` | name | `Recipe start quit` |
| `console.cmd.recipeStartQuit.note` | `library/machine/commands.ts:115` | note | `Exit the pre-start recipe screen.` |
| `console.cmd.brewerSetPattern.name` | `library/machine/commands.ts:116` | name | `Brewer set pattern` |
| `console.cmd.brewerSetPattern.note` | `library/machine/commands.ts:117` | note | `Change the pattern during a brew.` |
| `console.cmd.brewerSetTemp.name` | `library/machine/commands.ts:118` | name | `Brewer set temperature` |
| `console.cmd.brewerSetTemp.note` | `library/machine/commands.ts:119` | note | `Change the temperature during a pour; plain integer x10, not float bits.` |
| `console.cmd.switchToPro.name` | `library/machine/commands.ts:124` | name | `Switch to PRO` |
| `console.cmd.switchToPro.note` | `library/machine/commands.ts:125` | note | `Byte-exact, confirmed on hardware.` |
| `console.cmd.switchToEasy.name` | `library/machine/commands.ts:126` | name | `Switch to EASY` |
| `console.cmd.switchToEasy.note` | `library/machine/commands.ts:127` | note | `Byte-exact, confirmed on hardware.` |
| `console.cmd.sendRecipeCount.name` | `library/machine/commands.ts:128` | name | `Send recipe count` |
| `console.cmd.sendRecipeCount.note` | `library/machine/commands.ts:129` | note | `Sends the count of recipes being synced.` |
| `console.cmd.readPourRadius.name` | `library/machine/commands.ts:130` | name | `Read pour radius` |
| `console.cmd.readPourRadius.note` | `library/machine/commands.ts:131` | note | `Read current mechanical pour radius. Response format is not documented.` |
| `console.cmd.readVibration.name` | `library/machine/commands.ts:132` | name | `Read vibration amplitude` |
| `console.cmd.readVibration.note` | `library/machine/commands.ts:133` | note | `Read current vibration amplitude setting. Response format is not documented.` |
| `console.cmd.brightness.name` | `library/machine/commands.ts:134` | name | `Display brightness` |
| `console.cmd.waterSource.name` | `library/machine/commands.ts:135` | name | `Water source` |
| `console.cmd.easyModeBegin.name` | `library/machine/commands.ts:136` | name | `Easy mode begin` |
| `console.cmd.easyModeBegin.note` | `library/machine/commands.ts:137` | note | `Initiate Auto Mode recipe display.` |
| `console.cmd.currentGrinder.name` | `library/machine/commands.ts:138` | name | `CurrentGrinder / back to normal` |
| `console.cmd.currentGrinder.note` | `library/machine/commands.ts:139` | note | `Return from grinder to normal state.` |
| `console.cmd.startConfirmPause.name` | `library/machine/commands.ts:142` | name | `Start / confirm / pause` |
| `console.cmd.startConfirmPause.contradiction` | `library/machine/commands.ts:143` | contradiction | `saya6k tried this live on 2026-07-19 and watched it bounce the state backwards to recipe_loaded rather than start the brew. Janczykkkko verified that sending it into a running brew aborts that brew. HomoLand names the same code COFFEE_PAUSE. XBRW++ never sends this during a brew.` |
| `console.cmd.setCup.name` | `library/machine/commands.ts:147` | name | `Set cup` |
| `console.cmd.setCup.contradiction` | `library/machine/commands.ts:148` | contradiction | `Three implementations send three materially different value sets — (200, 80), (110, 90), (80-90, 40) — the machine reportedly brews correctly regardless, and nobody knows what the field means. They disagree about the values, not about whether to send it, so XBRW++ sends it on every coffee brew with the reference's own (200, 80) — the widest of the three.` |
| `console.cmd.weightUnit.name` | `library/machine/commands.ts:153` | name | `Weight unit` |
| `console.cmd.weightUnit.contradiction` | `library/machine/commands.ts:154` | contradiction | `brAzzi64 reads the values as 0 g, 1 oz, 2 ml. HomoLand reads them as 0 ml, 1 g, 2 oz. These cannot both be right and no one has checked against a machine.` |
| `console.cmd.tempUnit.name` | `library/machine/commands.ts:157` | name | `Temperature unit` |
| `console.cmd.tempUnit.contradiction` | `library/machine/commands.ts:158` | contradiction | `brAzzi64 reads the values as 0 Celsius, 1 Fahrenheit. HomoLand reads them the other way round. Unverified either way.` |
| `console.cmd.writePourRadius.name` | `library/machine/commands.ts:161` | name | `Write pour radius` |
| `console.cmd.writePourRadius.contradiction` | `library/machine/commands.ts:162` | contradiction | `Mechanical calibration, single-source (HomoLand), range 400-1000 in steps of 80. Nobody has confirmed what a wrong value does to the arm.` |
| `console.cmd.writeVibration.name` | `library/machine/commands.ts:165` | name | `Write vibration amplitude` |
| `console.cmd.writeVibration.contradiction` | `library/machine/commands.ts:166` | contradiction | `Mechanical calibration, single-source (HomoLand), range 1000-1500 in steps of 100. Unverified.` |

---

## Shared chrome

Small components reused across screens (sheets, toasts, headers, help).

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `chrome.sheet.close.a11y` | `components/XbrwSheet.tsx:140` (a11y) | (a11y) Close affordance on every sheet. | `Close` |
| `chrome.sheet.close` | `components/XbrwSheet.tsx:144` | Doto close label on a sheet. | `CLOSE` |
| `chrome.screenHeader.back.a11y` | `components/ScreenHeader.tsx:42` (a11y) | (a11y) Back button on a full-screen header. | `Back` |
| `chrome.toast.a11y` | `components/XbrwToast.tsx:71` (a11y) | (a11y) A toast, announced by its message. `${message}` is the toast text. | `${message}` |

Notes: `components/XbrwToast.tsx` and `components/HelpSheet.tsx` otherwise render
text passed in from their callers (toast messages, help questions), catalogued at
their source screens. `LiveBrewBar` wraps `BrewMiniBar` and adds no strings of
its own.

---

## Inconsistencies and problems noticed

Specific issues found while cataloguing. Each cites the IDs involved. These are
exactly the kind of drift the owner asked to surface — none is a functional bug,
but each is a wording decision worth making once, on purpose.

1. **"Already in your library" is duplicated three times**, in two files, as
   independent literals: `home.toast.alreadyInLibrary.open`
   (`app/index.tsx:220`), `home.toast.alreadyInLibrary.read`
   (`app/index.tsx:371`) and `import.result.existing.plain`
   (`components/ImportResult.tsx:154`). If one is reworded the others will
   silently drift. Candidate for a single shared constant.

2. **"Hold the card to the top of the phone." is duplicated three times**:
   `nfc.overlay.hold` (`components/NfcOverlay.tsx:111`), `nfc.write.toast.hold`
   (`hooks/useCardWriter.ts:66`) and `home.toast.holdCard`
   (`app/index.tsx:337`). Same drift risk.

3. **PRO / Pro / EASY casing is inconsistent.** `brew.action.switchToPro` says
   "Switch to PRO" (all-caps PRO in an Inter button); `brew.proModePrompt` says
   "Switch it to Pro" (title case); `console.cmd.switchToPro.name` /
   `console.cmd.switchToEasy.name` use "PRO"/"EASY"; the popover mode value
   (`machine.popover.mode.label` value) surfaces "EASY"/"PRO" from the machine.
   Pick one convention for the mode name in prose vs. as a Doto token.

4. **The grinder-off grind number contradicts itself.**
   `help.grinder.detail` says turning the grinder off writes grind size **81**;
   the joke line `about.ticker.09` says "GRIND SIZE FORTY-ONE MEANS THE GRINDER
   IS ON STRIKE" (**41**). These describe the same feature with different
   numbers. (Per repo conventions, `GRINDER_OFF = 41` is the stored value and
   81 is what the user sees — so the ticker is arguably referring to the
   internal value, but a reader cannot know that. At minimum the two should not
   sit in the same app disagreeing.)

5. **Grams register split: "g" vs "G".** The editor and card stats use lowercase
   "g" (`home.card.stat.dose` value suffix, help text "18 g"), while every
   dot-matrix readout uses uppercase "G" (`brew.mini.ready.detail`,
   `brew.mini.grinding.detail`, `brewHistory.row.cup`, `import.result` figures).
   This is defensible as a register rule (Doto is all-caps) but is worth stating
   explicitly so nobody "fixes" it in one place.

6. **Three different phrasings for "not connected."**
   `machine.section.idle.notConnected` says "Not connected · {name}";
   `machine.popover.outOfRange` says "Not in range."; the header dot
   `machine.dot.disconnected.a11y` / `machine.dot.failed.a11y` say "Machine not
   in range". "Not connected" and "not in range" are used interchangeably for
   the same state.

7. **The same too-fine-grind condition is explained two ways.**
   `editor.field.grind.tooFine` says "A card cannot store a grind below 40.",
   while `import.result.tooFine` says "You will need to coarsen it to write a
   card." Both are correct; a user meeting both will not obviously connect them.

8. **Read/write error asymmetry.** `home.toast.readFailed` ends "Please try
   again." but `nfc.write.error.generic` ("Could not write the recipe to the
   card.") does not. Parallel failures, non-parallel copy.

9. **Empty-state register is split.** `home.empty.title` is Inter sentence case
   ("No recipes yet"), but `brewHistory.empty.title` ("NO BREWS YET"),
   `brewRecord.notFound.title` ("BREW NOT FOUND") and `brewRecord.noTrace.title`
   ("NO TRACE KEPT") are Doto all-caps. Two visually different empty-state
   treatments across sibling screens.

10. **"Stopped." vs "Stopped: {why}".** `brew.phase.cancelled` is "Stopped."
    (full stop) while `brew.mini.stopped.title` is "Stopped: {why}" (no full
    stop, colon list). Minor, but they read as two different voices for the same
    event.

11. **Machine console command notes are developer English**, not product
    English: e.g. `console.cmd.brewerStart.note` ("FreeSolo water dispense."),
    `console.cmd.brewerEnter.note` ("Navigate to the FreeSolo brewer screen."),
    `console.cmd.currentGrinder.name` ("CurrentGrinder / back to normal"). This
    is acceptable for a gated developer console, but if any of it is ever
    surfaced outside the gate it will need rewriting. Flagged rather than
    silently included.

12. **`console.cmd.brewerStart.note` and similar reference "FreeSolo"**, an
    internal/undocumented feature name a user has no way to recognise. Same
    caveat as above.

### Notes on what was included with uncertainty

- **Machine console (`console.*`) strings, including every command
  `name`/`note`/`contradiction`,** are behind an "I understand" gate and are
  written for a developer. They are genuinely rendered to a user who opens the
  console, so they are catalogued — but they should be reviewed on developer
  terms, not held to the product voice.
- **`brew.blocked.detail.*` (from `library/machine/Machine.ts`)** are the
  machine block/gate messages. They surface indirectly, as the detail line under
  a brew-phase headline, rather than as their own screen. Included because they
  reach the user; flagged because the path is indirect.
- **`machine.error.*` (from `hooks/useMachine.ts` and `Transport.ts`)** are
  `throw new Error(...)` values, but they are caught and shown on the machine
  card's error line (`hooks/useMachine.ts:320`), so they are user-facing despite
  being thrown. Confirmed by tracing the `setError` path before including them.

### Deliberately excluded (developer-only)

For the record, these were checked and left out because they never reach a user:
`console.log` debug lines in `library/NFC.ts` (e.g. "Requesting Iso15693",
"Reading Multiple Blocks", "Write error!:"); the thrown errors in
`library/Recipe.ts` ("Error reading card: ", "No data read from card") which are
caught in `app/index.tsx` and replaced with `home.toast.readFailed`; code
comments and test fixtures throughout; and `preview.subtitle` / licence body
text, which are fetched from third parties rather than authored in the app.
