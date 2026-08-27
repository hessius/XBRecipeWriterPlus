import {accents, onAccent, palette} from "@/constants/colors";
import {contrast, over} from "@/test-utils/contrast";

const everyAccent = [...accents.coffee, ...accents.tea];

describe("contrast helper", () => {
    it("computes the reference ratio for black on white", () => {
        expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    });

    it("computes 1 for a colour on itself", () => {
        expect(contrast("#4A7BC8", "#4A7BC8")).toBeCloseTo(1, 5);
    });

    it("composites a translucent foreground over its background", () => {
        // Fully transparent black over white is white: no contrast at all. This
        // is what stops the suite from silently ignoring alpha and grading every
        // translucent ink as pure black.
        expect(contrast("rgba(0,0,0,0)", "#FFFFFF")).toBeCloseTo(1, 5);
    });
});

describe("accent inks", () => {
    it.each(everyAccent)("carries readable value text on %s", (accent) => {
        expect(contrast(onAccent.text, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries readable micro-labels on %s", (accent) => {
        // 11 px, and the only cue to what the number beneath it means, so it is
        // held to the same 4.5:1 as body text rather than the large-text 3:1.
        expect(contrast(onAccent.label, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries a distinguishable beverage marker on %s", (accent) => {
        expect(contrast(onAccent.marker, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("draws the pour profile stroke visibly on %s", (accent) => {
        // A stroke is a graphical object, which AA holds to 3:1.
        expect(contrast(onAccent.profileStroke, accent)).toBeGreaterThanOrEqual(3);
    });
});

describe("the action key on an accent card", () => {
    // The key is a translucent black well punched into the accent, and the tone
    // ink is drawn on top of it. Two composites deep, so neither ratio can be
    // reasoned about from the palette alone.
    it.each(everyAccent)("takes the duplicate ink on %s", (accent) => {
        expect(contrast(palette.success, over(onAccent.key, accent)))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(everyAccent)("takes the delete ink on %s", (accent) => {
        expect(contrast(palette.danger, over(onAccent.key, accent)))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(everyAccent)("stays distinguishable from the accent itself on %s", (accent) => {
        // A key that matched the card would leave the glyph floating with no
        // suggestion that it is a separate, pressable thing.
        expect(contrast(onAccent.key, accent)).toBeGreaterThanOrEqual(3);
    });
});

describe("the row actions revealed by a swipe", () => {
    // Colour appears here only as ink: the tile is the app's own surface. The
    // caption is 10 px Doto, which is small text and held to 4.5:1 — the glyph
    // beside it would pass at 3:1 and the caption would not.
    it("carries the duplicate caption on the tile", () => {
        expect(contrast(palette.success, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("carries the delete caption on the tile", () => {
        expect(contrast(palette.danger, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("palette inks on the base background", () => {
    it.each([
        ["text", palette.text],
        ["dim", palette.dim],
        ["success", palette.success],
        ["danger", palette.danger],
        ["warn", palette.warn],
        ["info", palette.info],
        ["brand", palette.brand]
    ])("keeps %s readable", (_name, colour) => {
        expect(contrast(colour, palette.base)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the brand magenta readable on a raised card too", () => {
        // It is used for the wordmark's `++` and for section headings, both of
        // which sit on `raised` as often as on `base`.
        expect(contrast(palette.brand, palette.raised)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the line colour below text contrast, as a divider not an ink", () => {
        // A guard against someone "fixing" the divider by brightening it into
        // something that reads as text.
        expect(contrast(palette.line, palette.base)).toBeLessThan(4.5);
    });
});
