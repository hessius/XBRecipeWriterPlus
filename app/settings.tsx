import * as Application from "expo-application";
import {useRouter} from "expo-router";
import React, {useState} from "react";
import {ScrollView, YStack} from "tamagui";

import DeleteAllSheet from "@/components/DeleteAllSheet";
import CardReadDiagnostic from "@/components/CardReadDiagnostic";
import MachineSection from "@/components/MachineSection";
import RestoreSheet, {type RestoreChoice} from "@/components/RestoreSheet";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useBackup} from "@/hooks/useBackup";
import {sharedBrewDatabase} from "@/hooks/useBrewHistory";
import {useCloudSession} from "@/hooks/useCloudSession";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import {type BackupPayload} from "@/library/backup";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import type {BackupExcluded, Settings, SettingKey, ShelfMarkVariant}
    from "@/library/Settings";
import {asShelfMarkVariant, SHELF_MARK_VARIANTS} from "@/library/Settings";
import {isSortAxis, isSortDirection} from "@/library/librarySort";
import {isLibraryView} from "@/library/libraryView";
import {asTemperatureUnit} from "@/library/units";

type Props = {
    /** Injected by tests. The route renders with the shared store. */
    settings?: Settings;
};

const TEMPERATURE_OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;

/**
 * The shelf art candidates, in the order LABS offers them.
 *
 * Short labels because four segments share one row: the row is stacked by
 * `SettingsChoiceRow` either way, but a tester reading them in a list wants the
 * names the design uses, not sentences.
 */
const SHELF_MARK_OPTIONS = [
    {value: "hybrid", label: "AUTO"},
    {value: "mosaic", label: "MOSAIC"},
    {value: "profiles", label: "POURS"},
    {value: "glyph", label: "GLYPH"}
] as const;

const VERSION = Application.nativeApplicationVersion ?? "unknown";

/**
 * The brew history, for a backup that is about to be written.
 *
 * Resolved here rather than during render, and never held in state: opening
 * the brew database is a native call, and a screen that made it on every
 * render would pay for history on a screen that is mostly toggles.
 *
 * A history that will not read is not worth failing the export over -- the
 * recipes are the thing a backup exists to protect -- so the file is written
 * without it rather than not written at all.
 */
function brewHistory(): BrewRecord[] {
    try {
        return sharedBrewDatabase().all();
    } catch {
        return [];
    }
}

/**
 * What a restore did, in one sentence.
 *
 * Both halves are named when both happened, because they land in different
 * places: a user who sees only "12 recipes restored" has no way to tell whether
 * their history came back with them.
 */
