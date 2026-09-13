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

Real device captures go in `public/screenshots/en/` as these seven files:

| File | What to capture |
| --- | --- |
| `home.png` | the recipe library with 4+ recipes, machine dot connected |
| `import.png` | the import sheet mid-resolve |
| `stages.png` | the stages deck with the pour profile visible |
| `read.png` | the NFC scan overlay with the bloom part-filled - needs a real card |
| `hero.png` | the top of the editor: dose, ratio, grind |
| `brew.png` | a live brew, mid-pour: graph part-drawn, timer running - needs a machine |
| `history.png` | one past brew's detail, with its full chart |

Capture full-frame on a real device (status bar included, no cropping) at
1206x2622 or larger. Do not crop: the `Phone` frame positions the screen with
pre-measured percentages and assumes a full, uncropped device capture.

`bun run placeholders` writes flat stand-in PNGs for any slot that does not have
one yet, so a layout can be built before the capture exists. It **skips files
that are already there** - a real capture costs a phone, and for `read.png` and
`brew.png` a card or a machine, so it is not something a script should quietly
throw away. Pass `--force` to regenerate a placeholder on purpose.

## Slides

Eight slides, one idea each, in a deliberate arc. The order sells the cards
first and the machine second, because the cards are what people arrive looking
for and the brewing is what keeps them:

1. **hero** - three phones fanned: library, editor, brew. The arc of the whole
   product in one image, under a headline that promises only the cards.
2. **library** - centred phone on a wall of tinted cards. The library outgrows
   the cards it started from.
3. **brew** - tilted phone, off centre, behind a rising dotted trace. The graph
   pulled out of the screen so it survives thumbnail size.
4. **stages** - two layered phones. Depth, and the only slide with a second device.
5. **import** - a numbered four-step spine, phone entering from below. The only
   slide that explains a sequence rather than a single idea.
6. **read** - centred phone behind contactless arcs. The NFC money shot, no
   longer the headline.
7. **history** - phone at the right, behind five fading ghosts of slide 3's
   trace. The live graph rewritten as an archive.
8. **privacy** - the contrast slide: inverted to magenta, no device, all type, set
   in Doto. The headline is lifted from the app's own About ticker.

Adding or reordering a slide means touching three places: the `SLIDES` array in
`src/app/page.tsx`, `SLIDE_IDS` in `scripts/export.mjs` (the headless export
walks its own list), and this table. A new capture also means extending the
`SHOTS` tuple and the `SLOTS` list in `scripts/make-placeholders.mjs`.

The dot screen running through every slide is the same motif as the app icon,
the `Doto` face, the pour-profile fill and the splash.
