import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor, hasSource, RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import type {TemperatureUnit} from "@/library/units";

jest.mock("@/library/RecipeDatabase");

/**
 * 15 g at 1:16 over two equal pours: 240 ml, 120 each, in balance.
 *
 * `addPour` inserts after the index it is given and copies from it, so the
 * first one has to say `false` — there is nothing yet to copy from.
 *
 * 15 × 16 = 240 ml total. When the "hand-fix" test edits stage 0 to 10, the
 * compensating edit brings stage 1 to 120 + 110 = 230 ml, keeping the recipe
 * within the per-stage maximum so it is writable after the fix.
 */
async function renderEditor(overrides: {onSaved?: () => void; temperatureUnit?: TemperatureUnit} = {}) {
    const recipe = new Recipe();
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.addPour(0, false);
    recipe.addPour(0);
    recipe.autoFixPourVolumes();
    recipe.pours.forEach(p => { p.flowRate = 30; });

    return renderHook(() => useRecipeEditor({
        recipeJSON:           JSON.stringify(recipe),
        temperatureUnit:      overrides.temperatureUnit ?? "C",
        onSaved:              overrides.onSaved ?? jest.fn()
    }));
}

/** A recipe with no stages at all, as the create flow produces one. */
async function renderBlankEditor() {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.OMNI;
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 65;
    recipe.grindRPM = 120;

    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         jest.fn()
    }));
}

describe("the volume readout (#40)", () => {
    it("follows the ratio without being told to repaint", async () => {
        const {result} = await renderEditor();

        expect(result.current.balance.target).toBe(240);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.RATIO, "17");
        });

        expect(result.current.balance.target).toBe(result.current.recipe!.getTotalVolume());
        expect(result.current.balance.target).toBe(15 * 17);
    });

    it("follows the dose too", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20");
        });

        expect(result.current.balance.target).toBe(20 * 16);
    });

    it("counts what the stages actually pour", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        expect(result.current.balance.poured)
            .toBe(result.current.recipe!.getPourTotalVolume());
        expect(result.current.balance.balanced).toBe(false);
    });

    it("comes back into balance when the volumes are fixed by hand", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });
        expect(result.current.balance.balanced).toBe(false);

        const short = result.current.balance.target - result.current.balance.poured;
        const last = result.current.recipe!.pours.length - 1;
        const lastVolume = result.current.recipe!.pours[last].getVolume();

        await act(async () => {
            await result.current.editStage(last, "volume", lastVolume + short);
        });

        expect(result.current.balance.balanced).toBe(true);
        expect(result.current.canWrite).toBe(true);
    });
});

describe("the two gates", () => {
    it("saves a recipe that does not add up", async () => {
        const onSaved = jest.fn();
        const {result} = await renderEditor({onSaved});

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        await act(async () => {
            result.current.saveRecipe();
        });

        expect(onSaved).toHaveBeenCalled();
    });

    it("persists a recipe without treating it as a save", async () => {
        const onSaved = jest.fn();
        const RecipeDatabase = jest.requireMock("@/library/RecipeDatabase").default;
        RecipeDatabase.mockClear();
        const {result} = await renderEditor({onSaved});

        await act(async () => {
            result.current.persistRecipe();
        });

        const store = RecipeDatabase.mock.instances.at(-1)!;
        expect(store.updateRecipe).toHaveBeenCalledWith(
            result.current.recipe!.uuid,
            result.current.recipe
        );
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("refuses to write one that does not", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        expect(result.current.canWrite).toBe(false);
        expect(result.current.canSave).toBe(true);
    });

    it("refuses both while a field is invalid", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            result.current.setInputError(true);
        });

        expect(result.current.canWrite).toBe(false);
        expect(result.current.canSave).toBe(false);
    });
});

