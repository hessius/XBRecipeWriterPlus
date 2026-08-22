import {useCallback, useEffect, useRef, useState} from "react";

import {notify} from "@/components/XbrwToast";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import type {RestoreOption} from "@/components/RestoreDialog";

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
    /** Whether Save starts enabled, e.g. when arriving from a card read. */
    initiallySaveEnabled: boolean;
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
export function useRecipeEditor({recipeJSON, initiallySaveEnabled, onSaved}: Params) {
    // Derived from the route param, so it is an initial value rather than an
    // effect: parsing it in an effect would render once with a null recipe.
    const [recipe, setRecipe] = useState<Recipe | null>(
        () => (recipeJSON && recipeJSON !== "") ? new Recipe(undefined, recipeJSON as string) : null
    );
    const [inputError, setInputError] = useState(false);
    const [enableSave, setEnableSave] = useState(initiallySaveEnabled);
    const [key, setKey] = useState(0);
    const [isLoadingTitle, setIsLoadingTitle] = useState(false);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const [restoreOptions, setRestoreOptions] = useState<RestoreOption[]>([]);
    const [volumeError, setVolumeError] = useState<string | null>(null);

    const totalVolumeRef = useRef<{ forceUpdate: () => void } | null>(null);
    const autoButtonRef = useRef<any>(null);

    function getRecipe(): Recipe | null {
        return recipe;
    }

    const fetchRecipeTitle = async (r: Recipe) => {
        setIsLoadingTitle(true);

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
                setRecipe(r);
                setEnableSave(true);
            }
        } catch (error) {
            console.log("Failed to fetch recipe title:", error);
        } finally {
            setIsLoadingTitle(false);
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
            setKey((prev) => prev + 1);
            setEnableSave(true);
        }
    }

    function deletePour(pourNumber: number) {
        if (recipe && recipe.pours.length > 1) {
            recipe.deletePour(pourNumber);
            setKey((prev) => prev + 1);
            setEnableSave(true);
        }
    }

    function autoAdjustPourVolumes() {
        if (recipe) {
            recipe.autoFixPourVolumes();
            setVolumeError(null);
            setKey((prev) => prev + 1);
            setEnableSave(true);
        }
    }

    function restoreRecipe() {
        // Restoring replaces the brew parameters, not the recipe's identity:
        // its uuid, the name the user chose, and the metadata the library sorts
        // and colours by all survive a restore. Without `accentIndex` the card
        // would silently change colour, and without `createdAt`/`source` a
        // restored recipe would lose its provenance and placeholder name.
        const alwaysKeepFields = ['uuid', 'backup', 'name', 'xbloomName',
                                  'accentIndex', 'createdAt', 'source'];

        if (!recipe) return;

        const options: RestoreOption[] = [];

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
            setEnableSave(true);
        }

        // Check for NFC backup data
        if (recipe.backup && recipe.backup.length > 0) {
            options.push({
                id:     'nfc',
                label:  'Restore from NFC card backup',
                action: async () => {
                    const restoredRecipe = new Recipe(recipe.backup);
                    // keep shareId
                    keepSettingsAndSave(restoredRecipe, ['shareId', 'offline_backup']);
                    notify({tone: "success", message: "Recipe restored from the NFC backup."});
                }
            });
        }

        // Check for offline backup from the online database
        if (recipe.offline_backup && recipe.offline_backup.length > 0) {
            options.push({
                id:     'offline',
                label:  'Restore from offline backup',
                action: async () => {
                    const restoredRecipe = new Recipe(recipe.offline_backup, undefined, false);
                    // keep shareId
                    keepSettingsAndSave(restoredRecipe, ['shareId', 'offline_backup']);
                    notify({tone: "success", message: "Recipe restored from the offline backup."});
                }
            });
        }

        // Check for XID
        if (recipe.xid && recipe.xid.trim().length > 0) {
            options.push({
                id:     'xid',
                label:  'Restore by XID (online)',
                action: async () => {
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
                }
            });
        }

        // Check for shareId
        if (recipe.shareId && recipe.shareId.trim().length > 0) {
            options.push({
                id:     'shareId',
                label:  'Restore by Share Link (online)',
                action: async () => {
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
                }
            });
        }

        if (options.length === 0) {
            notify({
                tone:    "info",
                message: "This recipe has no backup, XID or share link to restore from."
            });
            return;
        }

        setRestoreOptions(options);
        setShowRestoreDialog(true);
    }

    function saveRecipe() {
        if (!recipe) return;
        let db = new RecipeDatabase();
        if (recipe.isPourVolumeValid()) {
            setVolumeError(null);
            db.updateRecipe(recipe.uuid, recipe);
            onSaved();
        } else {
            setVolumeError("Your individual pour volumes must add up to the total volume.");
        }
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
                setEnableSave(true);
            }
        } else {
            // Handle pour-specific fields
            const pourField = pourFields[label];
            if (pourField) {
                if (pourNumber !== undefined && !isNaN(Number(value))) {
                    pourField(recipe, value, pourNumber);
                    setEnableSave(true);
                }
            } else {
                throw new Error("Unknown Edit Recipe Input field");
            }
        }
        // Check if the field affects volume calculations and force update
        if (label === RECIPE_LABELS.RATIO ||
            label === RECIPE_LABELS.DOSE ||
            label === RECIPE_LABELS.VOLUME) {
            totalVolumeRef.current?.forceUpdate();

            // Update Auto button disabled state without re-rendering the whole component
            if (autoButtonRef.current) {
                const isDisabled = recipe.isPourVolumeValid();
                autoButtonRef.current.setNativeProps({
                    disabled: isDisabled,
                    style: { opacity: isDisabled ? 0.5 : 1 }
                });
            }
        }
    }, [recipe, setKey, setEnableSave, totalVolumeRef, autoButtonRef]);

    return {
        recipe,
        getRecipe,
        key,
        enableSave,
        inputError,
        setInputError,
        isLoadingTitle,
        showRestoreDialog,
        setShowRestoreDialog,
        restoreOptions,
        totalVolumeRef,
        autoButtonRef,
        bumpKey: () => setKey((prev) => prev + 1),
        handleReloadTitlePress,
        addPour,
        deletePour,
        autoAdjustPourVolumes,
        restoreRecipe,
        saveRecipe,
        editInputComplete,
        volumeError
    };
}

export default useRecipeEditor;
