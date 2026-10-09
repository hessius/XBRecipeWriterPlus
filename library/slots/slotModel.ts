import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {brewProblems, DOSE, GRIND_RPM} from "@/library/cardLimits";
import {buildType2, encodeCoffeeBlob} from "@/library/machine/protocol";

export const SLOT_NAMES = ["A", "B", "C"] as const;
export type SlotIndex = 0 | 1 | 2;
export type Triple<T> = [T, T, T];
export type SlotSnapshot = {
    sourceUuid: string;
    name: string;
    recipeJSON: string;
    blob: number[];
};
export type SlotJournal = {
    id: string;
    serial: string | null;
    slots: Triple<SlotSnapshot>;
    frames: Triple<number[]>;
    acknowledged: number;
    inFlight: SlotIndex | null;
    error: string | null;
};
export type SlotRecord = {
    version: 1;
    drafts: Triple<SlotSnapshot | null>;
    written: {at: number; slots: Triple<SlotSnapshot>} | null;
    journal: SlotJournal | null;
};

export function emptySlotRecord(): SlotRecord {
    return {version: 1, drafts: [null, null, null], written: null, journal: null};
}

export function snapshotRecipe(recipe: Recipe): SlotSnapshot {
    if (typeof recipe.uuid !== "string" || recipe.uuid.trim() === "") {
        throw new Error("The recipe's source identity is invalid.");
    }
    if (typeof recipe.grinder !== "boolean") {
        throw new Error("The recipe's grinder state is invalid.");
    }
    if (recipe.isTea()) throw new Error("Tea recipes are not supported in Easy Mode.");
    if (![CUP_TYPE.XPOD, CUP_TYPE.OMNI, CUP_TYPE.OTHER].includes(recipe.cupType)
        || typeof recipe.bypassEnabled !== "boolean") {
        throw new Error("The recipe's brewer settings are invalid.");
    }
    if (recipe.bypassEnabled) {
        throw new Error("Recipes with bypass are not supported in Easy Mode.");
    }
    const problems = brewProblems(recipe);
    if (problems.length > 0) throw new Error(problems.join(" "));
    if (!Number.isInteger(recipe.grindRPM)
        || recipe.grindRPM < GRIND_RPM.min || recipe.grindRPM > GRIND_RPM.max) {
        throw new Error("Choose a valid grind speed before assigning this recipe.");
    }
    for (const pour of recipe.pours) {
        if (!Number.isInteger(pour.agitation) || pour.agitation < 0 || pour.agitation > 3) {
            throw new Error("Set each stage's agitation before assigning this recipe.");
        }
        if (!Number.isInteger(pour.pourPattern)) {
            throw new Error("Choose a valid pour pattern before assigning this recipe.");
        }
    }
    return {
        sourceUuid: recipe.uuid,
        name: recipe.displayName(),
        recipeJSON: JSON.stringify(recipe),
        blob: Array.from(encodeCoffeeBlob(recipe))
    };
}

export function sameBytes(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function objectValue(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSlotRecipe(recipeJSON: string): Recipe {
    const json: unknown = JSON.parse(recipeJSON);
    if (!objectValue(json) || typeof json.uuid !== "string" || json.uuid.trim() === ""
        || !Array.isArray(json.pours)) {
        throw new Error("The recipe identity or stages are missing.");
    }
    if (typeof json.dosage !== "number" || !Number.isFinite(json.dosage)
        || json.dosage < DOSE.min || json.dosage > DOSE.max) {
        throw new Error(`The Easy Mode dose must be ${DOSE.min}-${DOSE.max} g.`);
    }
    if (typeof json.grinder !== "boolean" || typeof json.grindRPM !== "number") {
        throw new Error("The Easy Mode snapshot's grinder settings are invalid.");
    }
    if (typeof json.cupType !== "number" || typeof json.bypassEnabled !== "boolean") {
        throw new Error("The Easy Mode snapshot's brewer settings are invalid.");
    }
    const recipe = new Recipe(undefined, recipeJSON);
    snapshotRecipe(recipe);
    return recipe;
}

export function readSnapshot(value: unknown): SlotSnapshot {
    if (!objectValue(value) || typeof value.sourceUuid !== "string"
        || value.sourceUuid.trim() === "" || typeof value.name !== "string"
        || typeof value.recipeJSON !== "string" || !Array.isArray(value.blob)
        || !value.blob.every((byte: unknown) =>
            typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
        throw new Error("The Easy Mode snapshot is invalid.");
    }
    const json: unknown = JSON.parse(value.recipeJSON);
    if (!objectValue(json) || json.uuid !== value.sourceUuid) {
        throw new Error("The Easy Mode snapshot identity is invalid.");
    }
    const checked = snapshotRecipe(readSlotRecipe(value.recipeJSON));
    if (!sameBytes(checked.blob, value.blob)) {
        throw new Error("The Easy Mode snapshot bytes do not match its recipe.");
    }
    return {
        sourceUuid: value.sourceUuid, name: value.name,
        recipeJSON: value.recipeJSON, blob: checked.blob
    };
}

export function prepareSet(drafts: Triple<SlotSnapshot | null>): Triple<number[]> {
    if (drafts.some((slot) => slot === null)) {
        throw new Error("Choose all three recipes before writing.");
    }
    const slots = drafts.map(readSnapshot);
    const frame = (index: SlotIndex) => Array.from(buildType2(
        11510, Uint8Array.from([index, 0x02, ...slots[index].blob])
    ));
    return [frame(0), frame(1), frame(2)];
}

export function snapshotStatus(snapshot: SlotSnapshot, recipe: Recipe | undefined):
    "unchanged" | "edited" | "removed" {
    if (recipe === undefined) return "removed";
    try {
        return sameBytes(snapshot.blob, snapshotRecipe(recipe).blob) ? "unchanged" : "edited";
    } catch {
        // Invalid edits must not be hidden by Uint8Array's byte coercion.
        return "edited";
    }
}

export function slotMarkers(record: SlotRecord, recipe: Recipe): string | undefined {
    const letters = (slots: readonly (SlotSnapshot | null)[]) => slots
        .flatMap((slot, index) => slot?.sourceUuid === recipe.uuid ? [SLOT_NAMES[index]] : []);
    const draft = letters(record.drafts);
    const written = letters(record.written?.slots ?? []);
    if (draft.length === 0 && written.length === 0) return undefined;
    const snapshots = [...record.drafts, ...(record.written?.slots ?? [])]
        .filter((slot) => slot?.sourceUuid === recipe.uuid);
    return [
        draft.length > 0 ? `Draft ${draft.join("/")}.` : "",
        written.length > 0 ? `Last written ${written.join("/")}.` : "",
        snapshots.some((slot) => slot !== null && snapshotStatus(slot, recipe) === "edited")
            ? "Recipe edited." : "",
        record.journal !== null ? "Write incomplete." : ""
    ].filter(Boolean).join(" ");
}