describe("what a revert keeps", () => {
    it("keeps the account identity, which a restore does not replace", async () => {
        // A revert replaces the brew parameters, not the recipe's identity.
        // `cloudId` is identity by definition -- it says which xBloom account
        // recipe this row IS -- so a restore that dropped it would quietly
        // orphan the row, and the next sync would import the same recipe a
        // second time as though it had never been seen.
        const recipe = new Recipe();
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.grindSize = 60;
        recipe.grindRPM = 90;
        recipe.addPour(0, false);
        recipe.autoFixPourVolumes();
        recipe.pours.forEach(p => { p.flowRate = 30; });
        recipe.offline_backup = recipe.getData([]);
        recipe.cloudId = 4242;
        recipe.cloudFingerprint = "abc123";

        const {result} = await renderHook(() => useRecipeEditor({
            recipeJSON:      JSON.stringify(recipe),
            temperatureUnit: "C",
            onSaved:         jest.fn()
        }));

        const saved = result.current.revertSources.find((s) => s.id === "saved");
        expect(saved?.available).toBe(true);

        await act(async () => {
            await saved!.action();
        });

        expect(result.current.recipe?.cloudId).toBe(4242);
        expect(result.current.recipe?.cloudFingerprint).toBe("abc123");
    });
});

describe("revert sources", () => {
    it("names all four whether or not it has them", async () => {
        const {result} = await renderEditor();

        expect(result.current.revertSources.map((s) => s.id))
            .toEqual(["card", "saved", "xid", "share"]);
    });

    it("marks the ones this recipe cannot use", async () => {
        const {result} = await renderEditor();
        const byId = Object.fromEntries(
            result.current.revertSources.map((s) => [s.id, s.available])
        );

        expect(byId.card).toBe(false);
        expect(byId.share).toBe(false);
    });
});

describe("hasSource", () => {
    it("does not count whitespace as an online identifier", async () => {
        // `isValidXID` and the refresh gate both read a blank ID as no ID.
        // Untrimmed, a recipe holding a single space offered an online revert
        // and then fetched with an identifier the endpoint cannot answer.
        const recipe = new Recipe();
        recipe.xid = "   ";
        recipe.shareId = "  ";

        expect(hasSource(recipe, "xid")).toBe(false);
        expect(hasSource(recipe, "share")).toBe(false);
    });

    it("still counts a real one", async () => {
        const recipe = new Recipe();
        recipe.xid = "CGL12";
        recipe.shareId = "abc123";

        expect(hasSource(recipe, "xid")).toBe(true);
        expect(hasSource(recipe, "share")).toBe(true);
    });
});

describe("the write gate", () => {
    it("is closed for a balanced recipe whose fields are out of range", async () => {
        // Balanced and unwritable at the same time: dose 31 at ratio 100 asks
        // for 3100 ml, and one stage can hold at most 240.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}})
        );

        expect(result.current.balance.balanced).toBe(true);
        expect(result.current.canWrite).toBe(false);
    });

    it("is open for a recipe within range", async () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 15;
        recipe.ratio = 15;
        recipe.grindSize = 60;
        recipe.grindRPM = 90;
        recipe.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}})
        );

        expect(result.current.canWrite).toBe(true);
    });

    it("still allows saving a recipe that cannot be written", async () => {
        // Keeping a recipe and writing it are different permissions. A recipe
        // the machine would reject is still worth having in the library.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}})
        );

        expect(result.current.canSave).toBe(true);
    });

    it("phrases a temperature problem in the unit it was handed, not a hard-coded C", async () => {
        // 93 C is in range, but 260 C is not, and it converts to a distinctive
        // Fahrenheit figure (500 F). An implementation that hard-coded "C",
        // ignored the parameter, or fell through to the "C" default would
        // still produce a Celsius message here, so this only passes if the
        // unit actually reaches `cardWriteProblems`.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 15;
        recipe.ratio = 15;
        recipe.grindSize = 60;
        recipe.grindRPM = 90;
        recipe.pours = [new Pour(1, 225, 260, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), temperatureUnit: "F", onSaved: () => {}})
        );

        expect(result.current.writeProblems.some((p) => p.includes("500 F"))).toBe(true);
        expect(result.current.writeProblems.some((p) => p.includes("260 C"))).toBe(false);
    });
});

