/**
 * Turning a catalogue stage plan into pours the ladder can draw.
 *
 * The recipe is not owned at this point and must not be: this produces `Pour`
 * objects for a drawing, not a `Recipe` for a library.
 */
import type {HubPour} from "@/library/hub/hubApi";
import {hubPours} from "@/library/hub/hubStages";
import {POUR_PATTERN} from "@/library/Pour";

function stage(over: Partial<HubPour> = {}): HubPour {
    return {theName: "Bloom", volume: 60, temperature: 95, pausing: 40, pattern: 3, ...over};
}

describe("reading a catalogue stage plan", () => {
    it("maps the catalogue's pattern numbers onto the app's", () => {
        // The two numberings disagree and neither is wrong. Getting this
        // backwards draws a spiral on a recipe that says centred, everywhere.
        expect(hubPours([stage({pattern: 1})])[0].pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(hubPours([stage({pattern: 2})])[0].pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(hubPours([stage({pattern: 3})])[0].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
    });

    it("falls back to circular for a pattern it has not met", () => {
        // What `XBloomRecipe` already does with the share endpoint's plans.
        expect(hubPours([stage({pattern: 9})])[0].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
    });

    it("numbers the pours from one", () => {
        const pours = hubPours([stage(), stage({theName: "Pour2"})]);
        expect(pours.map((p) => p.pourNumber)).toEqual([1, 2]);
    });

    it("carries volume, temperature and pause across", () => {
        const [pour] = hubPours([stage({volume: 45, temperature: 92, pausing: 17})]);
        expect(pour.volume).toBe(45);
        expect(pour.temperature).toBe(92);
        expect(pour.pauseTime).toBe(17);
    });

    it("leaves the flow rate unset, because the catalogue does not say", () => {
        // `pourSeconds` already falls back to the default flow for a pour with
        // no flow rate. Writing a number in here would be inventing one, and
        // the ladder would draw it as though the recipe had asked for it.
        expect(hubPours([stage()])[0].flowRate).toBeLessThanOrEqual(0);
    });

    it("leaves agitation alone, because the catalogue does not say", () => {
        // `Pour.agitation` starts at -1, and every bit of -1 is set, so
        // reading `agitationBefore` off an unset pour returns true. The ladder
        // does not read it; nothing here should set it either way.
        expect(hubPours([stage()])[0].agitation).toBe(-1);
    });

    it("survives a plan the server did not send", () => {
        expect(hubPours(null)).toEqual([]);
        expect(hubPours(undefined)).toEqual([]);
        expect(hubPours([])).toEqual([]);
    });
});