function restoredMessage(recipes: number, brews: number): string {
    const parts: string[] = [];
    if (recipes > 0) parts.push(recipes === 1 ? "1 recipe" : `${recipes} recipes`);
    if (brews > 0) parts.push(brews === 1 ? "1 brew" : `${brews} brews`);
    if (parts.length === 0) return "0 recipes restored";
    return `${parts.join(" and ")} restored`;
}

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
    const [labsUnlocked, setLabsUnlocked] = useSetting("labsUnlocked", settings);
    const [cloudAccountEnabled, setCloudAccountEnabled] =
        useSetting("cloudAccountEnabled", settings);
    // The gate is passed in rather than wrapped around the call, because a hook
    // cannot be called conditionally. See the hook: while this is false it does
    // not read the keychain, so a user who never opens LABS is never asked
    // about one.
    const cloud = useCloudSession(cloudAccountEnabled);

    async function signOutOfCloud() {
        try {
            await cloud.forget();
        } catch {
            // `signOut` is undefended on purpose: a locked keychain leaves the
            // token in place. Saying nothing would leave someone believing they
            // had signed out of an account they had not, which is the one
            // failure here with a privacy cost. The row stays as it was,
            // because it truthfully still describes a connected account.
            notify({
                tone:    "error",
                message: "Could not sign out. The account is still connected."
            });
        }
    }
    const [showCoffeeMarker, setShowCoffeeMarker] =
        useSetting("showCoffeeMarker", settings);
    const [dotMatrixProfile, setDotMatrixProfile] =
        useSetting("dotMatrixProfile", settings);
    const [showRecipeAvatars, setShowRecipeAvatars] =
        useSetting("showRecipeAvatars", settings);
    // Not shown as a row on this screen -- the hints switch lives on the editor's
    // own caret, which is where a user is when they want it. Read here anyway,
    // because a backup carries every preference and this is one.
    const [showHints, setShowHints] = useSetting("showHints", settings);
    const [temperatureUnit, setTemperatureUnit] =
        useSetting("temperatureUnit", settings);
    const [bypassTempEncoding, setBypassTempEncoding] = useSetting("bypassTempEncoding", settings);
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone", settings);
    const [machineConsoleAcknowledged, setMachineConsoleAcknowledged] =
        useSetting("machineConsoleAcknowledged", settings);
    const [machineConsoleConfirmations, setMachineConsoleConfirmations] =
        useSetting("machineConsoleConfirmations", settings);
    // Shown as a row inside MachineSection, not here. Read anyway, because a
    // backup carries every preference and this is one.
    const [machineAutoStart, setMachineAutoStart] = useSetting("machineAutoStart", settings);
    const [animateBrewChart, setAnimateBrewChart] = useSetting("animateBrewChart", settings);
    const [brewTraceRetention, setBrewTraceRetention] =
        useSetting("brewTraceRetention", settings);
    // Owned by the library rail, not shown as rows here. Read anyway, because a
    // backup carries every preference and these are four.
    const [librarySort, setLibrarySort] = useSetting("librarySort", settings);
    const [librarySortDirection, setLibrarySortDirection] =
        useSetting("librarySortDirection", settings);
    const [libraryFavouritesFirst, setLibraryFavouritesFirst] =
        useSetting("libraryFavouritesFirst", settings);
    const [libraryView, setLibraryView] = useSetting("libraryView", settings);
    const [shelfMarkVariant, setShelfMarkVariant] =
        useSetting("shelfMarkVariant", settings);
    const [invertAutoShelves, setInvertAutoShelves] =
        useSetting("invertAutoShelves", settings);
    // Read here only so the backup can carry it. The list itself belongs to the
    // grid's footer, which is where a shelf is put away and brought back.
    const [hiddenShelves, setHiddenShelves] = useSetting("hiddenShelves", settings);

    // Deliberately given no query: this screen's questions are all about the
    // whole library, never about a view of it. That is what lets the restore
    // preview and the delete count read `library.recipes` directly instead of
    // paying for a table read on every render. Hand this a rail query and both
    // would quietly narrow with it.
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
    // `NOT_IN_BACKUP` is subtracted from the key type rather than just left out
    // of the object, so a key excluded on purpose still cannot be confused with
    // a key someone forgot.
    function settingsSnapshot(): Record<Exclude<SettingKey, BackupExcluded>, unknown> {
        return {
            showCoffeeMarker, dotMatrixProfile, showRecipeAvatars, showHints,
            temperatureUnit,
            bypassTempEncoding,
            firstBrewDone, machineConsoleAcknowledged, machineConsoleConfirmations,
            machineAutoStart, animateBrewChart, brewTraceRetention,
            librarySort, librarySortDirection, libraryFavouritesFirst,
            libraryView, shelfMarkVariant, invertAutoShelves, hiddenShelves
        };
    }

    async function onBackUp() {
        // The whole table, not `library.recipes`: the list is the answer to the
        // rail's query, and a backup must hold every recipe regardless of what
        // the user last searched or filtered by. `allRecipes()` asks a different
        // question from the list on purpose.
        const outcome = await exportBackup(
            library.allRecipes(), settingsSnapshot(), VERSION, brewHistory()
        );
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
        if (typeof incoming.showRecipeAvatars === "boolean") {
            setShowRecipeAvatars(incoming.showRecipeAvatars);
        }
        if (typeof incoming.showHints === "boolean") {
            setShowHints(incoming.showHints);
        }
        if (incoming.temperatureUnit === "C" || incoming.temperatureUnit === "F") {
            setTemperatureUnit(incoming.temperatureUnit);
        }
        if (typeof incoming.firstBrewDone === "boolean") {
            setFirstBrewDone(incoming.firstBrewDone);
        }
        if (typeof incoming.machineConsoleAcknowledged === "boolean") {
            setMachineConsoleAcknowledged(incoming.machineConsoleAcknowledged);
        }
        if (typeof incoming.machineConsoleConfirmations === "boolean") {
            setMachineConsoleConfirmations(incoming.machineConsoleConfirmations);
        }
        if (typeof incoming.machineAutoStart === "boolean") {
            setMachineAutoStart(incoming.machineAutoStart);
        }
        if (incoming.bypassTempEncoding === "scaled" || incoming.bypassTempEncoding === "plain") {
            setBypassTempEncoding(incoming.bypassTempEncoding);
        }
        if (typeof incoming.animateBrewChart === "boolean") {
            setAnimateBrewChart(incoming.animateBrewChart);
        }
        if (typeof incoming.brewTraceRetention === "number") {
            setBrewTraceRetention(incoming.brewTraceRetention);
        }
        // The same `isSortAxis` the ordinary read path narrows through, so the
        // two places that decide what a valid axis is cannot come to disagree.
        // Still a drop and not a fallback: a hostile backup naming an unknown
        // axis leaves the current sort untouched rather than silently resetting
        // it to name, which is what `asSortAxis` would do on the read path.
        if (isSortAxis(incoming.librarySort)) {
            setLibrarySort(incoming.librarySort);
        }
        if (isSortDirection(incoming.librarySortDirection)) {
            setLibrarySortDirection(incoming.librarySortDirection);
        }
        if (typeof incoming.libraryFavouritesFirst === "boolean") {
            setLibraryFavouritesFirst(incoming.libraryFavouritesFirst);
        }
        if (isLibraryView(incoming.libraryView)) {
            setLibraryView(incoming.libraryView);
        }
        // Guarded like the rest, and not with `asShelfMarkVariant`: that
        // coerces, so a backup carrying nothing for this key would overwrite a
        // tester's chosen variant with the default.
        if (SHELF_MARK_VARIANTS.includes(incoming.shelfMarkVariant as ShelfMarkVariant)) {
            setShelfMarkVariant(incoming.shelfMarkVariant as ShelfMarkVariant);
        }
        if (typeof incoming.invertAutoShelves === "boolean") {
            setInvertAutoShelves(incoming.invertAutoShelves);
        }
        // Taken as written rather than checked against today's shelf ids: the
        // stock shelves change between releases, and a backup naming one this
        // build has not got should keep it hidden rather than have it reappear
        // on a downgrade. `parseHidden` drops anything unrecognised at the one
        // place it matters, which is the grid.
        if (typeof incoming.hiddenShelves === "string") {
            setHiddenShelves(incoming.hiddenShelves);
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

        // After the recipes, and never overwriting: a brew already here may
        // carry a rating the user gave it since the backup was made. A history
        // that will not restore is not worth failing a restore of recipes
        // over, so the count is taken and the screen goes on.
        let brews = 0;
        try {
            brews = sharedBrewDatabase().restore(payload.brews);
        } catch {
            brews = 0;
        }

        // A restore that took only the settings did happen, and reporting it as
        // "0 recipes restored" reads as a failure the app is being coy about.
        if (outcome.added === 0 && brews === 0 && choice.includeSettings) {
            notify({tone: "success", message: "Settings restored"});
            return;
        }

        notify({tone: "success", message: restoredMessage(outcome.added, brews)});

        // Said out loud, and after the good news rather than instead of it. A
        // history that came back short is not a failed restore, but a user who
        // is told only what landed has no way to know something did not.
        if (payload.skippedBrews > 0) {
            notify({
                tone: "error",
                message: payload.skippedBrews === 1
                    ? "One brew in that backup could not be read."
                    : `${payload.skippedBrews} brews in that backup could not be read.`
            });
        }
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
        <>
        {/* A Fragment, with the sheets as siblings of the screen rather than
            children of it. XbrwSheet is deliberately not `modal`, so it renders
            in place rather than through a Portal — and a non-modal sheet left
            inside this `flex={1}` YStack becomes an ordinary flex child next to
            a ScrollView that takes the space, so it resolves to zero height and
            draws nothing. That is the failure XbrwSheet's own comment describes
            as looking "exactly like a control that did nothing", and it is what
            made Delete all appear to do nothing at all. `app/index.tsx` and
            `app/editRecipe.tsx` both already use this shape. */}
        <YStack testID="settings-screen" flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Settings" onBack={() => router.back()}/>
            <ScrollView testID="settings-scroll"
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

                {/* Its own section rather than a line in Library. Everything
                    else under Library is about the recipes you hold; a brew
                    history is a record of what the machine did, and burying it
                    among backup and delete made the app's own diary read as
                    file management. */}
                <SettingsSection>
                    <SettingsActionRow label="Brew history"
                                       detail="Every brew you have recorded."
                                       onPress={() => router.push("/brewHistory")}/>
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
                    <SettingsToggleRow
                        label="Invert auto shelves"
                        description="Fill an auto shelf's tile with its colour instead of its icon square."
                        value={invertAutoShelves}
                        onChange={setInvertAutoShelves}/>
                    <SettingsToggleRow
                        label="Show recipe pictures"
                        description="Draw the pod photo or the sharer's picture where a recipe arrived with one."
                        value={showRecipeAvatars}
                        onChange={setShowRecipeAvatars}/>
                </SettingsSection>

                <SettingsSection title="Units">
                    <SettingsChoiceRow
                        label="Temperature"
                        description="What the editor shows and takes. The card always stores Celsius, so switching back and forth changes nothing that is written."
                        value={temperatureUnit}
                        options={TEMPERATURE_OPTIONS}
                        onChange={(value) => setTemperatureUnit(asTemperatureUnit(value))}/>
                </SettingsSection>

                <MachineSection settings={settings}/>

                {/* Its own section above Library, not a line inside it: Library
                    is the recipes you hold, and this is where some of them can
                    come from.

                    Unlike the import sheet's door, this section knows whether
                    anyone is signed in, because this is where someone comes
                    looking to disconnect. The sheet must never carry that: it
                    is a place to bring something in, not a place to sever an
                    account. */}
                {cloudAccountEnabled && <SettingsSection title="xBloom account">
                    {cloud.session === null ? (
                        <SettingsActionRow label="Sign in"
                                           detail="Bring across the recipes you made in the xBloom app."
                                           onPress={() => router.push("/importCloud")}/>
                    ) : (
                        <SettingsActionRow label="Import recipes"
                                           detail={cloud.session.email}
                                           onPress={() => router.push("/importCloud")}/>
                    )}
                    {cloud.session !== null && (
                        // `danger`, like "Delete all recipes": signing out
                        // discards the only copy of a token that cannot be
                        // recovered without the password again.
                        <SettingsActionRow label="Sign out" tone="danger"
                                           onPress={() => {
                                               void signOutOfCloud();
                                           }}/>
                    )}
                </SettingsSection>}

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

                {/* Gated behind the machine console's acknowledgement, so it is
                    invisible until a user opens the developer area — see the
                    component. */}
                <CardReadDiagnostic settings={settings}/>

                {/* Last, under everything a user came here for, and absent
                    until seven taps on the version line open it.

                    The rows here are unfinished work that is in the build so it
                    cannot rot on a branch, not features. The caption on each
                    one says so plainly rather than hedging: somebody who turns
                    one on and then hits a wall should have been told, in the
                    same breath as being offered it, that a wall was there.

                    Closing it again is a row, not a second hidden gesture. The
                    way in can afford to be undiscoverable because nobody
                    arrives at it by accident; a way out that nobody can find is
                    just a trap. Note it hides the section and changes nothing
                    inside it -- what you switched on stays on, which is the
                    honest reading of two separate switches. */}
                {labsUnlocked && <SettingsSection title="Labs">
                    <SettingsToggleRow
                        label="xBloom account import"
                        description="Unfinished and unsupported. Brings your xBloom recipes across."
                        value={cloudAccountEnabled} onChange={setCloudAccountEnabled}/>
                    <SettingsChoiceRow
                        label="Shelf art"
                        description="Which mark a shelf tile draws. Unsettled: tell us which one reads best."
                        value={shelfMarkVariant}
                        options={SHELF_MARK_OPTIONS}
                        onChange={(value) => setShelfMarkVariant(asShelfMarkVariant(value))}/>
                    <SettingsActionRow label="Hide Labs"
                                       detail="Anything you switched on here stays on."
                                       onPress={() => setLabsUnlocked(false)}/>
                </SettingsSection>}
            </YStack>
            </ScrollView>
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
        </>
    );
}
