# Buy me a coffee

2026-09-28

## What this is

A tip jar. One tile in Settings and one line in About, both opening
`https://buymeacoffee.com/hsus` in the system browser. It unlocks nothing,
stores nothing, and asks once.

## Where it sits, and why that was the decision

Third block in Settings, under About and Brew history, above the preference
sections. Not on the About screen alone, which is where a support link
conventionally lives: almost nobody opens an About screen, and a link nobody
reaches is a link that may as well not be there. The tile sits among the rows
people actually open Settings for.

About still carries a `LinkText` beside the source and the issue tracker,
because that is where someone who went looking would expect to find it. Both
read `SUPPORT_URL` from `components/SupportTile.tsx`, so there is one place the
handle is spelled.

## The tile

`components/SupportTile.tsx`. A filled `palette.brand` tile, and the only solid
brand fill in the app. `brand` is documented as marking the app being itself and
never a state, which is what this is: the author asking, not the app reporting.

It is deliberately louder than everything around it. Three quieter treatments
were drawn first (a magenta settings row, an outlined card with a brand
hairline, and this) and the quiet ones lost on exactly the ground the placement
decision turns on.

Copy:

> **Buy me a coffee**
> Built by one person in his own time. Free and open source. If you want to, I
> will not say no.

The title carries the subject so the closer can be three words. Open source is
stated here as well as in About, because this is the tile far more people see.

### The contrast finding

Both lines take solid `onAccent.text`, not the softer `onAccent.label` an accent
tile uses for its second line. That token promises 5.1:1 worst case, and the
promise is scoped to the twelve recipe accents. `brand` is not one of them and
is darker than all of them, so `onAccent.label` measures **3.80:1** on it and
misses AA. `onAccent.text` is **5.18:1**. Hierarchy between the two lines comes
from size and weight instead of alpha.

`components/__tests__/colors.test.ts` pins all three measurements, including the
failing one, so the softer token cannot be reintroduced by someone looking for
a second level of hierarchy.

## Statelessness

No receipt, no thanks screen, no "already supported" flag. That means no key in
`Settings.DEFAULTS`, and therefore nothing to add to `settingsSnapshot()` in
`app/settings.tsx`. A settings key that never reaches the snapshot is how
`showHints` once went missing from backups; the cheapest way not to repeat that
is not to have the key.

`app/__tests__/settings.test.tsx` asserts no support-shaped key exists, so a
later "thanks for supporting" state cannot be added without the backup question
being asked out loud.

## The shared open path

`LinkText` already held the `Linking.openURL(...).catch(notify)` dance inline.
It is now `components/openLink.ts`, used by both. `openURL` rejects when nothing
can handle the scheme, and unhandled that rejection is a red box in development
and silence in production: the developer is interrupted by a failure the user is
never told about. One copy, so the two cannot drift.

It lives in `components/` despite having no JSX, because it depends on the toast
dispatcher, which is a component module, and `library/` is React-free by rule.

## App Store

Guideline 3.2.1(vii) reserves donation collection for approved nonprofits and
3.1.1 requires IAP for anything that unlocks. This unlocks nothing and opens
externally, which is what most independent apps do and what usually passes.
The risk was weighed and accepted rather than overlooked. Nothing here should
grow an unlock without that decision being revisited.

## Not doing

- No IAP tip tiers.
- No first-run or post-brew prompt. The tile asks once, where it stands.
- No in-app browser. `expo-web-browser` is not a dependency and this does not
  justify adding one.
