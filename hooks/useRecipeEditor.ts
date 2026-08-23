import {useCallback, useEffect, useState} from "react";

import {notify} from "@/components/XbrwToast";
import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";
import RecipeDatabase from "@/library/RecipeDatabase";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import type {StageField} from "@/components/StageTile";
import {REVERT_SOURCES} from "@/components/RevertSheet";
import type {RevertSource, RevertSourceId} from "@/components/RevertSheet";

/** Labels shown next to each editable field. Also the key the edit callback dispatches on. */
export const RECIPE_LABELS = {
    TITLE:            "Title",
    XID:              "XID",
    DOSE:             "Dose (g)",
    RATIO:            "Ratio",
    GRIND_SIZE:       "Grind size",
    GRIND_RPM:        "Grind RPM",
    GRINDER:          "Grinder",
    CUP:              "Cup",
    VOLUME:           "Volume",
    TEMPERATURE:      "Temperature (°C)",
    FLOW_RATE:        "Flow rate (ml/s)",
    PAUSING:          "Pausing (s)",
    PATTERN:          "Pattern",
    AGITATION_BEFORE: "Agitation before",
    AGITATION_AFTER:  "Agitation after"
} as const;

type Params = {
    /** Serialised recipe passed through the route params. */
    recipeJSON?: string;
    /** Called once the recipe has been persisted. */
    onSaved: () => void;
};

/**
 * Owns the recipe being edited and every operation that mutates it.
 *
 * `Recipe` is mutable and is edited in place, so changes are published by
 * bumping `key` rather than by replacing the object. That is why several
 * operations call `setKey` instead of `setRecipe`.
 */
