import {unobservedBrew} from "@/library/brew/BrewRecord";

/**
 * The brew nobody watched.
 *
 * A user who writes cards and brews at the machine has no Bluetooth brew to
 * rate, so without this the rating axis ships permanently empty for them. The
 * resolution the design settled on is to give them the thing they actually
 * have: a brew that happened where the app could not see it.
 */
describe("unobservedBrew", () => {
    const input = {
        recipeUuid: "uuid-1", recipeName: "Ethiopia", accent: "#ff0000",
        rating: 4, at: 5_000, id: "hand-1"
    };

    it("says it was not watched", () => {
        // An explicit field rather than a figure of zero. A brew refused for
        // want of water has no water and no held time either, and it is a brew
        // the app watched closely enough to know why it stopped.
        expect(unobservedBrew(input).watched).toBe(false);
    });

    it("carries the verdict that is the whole of it", () => {
        expect(unobservedBrew(input).rating).toBe(4);
    });

    it("is pinned, because a judgement is all it is", () => {
        // There is nothing here for the retention sweep to take -- no samples
        // -- but the record itself is only the rating, so it is kept on the
        // same rule that keeps a judged brew.
        expect(unobservedBrew(input).pinned).toBe(true);
    });

    it("measures nothing, because nothing was measured", () => {
        const brew = unobservedBrew(input);
        expect([brew.waterTotal, brew.cupTotal, brew.heldSeconds, brew.pours])
            .toEqual([0, 0, 0, 0]);
    });

    it("happened at one instant rather than over a span", () => {
        const brew = unobservedBrew(input);
        expect(brew.startedAt).toBe(5_000);
        expect(brew.endedAt).toBe(5_000);
        // Zero, the app's word for "it never poured", rather than a first drop
        // the app would be inventing.
        expect(brew.pouringAt).toBe(0);
    });

    it("did not fail", () => {
        const brew = unobservedBrew(input);
        expect(brew.outcome).toBe("done");
        expect(brew.failure).toBeNull();
    });

    it("snapshots the recipe rather than pointing at it", () => {
        const brew = unobservedBrew(input);
        expect(brew.recipeName).toBe("Ethiopia");
        expect(brew.accent).toBe("#ff0000");
        expect(brew.recipeUuid).toBe("uuid-1");
    });

    it("mints its own id when none is handed to it", () => {
        const first = unobservedBrew({...input, id: undefined});
        const second = unobservedBrew({...input, id: undefined});
        expect(first.id).not.toBe("");
        expect(first.id).not.toBe(second.id);
    });
});
