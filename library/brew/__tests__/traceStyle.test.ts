import {accents, cupLineFor, palette} from "@/constants/colors";
import {
    channelStyle,
    referenceCupColour,
    referenceWaterColour
} from "@/library/brew/traceStyle";

const ACCENT = accents.coffee[1];

describe("traceStyle", () => {
    it("draws water solid, thick, in the accent", () => {
        expect(channelStyle("water", {accent: ACCENT})).toEqual({
            stroke:          ACCENT,
            strokeWidth:     2.5,
            strokeDasharray: undefined,
            strokeLinecap:   "round",
            strokeLinejoin:  "round"
        });
    });

    it("turns the water line amber while overflow protection holds it", () => {
        expect(channelStyle("water", {accent: ACCENT, holding: true}).stroke)
            .toBe(palette.warn);
    });

    it("keeps the reference grey even where that brew was held", () => {
        expect(channelStyle("water", {accent: ACCENT, holding: true, role: "reference"})
            .stroke).toBe(referenceWaterColour);
    });

    it("draws cup dotted, in the accent's complement", () => {
        expect(channelStyle("cup", {accent: ACCENT})).toEqual({
            stroke:          cupLineFor(ACCENT),
            strokeWidth:     2,
            strokeDasharray: "1 3",
            strokeLinecap:   "round",
            strokeLinejoin:  undefined
        });
    });

    it("draws the plan grey and dashed", () => {
        expect(channelStyle("plan", {accent: ACCENT})).toEqual({
            stroke:          palette.muted,
            strokeWidth:     1.5,
            strokeDasharray: "4 4",
            strokeLinecap:   undefined,
            strokeLinejoin:  undefined
        });
    });

    it("uses a caller's animated plan colour", () => {
        expect(channelStyle("plan", {accent: ACCENT, planColour: "#ABCDEF"}).stroke)
            .toBe("#ABCDEF");
    });

    it("keeps the plan muted without an animated plan colour", () => {
        expect(channelStyle("plan", {accent: ACCENT}).stroke).toBe(palette.muted);
    });

    it("keeps the plan's dashes but lets a caller fuse them", () => {
        expect(channelStyle("plan", {accent: ACCENT, dashed: false}).strokeDasharray)
            .toBeUndefined();
    });

    it("greys the reference brew without changing its line style", () => {
        const subject = channelStyle("cup", {accent: ACCENT});
        const reference = channelStyle("cup", {accent: ACCENT, role: "reference"});
        expect(reference.stroke).toBe(referenceCupColour);
        expect(reference.strokeWidth).toBe(subject.strokeWidth);
        expect(reference.strokeDasharray).toBe(subject.strokeDasharray);
    });

    it("gives the reference cup the brighter grey, because cup leads", () => {
        expect(referenceCupColour).toBe(palette.dim);
        expect(referenceWaterColour).toBe(palette.muted);
    });
});
