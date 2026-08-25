import config from "@/tamagui.config";

/** How far a spring is from critical damping. Below 1 it overshoots. */
function dampingRatio(spring: {damping: number; mass: number; stiffness: number}) {
    return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
}

describe("the sheet spring", () => {
    // A sheet is a surface the height of the screen, not a control answering a
    // finger. `quick` overshoots by design -- that liveliness is right on a
    // button and reads as a wobble on something this large, which is what made
    // the sheet look as though it arrived before it had finished moving.
    const springs = config.animations as unknown as {
        animations: Record<string, {damping: number; mass: number; stiffness: number}>;
    };

    it("is damped enough not to overshoot", () => {
        expect(dampingRatio(springs.animations.sheet)).toBeGreaterThanOrEqual(0.85);
    });

    it("is more damped than the spring the controls use", () => {
        expect(dampingRatio(springs.animations.sheet))
            .toBeGreaterThan(dampingRatio(springs.animations.quick));
    });

    it("still settles quickly", () => {
        // Undamped period, as a proxy: a slow sheet is its own problem.
        const {mass, stiffness} = springs.animations.sheet;
        expect(2 * Math.PI * Math.sqrt(mass / stiffness)).toBeLessThan(0.4);
    });
});
