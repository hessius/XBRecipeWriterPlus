import {brewFigures} from "@/library/brew/brewFigures";

describe("brewFigures", () => {
    it("times from the first drop and weighs the cup", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 1_000, endedAt: 873_000, cupTotal: 243.6
        })).toBe("14:32 · 244 G");
    });

    it("falls back to the start where no first drop was recorded", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 0, endedAt: 60_000, cupTotal: 200
        })).toBe("1:00 · 200 G");
    });
});
