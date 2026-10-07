import type {BrewRecord} from "@/library/brew/BrewRecord";
import {dialNote, readDialAfterBrew, type DialMachine}
    from "@/library/brew/dialAfterBrew";
import {GRINDER_OFF_VALUE} from "@/library/Recipe";

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

describe("dialNote", () => {
    it("falls back to the recipe's own grind when no dial reading arrived", () => {
        const figure = dialNote(record({
            grinderUsed: true, grindSize: 58, dialAfter: undefined
        }));
        expect(figure).toEqual({kind: "recipe", recipe: 58});
    });

    it("prefers the confirmed dial over the recipe when it has one", () => {
        // Precedence against the recipe fallback specifically: keep this even
        // though older dial tests below use the same record shape.
        const figure = dialNote(record({
            grinderUsed: true, grindSize: 58, dialAfter: 62
        }));
        expect(figure).toEqual({kind: "dial", dial: 62, recipe: 58});
    });

    it("still says nothing when the grinder never ran", () => {
        // The fallback is about a missing reading, not a missing grind. A brew
        // that ground nothing has no grind to report whatever the recipe said.
        expect(dialNote(record({
            grinderUsed: undefined, grindSize: 58, dialAfter: undefined
        }))).toBeNull();
    });

    it("still says nothing when the record kept no recipe grind", () => {
        expect(dialNote(record({
            grinderUsed: true, grindSize: undefined, dialAfter: undefined
        }))).toBeNull();
    });

    it("still says nothing when the recipe grind is below the on-card band", () => {
        expect(dialNote(record({
            grinderUsed: true, grindSize: 39, dialAfter: undefined
        }))).toBeNull();
    });

    it("still says nothing when the recipe grind is above the on-card band", () => {
        expect(dialNote(record({
            grinderUsed: true, grindSize: 82, dialAfter: undefined
        }))).toBeNull();
    });

    it("prefers the off fact over the recipe fallback", () => {
        // Precedence against the recipe fallback specifically: keep this even
        // though older off tests below use the same record shape.
        expect(dialNote(record({
            grinderUsed: false, grindSize: 58, dialAfter: undefined
        }))).toEqual({kind: "off"});
    });

    it("reports the confirmed dial as the grind figure", () => {
        expect(dialNote(record({grinderUsed: true, grindSize: 47, dialAfter: 47})))
            .toEqual({kind: "dial", dial: 47, recipe: null});
    });

    it("badges the recipe grind when it differed from the dial", () => {
        expect(dialNote(record({grinderUsed: true, grindSize: 52, dialAfter: 47})))
            .toEqual({kind: "dial", dial: 47, recipe: 52});
    });

    it("does not badge a recipe grind matching the dial", () => {
        expect(dialNote(record({grinderUsed: true, grindSize: 47, dialAfter: 47})))
            .toEqual({kind: "dial", dial: 47, recipe: null});
    });

    it("reports off when the record says the grinder was off", () => {
        expect(dialNote(record({grinderUsed: false, grindSize: 52, dialAfter: 47})))
            .toEqual({kind: "off"});
    });

    it("reports off without needing a dial reading", () => {
        expect(dialNote(record({grinderUsed: false, grindSize: 52})))
            .toEqual({kind: "off"});
    });

    it("reports off when the snapshotted recipe grind means grinder off", () => {
        expect(dialNote(record({
            grinderUsed: undefined,
            grindSize:   GRINDER_OFF_VALUE,
            dialAfter:   47
        }))).toEqual({kind: "off"});
    });

    it("reports off when the two grinder records disagree", () => {
        expect(dialNote(record({
            grinderUsed: true,
            grindSize:   GRINDER_OFF_VALUE,
            dialAfter:   47
        }))).toEqual({kind: "off"});
    });

    it("says nothing about a legacy brew with only a dial reading", () => {
        expect(dialNote(record({dialAfter: 47}))).toBeNull();
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
