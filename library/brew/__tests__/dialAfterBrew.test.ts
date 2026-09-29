import type {BrewRecord} from "@/library/brew/BrewRecord";
import {dialNote, dialWasMoved, readDialAfterBrew, type DialMachine}
    from "@/library/brew/dialAfterBrew";

function record(overrides: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-1",
        recipeUuid: "uuid-1",
        recipeName: "Ethiopia Guji",
        accent: "#ff8800",
        startedAt: 1_000_000,
        pouringAt: 1_000_500,
        endedAt: 1_200_000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 200,
        cupTotal: 180,
        heldSeconds: 0,
        ...overrides
    };
}

/**
 * A machine that answers, or does not, and reports a dial.
 *
 * `answers` is kept separate from `grindSize` on purpose: the failure this
 * whole path exists to prevent is a machine that stays silent while `info`
 * goes on holding a perfectly plausible pre-brew number.
 */
function machineThat(
    answers: boolean,
    grindSize: number | null = 47
): DialMachine & {asked: number} {
    const fake = {
        asked: 0,
        info: grindSize === null ? null : {grindSize},
        askHowItIsDoing: async () => {
            fake.asked++;
            return answers;
        }
    };
    return fake;
}

describe("readDialAfterBrew", () => {
    it("keeps a reading the machine confirmed", async () => {
        const machine = machineThat(true, 47);
        const saved: [string, number][] = [];
        const got = await readDialAfterBrew(machine, record(), (id, dial) => {
            saved.push([id, dial]);
        });
        expect(got).toBe(47);
        expect(saved).toEqual([["brew-1", 47]]);
    });

    it("keeps nothing when the machine did not answer", async () => {
        // `info` still holds the pre-brew value here, which is exactly the
        // number this path exists to avoid recording. Silence has to be
        // stored as an absence, or nothing downstream could tell them apart.
        const machine = machineThat(false, 47);
        const saved: [string, number][] = [];
        const got = await readDialAfterBrew(machine, record(), (id, dial) => {
            saved.push([id, dial]);
        });
        expect(got).toBeNull();
        expect(saved).toEqual([]);
    });

    it("does not ask a brew that never got past the grind", async () => {
        // A brew cancelled before the pour opened. Asking would beep for a
        // reading about a grind that never happened.
        const machine = machineThat(true, 47);
        const saved: [string, number][] = [];
        const got = await readDialAfterBrew(
            machine,
            record({pouringAt: 0, outcome: "cancelled"}),
            (id, dial) => { saved.push([id, dial]); }
        );
        expect(got).toBeNull();
        expect(machine.asked).toBe(0);
        expect(saved).toEqual([]);
    });

    it("asks once on a brew that poured and was then cancelled", async () => {
        // The grinder ran and the dose is spent. The reading is about the
        // grind, not about how the brew ended.
        const machine = machineThat(true, 52);
        const saved: [string, number][] = [];
        await readDialAfterBrew(
            machine,
            record({outcome: "cancelled"}),
            (id, dial) => { saved.push([id, dial]); }
        );
        expect(machine.asked).toBe(1);
        expect(saved).toEqual([["brew-1", 52]]);
    });

    it("keeps nothing when the machine answered without a dial", async () => {
        const machine = machineThat(true, null);
        const saved: [string, number][] = [];
        const got = await readDialAfterBrew(machine, record(), (id, dial) => {
            saved.push([id, dial]);
        });
        expect(got).toBeNull();
        expect(saved).toEqual([]);
    });
});

describe("dialWasMoved", () => {
    it("is true when the two readings differ", () => {
        expect(dialWasMoved(record({dialBefore: 47, dialAfter: 52}))).toBe(true);
    });

    it("is false when they agree", () => {
        expect(dialWasMoved(record({dialBefore: 47, dialAfter: 47}))).toBe(false);
    });

    it("is false when only one reading exists", () => {
        // One reading is a position, not a movement.
        expect(dialWasMoved(record({dialAfter: 52}))).toBe(false);
        expect(dialWasMoved(record({dialBefore: 47}))).toBe(false);
    });
});

describe("dialNote", () => {
    it("reports where the dial was and stops", () => {
        // Not "ground at 47". The dial proves the dial's position and nothing
        // about how the coffee was ground, and somebody using a hand grinder
        // has one sitting wherever it was last left.
        expect(dialNote(record({dialAfter: 47}))).toBe("MACHINE DIAL 47");
    });

    it("says so when the dial was moved during the brew", () => {
        expect(dialNote(record({dialBefore: 52, dialAfter: 47})))
            .toBe("MACHINE DIAL 47, MOVED FROM 52");
    });

    it("says nothing about a dial that did not move", () => {
        expect(dialNote(record({dialBefore: 47, dialAfter: 47}))).toBe("MACHINE DIAL 47");
    });

    it("says nothing at all when only the pre-brew reading exists", () => {
        // That reading is the setting that was about to be overridden. On its
        // own it is not evidence of anything, so it may not be reported.
        expect(dialNote(record({dialBefore: 47}))).toBeNull();
    });

    it("says nothing at all for a brew that took no reading", () => {
        expect(dialNote(record())).toBeNull();
    });
});
