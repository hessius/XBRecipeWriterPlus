import {bypassTempValue, EVENT} from "@/library/machine/protocol";

describe("bypassTempValue", () => {
    it("scales by ten under the scaled reading", () => {
        expect(bypassTempValue(60, "scaled")).toBe(600);
    });

    it("sends the degrees as they are under the plain reading", () => {
        expect(bypassTempValue(60, "plain")).toBe(60);
    });

    it("rounds rather than truncating", () => {
        expect(bypassTempValue(60.06, "scaled")).toBe(601);
        expect(bypassTempValue(60.6, "plain")).toBe(61);
    });
});

describe("RD_BYPASS", () => {
    it("is 40520", () => {
        expect(EVENT.RD_BYPASS).toBe(40520);
    });
});