export function useRecipeEditor({recipeJSON, onSaved}: Params) {
    // Derived from the route param, so it is an initial value rather than an
    // effect: parsing it in an effect would render once with a null recipe.
    const [recipe, setRecipe] = useState<Recipe | null>(
        () => (recipeJSON && recipeJSON !== "") ? new Recipe(undefined, recipeJSON as string) : null
    );
    const [inputError, setInputError] = useState(false);
    const [key, setKey] = useState(0);
    const [volumeError, setVolumeError] = useState<string | null>(null);

    /**
     * What the recipe pours against what the machine expects.
     *
     * Derived on every render rather than pushed into a child by hand. The
     * previous editor repainted the total through an imperative handle and the
     * Auto button through `setNativeProps`, so any edit that arrived by a route
     * its author had not anticipated left both stale — which is #40.
     */
    const balance = {
        poured:   recipe?.getPourTotalVolume() ?? 0,
        target:   recipe?.getTotalVolume() ?? 0,
        balanced: recipe?.isPourVolumeValid() ?? true
    };

    /** A recipe the machine would reject cannot be written; it can still be kept. */
    const canWrite = balance.balanced && !inputError && recipe !== null;
    const canSave = !inputError && recipe !== null;

    function getRecipe(): Recipe | null {
        return recipe;
    }

    const fetchRecipeTitle = async (r: Recipe) => {
        try {
            const xbRecipe = new XBloomRecipe(r.xid);
            await xbRecipe.fetchRecipeDetail();

            let recipeTitle = xbRecipe.getRecipeTitle();
            if (recipeTitle.length > 0) {
                // Update the current recipe with the fetched xBloom name. The
                // user's own `name` is left untouched, so a sync can no longer
                // silently overwrite a name they typed.
                r.xbloomName = recipeTitle;
                // Also get shareID for restore feature if not already present
                let xbr = xbRecipe.getRecipe();
                if (xbr && xbr.shareId.length > 0 && r.shareId.length === 0) {
                    r.shareId = xbr.shareId;
                }
                if (xbr && xbr.offline_backup.length > 0 && r.offline_backup.length === 0) {
                    r.offline_backup = xbr.offline_backup;
                }
                // The recipe is mutated in place, so the change is published by
                // bumping the key. `setRecipe(r)` would hand React the object
                // it already holds and be bailed out of, leaving the fetched
                // name invisible on the hero until some unrelated edit.
                setKey((prev) => prev + 1);
            }
        } catch (error) {
            console.log("Failed to fetch recipe title:", error);
        }
    };

    useEffect(() => {
        // Only fetch if we have a recipe with valid XID but no cached xBloom name
        if (recipe &&
            recipe.xid &&
            recipe.xid.trim().length > 0 &&
            (!recipe.xbloomName || recipe.xbloomName.trim().length === 0)) {
            // Syncing with an external system (the xBloom API); the setState calls
            // happen around an await, not synchronously during the effect.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void fetchRecipeTitle(recipe);
        }
    }, [recipe]);

    const handleReloadTitlePress = async () => {
        const r = getRecipe();
        if (r && r.xid) {
            await fetchRecipeTitle(r);
        }
    };

    function addPour(pourNumber: number) {
        if (recipe) {
            // Limit tea recipes to maximum 3 pours
            if (recipe.isTea() && recipe.pours.length >= 3) {
                notify({tone: "info", message: "Tea recipes are limited to 3 pours."});
                return;
            }
            recipe.addPour(pourNumber);
            setVolumeError(null);
            setKey((prev) => prev + 1);
        }
    }

    function deletePour(pourNumber: number) {
        if (recipe && recipe.pours.length > 1) {
            recipe.deletePour(pourNumber);
            // The message names a total that no longer exists. Any structural
            // change to the stages invalidates it, so it is cleared rather than
            // left to contradict the banner beside it.
            setVolumeError(null);
            setKey((prev) => prev + 1);
        }
    }

    function autoAdjustPourVolumes() {
        if (recipe) {
            recipe.autoFixPourVolumes();
            setVolumeError(null);
            setKey((prev) => prev + 1);
        }
    }

    // Restoring replaces the brew parameters, not the recipe's identity: its
    // uuid, the name the user chose, and the metadata the library sorts and
    // colours by all survive a restore. Without `accentIndex` the card would
    // silently change colour, and without `createdAt`/`source` a restored
    // recipe would lose its provenance and placeholder name.
    const alwaysKeepFields = ['uuid', 'backup', 'name', 'xbloomName',
                              'accentIndex', 'createdAt', 'source'];

    function keepSettingsAndSave(
        restoredRecipe: Recipe,
        fieldsToKeep: (keyof Recipe)[] = []
    ) {
        if (!recipe) return;
        let keepFields = [...alwaysKeepFields, ...fieldsToKeep];

        for (const field of keepFields) {
            const value = (recipe as any)[field];

            if (
                value !== undefined &&
                ((((typeof value === 'string') || (typeof value === 'object'))
                        && value.length > 0) ||
                    typeof value === 'boolean' ||
                    typeof value === 'number')
            ) {
                (restoredRecipe as any)[field] = value;
            }
        }
        setRecipe(restoredRecipe);
        // A restore replaces the brew parameters wholesale, so a write-time
        // volume complaint from the recipe that was here before no longer
        // describes anything on screen.
        setVolumeError(null);
    }

    /** Perform the revert for one source. Each body is unchanged from the old dialog. */
    async function runRevert(id: RevertSourceId) {
        if (!recipe) return;

        switch (id) {
            case "card": {
                const restoredRecipe = new Recipe(recipe.backup);
                // keep shareId
                keepSettingsAndSave(restoredRecipe, ['shareId', 'offline_backup']);
                notify({tone: "success", message: "Recipe restored from the NFC backup."});
                return;
            }
            case "saved": {
                const restoredRecipe = new Recipe(recipe.offline_backup, undefined, false);
                // keep shareId
                keepSettingsAndSave(restoredRecipe, ['shareId', 'offline_backup']);
                notify({tone: "success", message: "Recipe restored from the offline backup."});
                return;
            }
            case "xid": {
                const xbRecipe = new XBloomRecipe(recipe.xid);
                await xbRecipe.fetchRecipeDetail();
                const restoredRecipe = xbRecipe.getRecipe();
                if (restoredRecipe) {
                    // keep shareId and cup type in case user has customized it
                    // (default recipeVo for the same XID may have a different cup type)
                    keepSettingsAndSave(restoredRecipe, ['shareId', 'cupType']);
                    notify({tone: "success", message: "Recipe restored from the XID."});
                } else {
                    throw new Error('Could not fetch recipe data using XID');
                }
                return;
            }
            case "share": {
                const xbRecipe = new XBloomRecipe(recipe.shareId);
                await xbRecipe.fetchRecipeDetail();
                const restoredRecipe = xbRecipe.getRecipe();
                if (restoredRecipe) {
                    // keep original XID
                    keepSettingsAndSave(restoredRecipe, ['xid']);
                    notify({tone: "success", message: "Recipe restored from the share link."});
                } else {
                    throw new Error('Could not fetch recipe data using Share Link');
                }
                return;
            }
        }
    }

    /** All four sources, in a fixed order, each marked available or not. */
    function buildRevertSources(): RevertSource[] {
        return REVERT_SOURCES.map((source) => ({
            ...source,
            available: recipe !== null && hasSource(recipe, source.id),
            action:    () => runRevert(source.id)
        }));
    }

    function saveRecipe() {
        if (!recipe) return;
        // Saves whether or not the volumes add up. Refusing to save a
        // half-finished recipe loses work to enforce a rule that only matters
        // at the moment of writing a card.
        new RecipeDatabase().updateRecipe(recipe.uuid, recipe);
        onSaved();
    }

    const editInputComplete = useCallback(async (label: string, value: string, pourNumber?: number) => {
        if (!recipe) return;
        // Recipe settings
        const fieldConfigs: Record<string, {
            requiresNumber: boolean;
            update: (r: Recipe, val: string) => void;
        }> = {
            [RECIPE_LABELS.GRINDER]:    {
                requiresNumber: true,
                update:         (r: Recipe, val: string) => {
                    r.grinder = val === "1";
                    setKey((prev) => prev + 1);
                }
            },
            [RECIPE_LABELS.GRIND_SIZE]: {
                requiresNumber: true,
                update:         (r: Recipe, val: string) => r.grindSize = Number(val)
            },
            [RECIPE_LABELS.GRIND_RPM]:  {
                requiresNumber: true,
                update:         (r: Recipe, val: string) => r.grindRPM = Number(val)
            },
            [RECIPE_LABELS.RATIO]:      {
                requiresNumber: true,
                update:         (r: Recipe, val: string) => {
                    r.ratio = Number(val)
                }
            },
            [RECIPE_LABELS.DOSE]:       {
                requiresNumber: true,
                update:         (r: Recipe, val: string) => {
                    r.dosage = Number(val)
                }
            },
            [RECIPE_LABELS.XID]:        {
                requiresNumber: false,
                update:         (r: Recipe, val: string) => r.xid = val
            },
            [RECIPE_LABELS.TITLE]:      {
                requiresNumber: false,
                update:         (r: Recipe, val: string) => {
                    r.name = val;
                }
            },
            [RECIPE_LABELS.CUP]:        {
                requiresNumber: false,
                update:         (r: Recipe, val: string) => {
                    r.cupType = Number(val);
                }
            }
        };

        // Handle pour-specific settings
        const pourFields: Record<string, (r: Recipe, val: string, pourNum: number) => void> = {
            [RECIPE_LABELS.VOLUME]:           (r: Recipe, val: string, pourNum: number) =>
                                              {
                                                  r.pours[pourNum].volume = Number(val)
                                              },
            [RECIPE_LABELS.TEMPERATURE]:      (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].temperature = Number(val),
            [RECIPE_LABELS.FLOW_RATE]:        (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].flowRate = Number(val),
            [RECIPE_LABELS.PAUSING]:          (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].pauseTime = Number(val),
            [RECIPE_LABELS.PATTERN]:          (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].pourPattern = Number(val),
            [RECIPE_LABELS.AGITATION_BEFORE]: (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].setAgitationBefore(val === "1"),
            [RECIPE_LABELS.AGITATION_AFTER]:  (r: Recipe, val: string, pourNum: number) =>
                                                  r.pours[pourNum].setAgitationAfter(val === "1")
        };

        // Handle regular fields
        const fieldConfig = fieldConfigs[label];
        if (fieldConfig) {
            // Skip validation for non-numeric fields or validate numeric ones
            if (!fieldConfig.requiresNumber || !isNaN(Number(value))) {
                fieldConfig.update(recipe, value);
                // Publish the in-place edit. This used to ride on a
                // `setEnableSave(true)` whose only surviving effect was the
                // re-render; the save-enabled flag it set was never read.
                setKey((prev) => prev + 1);
            }
        } else {
            // Handle pour-specific fields
            const pourField = pourFields[label];
            if (pourField) {
                if (pourNumber !== undefined && !isNaN(Number(value))) {
                    pourField(recipe, value, pourNumber);
                    setKey((prev) => prev + 1);
                }
            } else {
                throw new Error("Unknown Edit Recipe Input field");
            }
        }
    }, [recipe, setKey]);

    /** Edit one value of one stage. `Pour` stores agitation as flags, not numbers. */
    function editStage(index: number, field: StageField, value: number) {
        const pour = recipe?.pours[index];
        if (!pour) return;

        applyStageField(pour, field, value);
        setKey((prev) => prev + 1);
    }

    return {
        recipe,
        getRecipe,
        key,
        inputError,
        setInputError,
        balance,
        canWrite,
        canSave,
        revertSources: buildRevertSources(),
        bumpKey: () => setKey((prev) => prev + 1),
        handleReloadTitlePress,
        addPour,
        deletePour,
        autoAdjustPourVolumes,
        editStage,
        saveRecipe,
        editInputComplete,
        volumeError,
        setVolumeError
    };
}

/**
 * Write one stage field. `Pour` stores agitation as before/after flags rather
 * than a number, so those two are set through their setters.
 *
 * Kept at module scope, like the pour-field writers `editInputComplete` uses,
 * so the React Compiler's immutability check sees the mutation happen behind a
 * function boundary rather than directly on a value derived from state.
 */
function applyStageField(pour: Pour, field: StageField, value: number) {
    if (field === "agitationBefore") pour.setAgitationBefore(value === 1);
    else if (field === "agitationAfter") pour.setAgitationAfter(value === 1);
    else pour[field] = value;
}

/** Whether a recipe has the material a given revert source needs. */
export function hasSource(recipe: Recipe, id: RevertSourceId): boolean {
    switch (id) {
        case "card":
            return (recipe.backup?.length ?? 0) > 0;
        case "saved":
            return (recipe.offline_backup?.length ?? 0) > 0;
        case "xid":
            // Trimmed, because `isValidXID` and the refresh gate both read
            // whitespace as no identifier at all. Untrimmed, a recipe holding
            // a single space offered an online revert and then fetched with an
            // ID the endpoint cannot answer.
            return recipe.xid.trim().length > 0;
        case "share":
            return recipe.shareId.trim().length > 0;
    }
}

export default useRecipeEditor;
