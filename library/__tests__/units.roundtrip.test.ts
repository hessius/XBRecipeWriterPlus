import {useState, createElement} from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import StageTile, {type StageField} from "@/components/StageTile";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

/**
 * The promise the units feature makes: switching to Fahrenheit and back must
 * produce a byte-identical card.
 *
 * The previous version of this test called `toDisplay`/`fromDisplay` directly
 * and diffed `getData()`, but that only proves `fromDisplay ∘ toDisplay = id`
 * — which `units.test.ts` already covers as arithmetic. Every failure mode the
 * comment here used to worry about ("something converted twice, or converted
 * on save") lives in the seam between the two functions and the screen, not
 * inside either function, and calling them directly skips that seam entirely.
 * So this drives the real control instead: `StageTile`'s stepper, in
 * Fahrenheit, is what a user actually taps — and the recipe it mutates is the
 * very one whose bytes are compared, not a freshly built stand-in, so a
 * conversion that leaked into the stored value cannot hide behind a
 * from-scratch rebuild at the same nominal starting temperature.
 *
 * This file is `.ts`, not `.tsx` (outside the set of files this task may
 * rename), so the tree below is built with `createElement` rather than JSX.
 *
 * Its first case used to seed a temperature of 39 — `CELSIUS_RANGE.min` —
 * which is exactly what `fromDisplay`'s clamp returns for any out-of-range or
 * non-finite input, so that case would have passed against a `fromDisplay`
 * that ignored its argument entirely. The temperatures below are the middle
 * and both non-`min` ends of the reachable range instead.
 */

/**
 * Writes the temperature back onto the recipe's first pour. Kept at module
 * scope, the same way `useRecipeEditor.ts`'s `applyStageField` is, so the
 * mutation happens behind a function boundary the compiler's immutability
 * check does not see as touching a hook argument directly.
 */
function applyTemperature(recipe: Recipe, field: StageField, value: number): void {
    if (field === "temperature") recipe.pours[0].temperature = value;
}

/**
 * Renders one `StageTile` bound to `recipe.pours[0]`, mutated in place by the
 * stepper the way the real editor mutates it, and republished by bumping a
 * key — the same convention `useRecipeEditor` uses.
 */
function RoundTripHarness({recipe}: {recipe: Recipe}) {
    "use no memo";
    const [, setKey] = useState(0);

    return createElement(StageTile, {
        pour: recipe.pours[0], index: 0, count: 1, open: true,
        accent: "#FFFFFF", isTea: false, temperatureUnit: "F",
        onToggle: () => {},
        onChange: (_index: number, field: StageField, value: number) => {
            applyTemperature(recipe, field, value);
            setKey((k) => k + 1);
        },
        onDelete: () => {}
    });
}

function bytesOf(recipe: Recipe): string {
    return JSON.stringify(recipe.getData(new Array(32).fill(0)));
}

function recipeAt(celsius: number): Recipe {
    const r = new Recipe();
    r.addPour(0, false);
    r.pours[0].temperature = celsius;
    return r;
}

describe("stepping the temperature in Fahrenheit and back", () => {
    it.each([40, 65, 98])(
        "leaves the card bytes untouched for a stage that started at %i C",
        async (initialCelsius) => {
            const recipe = recipeAt(initialCelsius);
            const before = bytesOf(recipe);

            await renderWithProviders(createElement(RoundTripHarness, {recipe}));

            await fireEvent.press(screen.getByLabelText("Increase Temperature"));
            await fireEvent.press(screen.getByLabelText("Decrease Temperature"));

            // The very recipe the harness mutated, not a fresh stand-in built
            // at the same nominal temperature — a leaked conversion changes
            // this object's stored value, and a rebuild would not see it.
            expect(bytesOf(recipe)).toBe(before);
        }
    );

    it("actually moves the stored value on the way, rather than the step being a no-op", async () => {
        // Without this, the test above would also pass for a stepper that was
        // wired to do nothing at all.
        const onChange = jest.fn();
        const recipe = recipeAt(65);

        await renderWithProviders(createElement(StageTile, {
            pour: recipe.pours[0], index: 0, count: 1, open: true,
            accent: "#FFFFFF", isTea: false, temperatureUnit: "F",
            onToggle: () => {}, onChange, onDelete: () => {}
        }));

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        // 65 C is 149 F; the next storable Fahrenheit value is 151 F, which is
        // 66 C — a change a byte-identical-after-a-round-trip assertion alone
        // would not catch if the wiring silently dropped the edit.
        expect(onChange).toHaveBeenCalledWith(0, "temperature", 66);
    });
});
