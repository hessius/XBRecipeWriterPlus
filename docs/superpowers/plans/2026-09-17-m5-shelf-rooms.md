# M5 phase 4b: the rail per view, and the shelf you opened

Device testing of phase 4 sent back two reversals and a handful of visual
defects. Both reversals are recorded in the design
([§"The rail belongs to the view"](../specs/2026-09-16-library-shelves-design.md),
§"A shelf opens into itself"); this plan is how they ship.

## What the tester saw

> "the rail we implemented for the chips is now way too cramped with the
> segmented button, and especially when trying to do the search it leaves very
> little room for the search bar to function"

> "the current flow of tapping a shelf and then being switched back to the list
> view and then applying a filter just isn't very good, it isn't appealing"

Five separate faults, which resolve into two changes and one deferral:

1. Four controls in a rail that holds two, at 320 pt.
2. Sort is offered in shelf view, where there is nothing to sort by.
3. The view toggle does not match the buttons beside it.
4. Tapping a shelf leaves shelf view.
5. No cover art, and no setting to choose one. **Correct and deferred.** The
   44 pt square ships, the art and its dev setting do not.

## What is deliberately not in this plan

- **Perfect square tiles.** The tester raised it and then deferred it himself:
  proportions are worth settling against real art, not against a placeholder
  bar. Revisit with the `ShelfMark` variants.
- **`ShelfMark` variants and their dev setting.** Unchanged from phase 4.
- **Shelf ordering.** Still out of scope, per the design. This plan removes the
  sort control from shelf view *because* of that, and adding one later means
  putting the control back, not working around its absence.
- **A new route.** The shelf room is the library screen in a third state, the
  same way selection mode is. A route would mean a second copy of the header,
  the rail and the list, and two places for every future library change to land.

## Task 1: The rail asks the view what it needs

- [ ] `components/LibraryRail.tsx`: the cluster is built from the view, not
      assembled once and partly hidden. List view gets the toggle, search, sort
      and filter; shelf view gets the toggle alone.
- [ ] The toggle is **first** in both views, so switching views does not move
      the control you just used. This is the one control present in both, and a
      control that jumps after a tap reads as a mis-tap.
- [ ] Test at 320 pt in both views, and in list view with a sort applied, which
      is the widest the rail ever gets.
- [ ] Test that switching to shelf view with a search term held does not lose
      the term: the control leaves, the query does not, and switching back shows
      it still applied. A term silently dropped by a view switch is data loss
      the user did not ask for.

## Task 2: A toggle built to the rail's own metrics

- [ ] `components/RailViewToggle.tsx`: two segments, `CHIP_HEIGHT` tall, `$4`
      radius, 1 pt border, Doto 12 at 1.5 tracking, drawn from the same values
      `RailChip` uses rather than copies of them.
- [ ] **Do not touch `components/SegmentedControl.tsx`.** It is a settings
      component and `SortSheet` uses it too. Matching the rail there would
      restyle two screens that did not ask for it.
- [ ] Accessibility: each segment reports selected state. A segmented pair whose
      selection is only a fill is invisible to a reader.

## Task 3: Search overlays rather than competes

- [ ] `components/RailSearch.tsx`: idle returns to a square chip of
      `CHIP_HEIGHT`. The flex and its `onLayout` label measurement go.
- [ ] Open, the field is drawn over the rail, not in it: the rail keeps its
      layout underneath and nothing moves when search opens or closes.
- [ ] The sort label suppression phase 3 added can go with the flex that caused
      it. Nothing is competing for the width any more, so nothing needs to
      yield it.
- [ ] Test that opening search does not move the toggle. This is the whole
      point of the change and it is the assertion that would catch a regression
      to flexing.

## Task 4: The shelf room

- [ ] `app/index.tsx`: a third state, `openShelf`, beside selection mode. Not a
      route, per the reasoning above.
- [ ] The shelf's name is the heading, in the same Doto caps as the grid's
      section headings, with the count beneath it.
- [ ] Recipes are drawn as tiles of the same square the grid uses, so opening a
      shelf changes what is on the squares and not what a square is.
- [ ] Back returns to the grid, with the grid's scroll position intact.
- [ ] The rail in a shelf room is the shelf view's rail: the toggle alone.
      Switching to list view from inside a room leaves the room.
- [ ] Hardware back on Android leaves the room before it leaves the screen.

## Task 5: Long press is the door to the actions

- [ ] A long press on a recipe tile opens `RecipeOverflowSheet`, the same sheet
      the row's overflow opens, with the same items.
- [ ] `accessibilityActions` carries the same actions, because a long press is
      not reachable by a reader and an action available only by gesture is not
      available.
- [ ] Test that the sheet from a tile and the sheet from a row offer the same
      actions for the same recipe. Two doors to one sheet is the design; two
      sheets that drift is the failure it is guarding against.

## Task 6: The gate

- [ ] `npm run typecheck`, `npx eslint .` at 0 errors and the 12 baseline
      warnings, `npm test`, `npx expo-doctor`.
- [ ] Mutation-probe every new test, one at a time, via a file copy.
- [ ] Update §Shipping order to mark 4b shipped.
