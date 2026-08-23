import {
    TONES,
    libTypeToTone,
    resolveNotice,
    toneToLibType,
    type NoticeTone
} from "@/library/notify";

describe("resolveNotice", () => {
    it("gives each tone its own glyph", () => {
        const glyphs = TONES.map((tone) => resolveNotice({tone, message: "x"}).glyph);
        expect(new Set(glyphs).size).toBe(TONES.length);
    });

    it("passes the message through untouched", () => {
        expect(resolveNotice({tone: "info", message: "Already in your library"}).message)
            .toBe("Already in your library");
    });

    it("leaves an error on screen longer than a success", () => {
        // A success confirms something the user just did and they already know
        // it happened. An error may need reading twice.
        expect(resolveNotice({tone: "error", message: "x"}).duration)
            .toBeGreaterThan(resolveNotice({tone: "success", message: "x"}).duration);
    });

    it.each(TONES)("gives %s a positive duration", (tone: NoticeTone) => {
        expect(resolveNotice({tone, message: "x"}).duration).toBeGreaterThan(0);
    });
});

describe("the toast library's type strings", () => {
    it.each(TONES)("round-trips %s", (tone: NoticeTone) => {
        expect(libTypeToTone(toneToLibType(tone))).toBe(tone);
    });

    it("falls back to info for a type the library produced on its own", () => {
        // toast.loading() and friends are never dispatched by notify(), but the
        // renderer sees every toast in the queue and must not crash on one.
        expect(libTypeToTone("loading")).toBe("info");
    });
});

describe("tone labels", () => {
    it("names each tone in the machine's own words", () => {
        expect(resolveNotice({tone: "success", message: "x"}).label).toBe("DONE");
        expect(resolveNotice({tone: "error", message: "x"}).label).toBe("ERROR");
        expect(resolveNotice({tone: "info", message: "x"}).label).toBe("NOTE");
    });

    it.each(TONES)("gives %s a label that survives being set in Doto", (tone) => {
        // Upper case and short: the label is rendered in Doto at 11px, which is
        // the face's legibility floor, and a long or mixed-case word turns to
        // texture at that size.
        const {label} = resolveNotice({tone, message: "x"});
        expect(label).toBe(label.toUpperCase());
        expect(label.length).toBeLessThanOrEqual(5);
    });
});