describe("a recipe with no stages", () => {
    it("opens with a real first stage rather than the placeholder", async () => {
        // The editor's ADD STAGE passes pours.length - 1, which is -1 when
        // there are none. Without the hook's routing this would reach
        // `Recipe.addPour(-1)`, and because the copy-from-previous path is
        // guarded by `this.pours.length > 0` an empty recipe skips it and
        // lands on the placeholder branch, which yields 1 ml at 39 C. The hook
        // instead routes an empty recipe to `addOpeningPour`, giving a real
        // first stage at the rounded target volume and 93 C.
        const {result} = await renderBlankEditor();

        await act(async () => {
            result.current.addPour(-1);
        });

        expect(result.current.recipe!.pours).toHaveLength(1);
        expect(result.current.recipe!.pours[0].volume).toBe(240);
        expect(result.current.recipe!.pours[0].temperature).toBe(93);
    });

    it("is writable after that one tap", async () => {
        const {result} = await renderBlankEditor();

        expect(result.current.canWrite).toBe(false);

        await act(async () => {
            result.current.addPour(-1);
        });

        expect(result.current.canWrite).toBe(true);
    });

    it("cannot be saved until it has one", async () => {
        // A recipe with no stages is not an unfinished recipe, it is not yet a
        // recipe: it brews nothing. Keeping an invalid recipe is deliberately
        // allowed -- an unbalanced one is saved and fixed later -- but a
        // stage-less one has nothing to come back to, and saving it puts a row
        // in the library that can neither be brewed nor written, which is a
        // worse offer than making the user tap ADD STAGE once.
        const {result} = await renderBlankEditor();

        expect(result.current.canSave).toBe(false);

        await act(async () => {
            result.current.addPour(-1);
        });

        expect(result.current.canSave).toBe(true);
    });

    it("can still be saved while it is invalid in every other way", async () => {
        // The stage gate must not quietly become a validity gate. A recipe
        // whose stages do not add up to the dose and ratio is still savable,
        // which is the behaviour the ADD STAGE guard sits beside rather than
        // replaces.
        const {result} = await renderBlankEditor();

        await act(async () => {
            result.current.addPour(-1);
        });
        await act(async () => {
            await result.current.editStage(0, "volume", 100);
        });

        expect(result.current.balance.balanced).toBe(false);
        expect(result.current.canWrite).toBe(false);
        expect(result.current.canSave).toBe(true);
    });

    it("goes back to copying the previous stage once the recipe has one", async () => {
        const {result} = await renderBlankEditor();

        await act(async () => {
            result.current.addPour(-1);
        });

        // The opening stage is itself 93 C, so asserting the second stage is
        // 93 C would pass on any route. Move stage 0 to a value distinct from
        // every default in play -- 93 (opening coffee), 85 (opening tea) and 39
        // (the placeholder floor) -- but still inside the card's 39-99
        // temperature range, then prove the second stage inherited exactly it.
        await act(async () => {
            await result.current.editStage(0, "temperature", 71);
        });
        await act(async () => {
            result.current.addPour(0);
        });

        expect(result.current.recipe!.pours).toHaveLength(2);
        expect(result.current.recipe!.pours[1].temperature).toBe(71);
    });
});

describe("the star, on the recipe that is open", () => {
    it("writes on the spot rather than waiting for SAVE", async () => {
        // The star marks where a recipe sits in the library, not what the
        // draft on the bench says. Backing out of the editor must not take it
        // off again, so it is persisted the moment it is set.
        const RecipeDatabase = require("@/library/RecipeDatabase").default;
        const {result} = await renderEditor();

        const before = RecipeDatabase.mock.instances.length;

        await act(async () => { result.current.toggleFavourite(); });

        expect(result.current.recipe?.favourite).toBe(true);
        expect(RecipeDatabase.mock.instances.length).toBeGreaterThan(before);
    });

    it("takes the star off again on a second press", async () => {
        const {result} = await renderEditor();

        await act(async () => { result.current.toggleFavourite(); });
        expect(result.current.recipe?.favourite).toBe(true);

        await act(async () => { result.current.toggleFavourite(); });
        expect(result.current.recipe?.favourite).toBe(false);
    });
});
