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

Real device captures go in `public/screenshots/en/` as these five files:

| File | What to capture |
| --- | --- |
| `home.png` | the recipe library with 4+ recipes |
| `import.png` | the import sheet mid-resolve |
| `stages.png` | the stages deck with the pour profile visible |
| `read.png` | the NFC scan overlay with the bloom part-filled - needs a real card |
| `hero.png` | the top of the editor: dose, ratio, grind |

Capture full-frame on a real device (status bar included, no cropping) at
1206x2622 or larger. Do not crop: the `Phone` frame positions the screen with
pre-measured percentages and assumes a full, uncropped device capture.

`bun run placeholders` regenerates the flat stand-in PNGs that ship here so the
layout can be worked on before the real captures exist. Overwrite them with the
real files.

## Slides

Five slides, one idea each, in a deliberate arc:

1. **hero** - centred phone. The main promise.
2. **import** - a numbered four-step spine down the left, phone entering from the
   right. The only slide that explains a sequence rather than a single idea.
3. **stages** - two layered phones. Depth, and the only slide with a second device.
4. **read** - centred phone behind contactless arcs. The NFC money shot.
5. **privacy** - the contrast slide: inverted to magenta, no device, all type, set
   in Doto. The headline is lifted from the app's own About ticker.

The dot screen running through every slide is the same motif as the app icon,
the `Doto` face, the pour-profile fill and the splash.
