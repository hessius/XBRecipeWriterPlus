import * as Application from "expo-application";
import {useRouter} from "expo-router";
import React, {useState} from "react";
import {ScrollView, YStack} from "tamagui";

import DeleteAllSheet from "@/components/DeleteAllSheet";
import RestoreSheet, {type RestoreChoice} from "@/components/RestoreSheet";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useBackup} from "@/hooks/useBackup";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import {mergeRecipes, type BackupPayload} from "@/library/backup";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {Settings} from "@/library/Settings";
import {asTemperatureUnit} from "@/library/units";

type Props = {
    /** Injected by tests. The route renders with the shared store. */
    settings?: Settings;
};

const TEMPERATURE_OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;

const VERSION = Application.nativeApplicationVersion ?? "unknown";

/**
 * The settings screen.
 *
 * A declaration of sections and rows rather than hand-written layout. The screen
 * accumulated rows from three sub-projects and each one that arrived as more JSX
 * made the next harder to place; the rows are components now, so this file says
 * what the screen offers and nothing about how a row is drawn.
 *
 * The one-line editor hints are deliberately not here. Sub-project 4 put that
 * toggle in the editor's overflow sheet, beside the deck it annotates, which is
 * the better home for it — and `app/__tests__/settings.test.tsx` holds that
 * decision in place.
 */
export default function SettingsScreen({settings}: Props) {
    const router = useRouter();
    const [showCoffeeMarker, setShowCoffeeMarker] =
        useSetting("showCoffeeMarker", settings);
    const [dotMatrixProfile, setDotMatrixProfile] =
        useSetting("dotMatrixProfile", settings);
    const [temperatureUnit, setTemperatureUnit] =
        useSetting("temperatureUnit", settings);

    const library = useRecipeLibrary();
    const {exportBackup, pickBackup} = useBackup();
    const [pending, setPending] = useState<BackupPayload | null>(null);
    const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

    function settingsSnapshot() {
        return {showCoffeeMarker, dotMatrixProfile, temperatureUnit};
    }

    async function onBackUp() {
        const outcome = await exportBackup(library.recipes, settingsSnapshot(), VERSION);
        if (!outcome.ok) notify({tone: "error", message: outcome.reason});
    }

    async function onRestore() {
        const outcome = await pickBackup();
        // Cancelling is not a failure. The user withdrew, and a message here
        // would be the app arguing with a decision they already made.
        if (outcome.cancelled) return;
        if (!outcome.result.ok) {
            notify({tone: "error", message: outcome.result.reason});
            return;
        }
        setPending(outcome.result.payload);
    }

    function applySettings(incoming: Record<string, unknown>) {
        // Only the keys this app knows, and only values of the right shape. A
        // backup is a document from anywhere, so its settings block is input
        // rather than instruction.
        if (typeof incoming.showCoffeeMarker === "boolean") {
            setShowCoffeeMarker(incoming.showCoffeeMarker);
        }
        if (typeof incoming.dotMatrixProfile === "boolean") {
            setDotMatrixProfile(incoming.dotMatrixProfile);
        }
        if (incoming.temperatureUnit === "C" || incoming.temperatureUnit === "F") {
            setTemperatureUnit(incoming.temperatureUnit);
        }
    }

    function applyRestore(payload: BackupPayload, choice: RestoreChoice) {
        const store = new RecipeDatabase();
        if (choice.replace) store.deleteAllRecipes();

        const target = choice.replace ? [] : library.recipes;
        const {toAdd} = mergeRecipes(target, payload.recipes);
        for (const recipe of toAdd) store.insertRecipe(recipe);

        if (choice.includeSettings) applySettings(payload.settings);

        library.refresh();
        notify({
            tone: "success",
            message: toAdd.length === 1
                ? "1 recipe restored"
                : `${toAdd.length} recipes restored`
        });
    }

    async function onBackUpFirst() {
        setConfirmingDeleteAll(false);
        await onBackUp();
    }

    function onDeleteAll() {
        const deleted = library.recipes.length;
        new RecipeDatabase().deleteAllRecipes();
        library.refresh();
        setConfirmingDeleteAll(false);
        notify({
            tone: "success",
            message: deleted === 1 ? "1 recipe deleted" : `${deleted} recipes deleted`
        });
    }

    return (
        <ScrollView backgroundColor={palette.base}
                    contentContainerStyle={{padding: 16, paddingBottom: 48}}>
            <YStack>
                {/* At the top rather than the conventional bottom. The row
                    carries the app's name and version, so it reads as the
                    screen's identity rather than its footnote — the shape iOS
                    uses for the Apple ID row — and it is the row an App Store
                    reviewer comes here looking for. */}
                <SettingsSection>
                    <SettingsActionRow label="About XBRW++"
                                       detail={`Version ${VERSION}`}
                                       onPress={() => router.push("/about")}/>
                </SettingsSection>

                <SettingsSection title="Recipe list">
                    <SettingsToggleRow
                        label="Show the COFFEE marker"
                        description="The TEA marker is always shown. COFFEE is redundant in a mostly-coffee library."
                        value={showCoffeeMarker}
                        onChange={setShowCoffeeMarker}/>
                    <SettingsToggleRow
                        label="Dot matrix pour profile"
                        description="Fill the graph behind each recipe with a screen of dots instead of a flat tint."
                        value={dotMatrixProfile}
                        onChange={setDotMatrixProfile}/>
                </SettingsSection>

                <SettingsSection title="Units">
                    <SettingsChoiceRow
                        label="Temperature"
                        description="What the editor shows and takes. The card always stores Celsius, so switching back and forth changes nothing that is written."
                        value={temperatureUnit}
                        options={TEMPERATURE_OPTIONS}
                        onChange={(value) => setTemperatureUnit(asTemperatureUnit(value))}/>
                </SettingsSection>

                <SettingsSection title="Library">
                    <SettingsActionRow label="Back up my recipes"
                                       detail="Writes a file and hands it to the share sheet."
                                       onPress={onBackUp}/>
                    <SettingsActionRow label="Restore from a backup"
                                       detail="Adds anything your library does not already have."
                                       onPress={onRestore}/>
                    <SettingsActionRow label="Delete all recipes" tone="danger"
                                       detail="Everything on this phone. There is no undo."
                                       onPress={() => setConfirmingDeleteAll(true)}/>
                </SettingsSection>
            </YStack>

            {pending !== null && (
                <RestoreSheet open payload={pending} existing={library.recipes}
                              onCancel={() => setPending(null)}
                              onRestore={(choice) => {
                                  applyRestore(pending, choice);
                                  setPending(null);
                              }}/>
            )}

            <DeleteAllSheet open={confirmingDeleteAll} count={library.recipes.length}
                            onCancel={() => setConfirmingDeleteAll(false)}
                            onBackUpFirst={onBackUpFirst}
                            onDelete={onDeleteAll}/>
        </ScrollView>
    );
}

