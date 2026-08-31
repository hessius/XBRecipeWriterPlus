import * as Application from "expo-application";
import {useRouter} from "expo-router";
import React, {useState} from "react";
import {ScrollView, YStack} from "tamagui";

import DeleteAllSheet from "@/components/DeleteAllSheet";
import RestoreSheet, {type RestoreChoice} from "@/components/RestoreSheet";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useBackup} from "@/hooks/useBackup";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import {type BackupPayload} from "@/library/backup";
import type {Settings, SettingKey} from "@/library/Settings";
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
    // Not shown as a row on this screen -- the hints switch lives on the editor's
    // own caret, which is where a user is when they want it. Read here anyway,
    // because a backup carries every preference and this is one.
    const [showHints, setShowHints] = useSetting("showHints", settings);
    const [temperatureUnit, setTemperatureUnit] =
        useSetting("temperatureUnit", settings);
    const [teaSteepEncoding] = useSetting("teaSteepEncoding", settings);
    // Not shown as a row on this screen -- the machine link is managed from the
    // console and the editor's BREW button. Read here anyway, because a backup
    // carries every preference and this is one.
    const [machineDeviceId] = useSetting("machineDeviceId", settings);

    const library = useRecipeLibrary();
    const {exportBackup, pickBackup} = useBackup();
    // The sheet is mounted for the screen's whole life and only toggled open,
    // so it keeps its entrance and exit animations — the pattern DeleteAllSheet
    // below already follows. `pending` holds the picked backup, and is left in
    // place while the sheet animates closed so it has something to draw on the
    // way out; the next pick replaces it.
    const [pending, setPending] = useState<BackupPayload | null>(null);
    const [restoreOpen, setRestoreOpen] = useState(false);
    const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

    // Every key in `DEFAULTS`, and a compile error when a new one is added
    // without being thought about here. A backup that says it carries your
    // settings and then quietly drops one is worse than a backup that carries
    // none: the user has no way to tell which preference did not survive.
    function settingsSnapshot(): Record<SettingKey, unknown> {
        return {showCoffeeMarker, dotMatrixProfile, showHints, temperatureUnit, teaSteepEncoding, machineDeviceId};
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
        setRestoreOpen(true);
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
        if (typeof incoming.showHints === "boolean") {
            setShowHints(incoming.showHints);
        }
        if (incoming.temperatureUnit === "C" || incoming.temperatureUnit === "F") {
            setTemperatureUnit(incoming.temperatureUnit);
        }
    }

    function applyRestore(payload: BackupPayload, choice: RestoreChoice) {
        const outcome = library.applyRestore(payload, {replace: choice.replace});
        // A second press landing before the first repaint. The library ignored
        // it; the screen says nothing, because nothing happened.
        if (outcome.status === "busy") return;
        if (outcome.status === "failed") {
            notify({
                tone: "error",
                message: "The restore could not be completed, so your library was left unchanged."
            });
            return;
        }

        // Only after the recipes have landed: the settings are a preference, and
        // changing them for a restore that then failed would be the worst of
        // both outcomes.
        if (choice.includeSettings) applySettings(payload.settings);

        // A restore that took only the settings did happen, and reporting it as
        // "0 recipes restored" reads as a failure the app is being coy about.
        if (outcome.added === 0 && choice.includeSettings) {
            notify({tone: "success", message: "Settings restored"});
            return;
        }

        notify({
            tone: "success",
            message: outcome.added === 1
                ? "1 recipe restored"
                : `${outcome.added} recipes restored`
        });
    }

    async function onBackUpFirst() {
        setConfirmingDeleteAll(false);
        await onBackUp();
    }

    function onDeleteAll() {
        const outcome = library.deleteAll();
        setConfirmingDeleteAll(false);
        if (outcome.status === "failed") {
            notify({
                tone: "error",
                message: "Your recipes could not be deleted, so nothing was removed."
            });
            return;
        }
        notify({
            tone: "success",
            message: outcome.deleted === 1
                ? "1 recipe deleted"
                : `${outcome.deleted} recipes deleted`
        });
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Settings" onBack={() => router.back()}/>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 48}}>
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

            <RestoreSheet open={restoreOpen} payload={pending} existing={library.recipes}
                          onCancel={() => setRestoreOpen(false)}
                          onRestore={(choice) => {
                              setRestoreOpen(false);
                              if (pending !== null) applyRestore(pending, choice);
                          }}/>

            <DeleteAllSheet open={confirmingDeleteAll} count={library.recipes.length}
                            onCancel={() => setConfirmingDeleteAll(false)}
                            onBackUpFirst={onBackUpFirst}
                            onDelete={onDeleteAll}/>
            </ScrollView>
        </YStack>
    );
}

