import {CUP_TYPE} from "@/library/Recipe";
import {
    snapshotRecipe, prepareSet, snapshotStatus, slotMarkers, emptySlotRecord
} from "@/library/slots/slotModel";
import {coffee} from "./fixtures";

it("encodes the documented coffee blob with hardware-proven grinder flags", () => {
    const recipe = coffee();
    const snapshot = snapshotRecipe(recipe);
    expect(snapshot.blob).toEqual([12, 127, 93, 0, 0, 98, 93, 0, 0, 0, 0, 90, 30, 65, 150]);
    const frames = prepareSet([snapshot, snapshot, snapshot]);
    expect(frames.map((frame) => frame.slice(10, 12))).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(frames[0].slice(12, -2)).toEqual(snapshot.blob);
    recipe.grinder = false;
    expect(snapshotRecipe(recipe).blob.slice(-2)).toEqual([0xFE, 150]);
});

it("retains the existing encoder's upward ratio rounding", () => {
    const recipe = coffee();
    recipe.dosage = 18;
    recipe.ratio = 240 / 18;
    recipe.pours[0].volume = 240;
    expect(snapshotRecipe(recipe).blob.at(-1)).toBe(134);
});

it("rejects a ratio outside the shared brew bounds", () => {
    const recipe = coffee();
    recipe.ratio = 99;
    expect(() => snapshotRecipe(recipe)).toThrow(/ratio/i);
});

it("rejects unsupported tea and bypass rather than silently changing the recipe", () => {
    const recipe = coffee();
    recipe.cupType = CUP_TYPE.TEA;
    expect(() => snapshotRecipe(recipe)).toThrow(/tea/i);
    recipe.cupType = CUP_TYPE.OMNI;
    recipe.bypassEnabled = true;
    expect(() => snapshotRecipe(recipe)).toThrow(/bypass/i);
});

it("rejects invalid encoded fields even when the grinder is off", () => {
    const recipe = coffee();
    recipe.grinder = false;
    recipe.grindRPM = NaN;
    expect(() => snapshotRecipe(recipe)).toThrow(/speed/i);
    recipe.grindRPM = 90;
    recipe.pours[0].agitation = -1;
    expect(() => snapshotRecipe(recipe)).toThrow(/agitation/i);
});

it("prevalidates the complete set including stored snapshot bytes", () => {
    const snapshot = snapshotRecipe(coffee());
    expect(() => prepareSet([snapshot, null, snapshot])).toThrow(/three/i);
    expect(() => prepareSet([snapshot, snapshot, {...snapshot, blob: [0]}]))
        .toThrow(/snapshot/i);
});

it("distinguishes changed wire content from renames and removed recipes", () => {
    const recipe = coffee();
    const snapshot = snapshotRecipe(recipe);
    recipe.name = "Renamed";
    expect(snapshotStatus(snapshot, recipe)).toBe("unchanged");
    recipe.pours[0].temperature = 92;
    expect(snapshotStatus(snapshot, recipe)).toBe("edited");
    expect(snapshotStatus(snapshot, undefined)).toBe("removed");
});

it("does not call malformed edits unchanged when byte coercion hides the edit", () => {
    const recipe = coffee();
    const saved = snapshotRecipe(recipe);
    recipe.pours[0].agitation = 0.5;
    expect(snapshotStatus(saved, recipe)).toBe("edited");
});

it("rejects non-boolean grinder state in stored recipe input", () => {
    const saved = snapshotRecipe(coffee());
    const json = JSON.parse(saved.recipeJSON);
    json.grinder = "false";
    expect(() => prepareSet([{...saved, recipeJSON: JSON.stringify(json)}, saved, saved]))
        .toThrow(/grinder/i);
});

it("rejects a snapshot without a usable source identity", () => {
    const recipe = coffee();
    recipe.uuid = " ";
    expect(() => snapshotRecipe(recipe)).toThrow(/identity/i);
});

it("markers distinguish repeated draft and last-written assignments", () => {
    const recipe = coffee();
    const snapshot = snapshotRecipe(recipe);
    const record = emptySlotRecord();
    record.drafts = [snapshot, null, snapshot];
    record.written = {at: 1, slots: [snapshot, snapshot, snapshot]};
    expect(slotMarkers(record, recipe)).toBe("Draft A/C. Last written A/B/C.");
    recipe.pours[0].temperature = 92;
    expect(slotMarkers(record, recipe)).toContain("Recipe edited.");
});
