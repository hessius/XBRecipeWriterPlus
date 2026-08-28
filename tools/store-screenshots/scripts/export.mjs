/**
 * Headless export.
 *
 * Drives the generator's `?only=` mode with Playwright and screenshots the page
 * at exactly the target resolution. This is the preferred path over the in-page
 * "Export all" button: no six-download click dance, deterministic output, and
 * it can run unattended.
 *
 * It also sidesteps `html-to-image` entirely. That library clones the DOM into
 * an SVG `foreignObject`, which is a re-implementation of rendering and has its
 * own failure modes around fonts and images; here the browser simply paints the
 * real page and we take the pixels.
 *
 *   bun run export            # every iPhone size + the promo banner
 *   bun run export -- 6.9     # just one iPhone size
 *   bun run export -- promo   # just the Discord/promo banner
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out");
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";

const SLIDE_IDS = ["hero", "import", "stages", "read", "privacy", "more"];

const IPHONE_SIZES = [
    {label: "6.9", w: 1320, h: 2868},
    {label: "6.5", w: 1284, h: 2778},
    {label: "6.3", w: 1206, h: 2622},
    {label: "6.1", w: 1125, h: 2436}
];

const PROMO = {label: "promo", w: 1920, h: 1080};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const wantsPromo = !wanted.length || wanted.includes(PROMO.label);
const sizes = wanted.length ? IPHONE_SIZES.filter((s) => wanted.includes(s.label)) : IPHONE_SIZES;

if (!sizes.length && !wantsPromo) {
    const known = [...IPHONE_SIZES.map((s) => s.label), PROMO.label].join(", ");
    console.error(`No target matched ${wanted.join(", ")}. Known: ${known}`);
    process.exit(1);
}

// Uses the Chrome already installed on the machine rather than Playwright's own
// download. The cached bundles here belong to other Playwright versions, and a
// 150 MB fetch to render six static pages is not a good trade.
const browser = await chromium.launch({channel: "chrome"});

async function capture(page, id, size, dir, file) {
    await page.setViewportSize({width: size.w, height: size.h});
    await page.goto(`${ORIGIN}/?only=${id}&w=${size.w}&h=${size.h}`, {waitUntil: "networkidle"});
    await page.waitForSelector("#shot", {timeout: 15_000});
    // Web fonts resolve after first paint; a slide captured before they land
    // silently falls back to a system face, which is the exact failure this
    // whole pipeline exists to avoid.
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({clip: {x: 0, y: 0, width: size.w, height: size.h}});
    mkdirSync(dir, {recursive: true});
    writeFileSync(resolve(dir, file), buf);
    console.log(`${file}  ${buf.length.toLocaleString()} bytes`);
}

try {
    const page = await browser.newPage({deviceScaleFactor: 1});

    for (const size of sizes) {
        const dir = resolve(OUT, `iphone-${size.label}`);
        for (const [i, id] of SLIDE_IDS.entries()) {
            await capture(page, id, size, dir, `${String(i + 1).padStart(2, "0")}-${id}-en-${size.w}x${size.h}.png`);
        }
    }

    if (wantsPromo) {
        await capture(page, "promo", PROMO, resolve(OUT, "promo"), `xbrw-promo-${PROMO.w}x${PROMO.h}.png`);
    }
} finally {
    await browser.close();
}

console.log(`\nWrote to ${OUT}`);
