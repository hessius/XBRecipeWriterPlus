import {bypassRungState} from "@/library/brew/bypassState";

const base = {
    phaseName: "pouring",
    over: false,
    settling: false,
    activeIndex: 0,
    stages: 3,
    lastPauseDone: false,
    delivered: 0
};

describe("bypassRungState", () => {
    it("is pending before the brew starts", () => {
        expect(bypassRungState({...base, activeIndex: null})).toBe("pending");
    });

    it("is pending in the middle of the brew", () => {
        expect(bypassRungState({...base, activeIndex: 1})).toBe("pending");
    });

    it("waits once the last stage has finished its rest", () => {
        expect(bypassRungState({...base, activeIndex: 2, lastPauseDone: true}))
            .toBe("waiting");
    });

    it("waits through the settle, if the bypass has not fired", () => {
        expect(bypassRungState({...base, activeIndex: 3, settling: true}))
            .toBe("waiting");
    });

    it("fills while the machine is dispensing", () => {
        expect(bypassRungState({...base, phaseName: "bypass", activeIndex: 3}))
            .toBe("filling");
    });

    it("is done once the brew is over and water arrived", () => {
        expect(bypassRungState({...base, over: true, activeIndex: 3, delivered: 5}))
            .toBe("done");
    });

    it("is still waiting on a finished brew that never dispensed", () => {
        // Older firmware, or a machine that skipped it. Better an honest
        // "never arrived" than a rung that claims 0 of 5 ml was delivered.
        expect(bypassRungState({...base, over: true, activeIndex: 3, delivered: 0}))
            .toBe("waiting");
    });
});
