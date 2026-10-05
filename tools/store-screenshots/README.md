# Store screenshots

A self-contained Next.js page that renders the App Store screenshots and the
Discord/promo banner for XBRW++, and a Playwright script that exports them at
Apple's required resolutions.

This directory is **not** part of the app build. It is deliberately fenced off
from the Expo toolchain in three places, and all three are needed or the app's
CI gate breaks:

| File | Exclusion | Why |
| --- | --- | --- |
| `eslint.config.js` | `tools/*` in `ignores` | the generator is made almost entirely of colour literals, which the palette rule rejects wholesale |
| `tsconfig.json` | `"exclude": ["tools"]` | the root `include` is `**/*.ts(x)`, so it would otherwise typecheck a Next app against the RN config |
| `jest.config.js` | `modulePathIgnorePatterns` | keeps `jest-expo` out of the `node_modules` here |

Typecheck the generator on its own terms instead:

```bash
cd tools/store-screenshots
bun install
bunx tsc --noEmit
```

## Workflow

```bash
bun run dev                  # http://localhost:3000 - preview grid
bun run export               # every iPhone size + the promo banner -> out/
bun run export -- 6.3        # one iPhone size
bun run export -- promo      # just the 1920x1080 banner
```

`export` drives the page's `?only=<id>&w=&h=` mode with Playwright and
screenshots the real page, rather than going through `html-to-image`. It needs
the dev server running, and it uses the Chrome already installed on the machine
(`channel: "chrome"`) rather than downloading a Playwright bundle.

## Screenshots

Real device captures go in `public/screenshots/en/` as these ten files:

| File | What to capture |
| --- | --- |
| `home.png` | the recipe library in the plain grid, 4+ recipes, machine dot connected |
| `shelves.png` | the same library in the shelf layout, several shelves showing their marks |
| `stages.png` | the stages deck with the pour profile visible |
| `read.png` | the NFC scan overlay with the bloom part-filled - needs a real card |
| `hero.png` | the top of the editor: dose, ratio, grind |
| `recipe.png` | the editor on a recipe that breaks the card: a half ratio and well over nine stages, with the app's own card warning showing. Slide 3's chips are drawn over this, so the capture has to prove them |
| `brew.png` | a live brew, mid-pour: graph part-drawn, flow rate showing, timer running - needs a machine |
| `history.png` | one past brew's detail, with its full chart |
| `historylist.png` | the brew history list, several brews showing |
| `compare.png` | two brews on the compare screen, both traces drawn |
| `hub.png` | the community hub list, scrolled so several rows show |

Capture full-frame on a real device (status bar included, no cropping) at
1206x2622 or larger. Do not crop: the `Phone` frame positions the screen with
pre-measured percentages and assumes a full, uncropped device capture.

`bun run placeholders` writes flat stand-in PNGs for any slot that does not have
one yet, so a layout can be built before the capture exists. It **skips files
that are already there** - a real capture costs a phone, and for `read.png` and
`brew.png` a card or a machine, so it is not something a script should quietly
throw away. Pass `--force` to regenerate a placeholder on purpose.

## Slides

Ten slides, Apple's maximum, one idea each. The order changed for 2.0: the app
no longer leads on the cards. It leads on the machine, because what a buyer
is choosing between is this app and the official one, and the cards are a
thing only existing owners already know they want.

1. **hero** - three phones fanned: library, editor, brew. The whole product in
   one image, under the store subtitle verbatim.
2. **brew** - tilted phone, off centre, behind a rising dotted trace. The graph
   pulled out of the screen so it survives thumbnail size.
3. **beyond** - three Doto chips over `recipe.png`, which shows all three in the
   app. The only slide that argues rather than shows, and the only one that
   names the official app. The chips are examples of what a card cannot hold,
   not a comparison list: only the stage count clears both bars, and that one
   is measured. Read the refusals section of `docs/store-listing.md` before
   touching the headline - it records what was traded away and what the
   fallback is if review objects.
4. **dial** - two traces, one lagging the other. The comparison screen, and the
   only slide that poses a question instead of making a claim.
5. **history** - two phones, the list set back behind one record, over five
   fading ghosts of slide 2's trace. "Every brew" is a claim the list makes
   and a single record cannot.
6. **library** - centred phone on a wall of tinted cards. The library outgrows
   the cards it started from.
7. **shelves** - the same library sorted, over a grid of shelf marks. Paired
   with 6 on purpose: two views of one library, which is why it does not reuse
   the card wall.
8. **hub** - ragged bars in columns, a catalogue seen edge on. Deliberately not
   the card wall, so the hub and the library do not read as the same idea.
9. **stages** - two layered phones, the editor behind the stage deck.
10. **read** - centred phone behind contactless arcs. The NFC shot, no longer
    the headline.

There is no privacy slide any more. It claimed "No cloud. No account.", which
2.0 made untrue, and the honest shorter version was not worth a slot that could
show a feature instead.

## The promo banner

A 1920x1080 landscape banner for Discord, not a store asset. Apple never sees
it, so it can carry a link and a call to action.

Rewritten for 2.0. It previously recruited testers for an app that had not
shipped and sold "rewrite the card that came with your coffee", which was the
whole product in 1.x. Both were true when written. A banner that lives in a
repo has no way of failing when it goes stale, so check it whenever the
positioning moves: it now carries the store subtitle verbatim, the same line
slide 1 uses.

Two things it deliberately does not do. It does not say "no cloud" - the app
makes seven kinds of call (`constants/network.ts`) and the listing already
refused that claim, so repeating it here would leave the two disagreeing. And
the call to action is plain text, not Apple's badge artwork, which has its own
guidelines and cannot be redrawn by hand.

Adding or reordering a slide means touching three places: the `SLIDES` array in
`src/app/page.tsx`, `SLIDE_IDS` in `scripts/export.mjs` (the headless export
walks its own list), and this table. A new capture also means extending the
`SHOTS` tuple and the `SLOTS` list in `scripts/make-placeholders.mjs`.

The dot screen running through every slide is the same motif as the app icon,
the `Doto` face, the pour-profile fill and the splash.
