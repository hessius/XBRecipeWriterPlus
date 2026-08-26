import React, {useEffect, useRef, useState} from "react";
import {Platform} from "react-native";
// gesture-handler's FlatList, not React Native's: it keeps the list scroll
// gesture and each row's swipe gesture from fighting each other on Android.
import {FlatList} from "react-native-gesture-handler";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useFocusEffect, useNavigation, useRouter} from "expo-router";
import {useShareIntentContext} from "expo-share-intent";
import {XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import CtaTile from "@/components/CtaTile";
import EmptyLibrary from "@/components/EmptyLibrary";
import HomeHeader from "@/components/HomeHeader";
import ImportSheet from "@/components/ImportSheet";
import ImportTile from "@/components/ImportTile";
import NfcOverlay from "@/components/NfcOverlay";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useCollapsibleHeader} from "@/hooks/useCollapsibleHeader";
import {useRecipeImport} from "@/hooks/useRecipeImport";
import {useRecipeLibrary, type RecipeStore} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import Recipe from "@/library/Recipe";
import {resolveOnOpen} from "@/library/duplicates";
import {parseImportInput} from "@/library/importInput";
import type {Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders against the real database. */
    db?: RecipeStore;
    /** Injected by tests. */
    settings?: Settings;
};

/**
 * The recipe library.
 *
 * Layout only. Loading and mutating recipes belong to `useRecipeLibrary`, the
 * scroll collapse to `useCollapsibleHeader`, and every message to `notify`.
 */
export default function HomeScreen({db, settings}: Props) {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();

    const library = useRecipeLibrary(db);
    const {collapsed, onScroll} = useCollapsibleHeader();
    const [showCoffeeMarker] = useSetting("showCoffeeMarker", settings);
    const [dottedProfile] = useSetting("dotMatrixProfile", settings);

    const [editing, setEditing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [readProgress, setReadProgress] = useState(0);
    const [bounceFirstRow, setBounceFirstRow] = useState(true);

    const {hasShareIntent, shareIntent, resetShareIntent} = useShareIntentContext();
    // Held for the screen's lifetime, not rebuilt per render. Starting a scan
    // shows the overlay, which re-renders — so a per-render transport meant the
    // Cancel the user could actually press closed a different `NFC` than the one
    // `readCard` was awaiting, hiding the ceremony while the request lived on.
    const [nfc] = useState(() => new NFC());

    const isEmpty = library.recipes.length === 0;

    // `importId` used to do double duty -- "is the sheet open" and "what to
    // import" -- which is why `""` meant open-with-nothing and `null` meant
    // closed. Two questions, two answers. Whether the field is drawn is no
    // longer a third: that rule moved into `useRecipeImport` (`showField`), so
    // the screen only owns "is the sheet open".
    const [importOpen, setImportOpen] = useState(false);

    // The web URL of the share intent we have already acted on, so a re-delivery
    // of the *same* payload is ignored. expo-share-intent can hand the same
    // intent back more than once -- `useShareIntent` re-runs its refresh on a new
    // `options` identity (a literal passed by `_layout`) and recreates
    // `resetShareIntent` every render, and `resetOnBackground` re-fires across a
    // foreground transition -- and without this each delivery pushed another
    // editor, stacking two screens for one shared link. Cleared when the intent
    // goes away, so the same link can be shared again later on purpose.
    const handledShareUrl = useRef<string | null>(null);

    const importer = useRecipeImport({
        stored:       library.recipes,
        onOpenRecipe: (recipe, isExisting) => {
            setImportOpen(false);
            if (isExisting) {
                // The same words a card read already uses when it turns out the
                // library has this one. `resolveOnOpen` never makes a copy, so
                // opening the existing recipe is the whole reveal.
                notify({tone: "info", message: "Already in your library"});
            }
            openRecipe(recipe);
        }
    });

    // The header owns the whole strip, so the navigator's own bar would be a
    // second title above ours.
    useEffect(() => {
        navigation.setOptions({headerShown: false});
    }, [navigation]);

    useFocusEffect(
        React.useCallback(() => {
            library.refresh();
            // Refreshing on focus is how a recipe saved in the editor appears
            // here. `library` is rebuilt every render, so depending on it would
            // re-run this on every render instead of on every focus.
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    useEffect(() => {
        if (!hasShareIntent || shareIntent.type !== "weburl" || !shareIntent.webUrl) {
            // No live intent: forget what we handled, so re-sharing the same
            // link later is a fresh act that imports again rather than being
            // ignored as a repeat.
            handledShareUrl.current = null;
            return;
        }
        if (handledShareUrl.current === shareIntent.webUrl) {
            // Already acted on this exact payload; a re-delivery is a no-op. The
            // hook's generation counter does not save us here -- these deliveries
            // are sequential, so the first resolve completes and navigates before
            // the second even starts. Idempotency has to live at the source.
            return;
        }
        handledShareUrl.current = shareIntent.webUrl;
        // The screen no longer knows what an xBloom link looks like. One module
        // does, and it is the same one the field uses -- two that had to agree
        // eventually would not.
        const source = parseImportInput(shareIntent.webUrl);
        if (source) {
            // Reacting to an inbound share intent — an external system pushing
            // into React, which is what effects are for. The field is hidden by
            // the hook's `"shared"` path, not here; and if the lookup fails the
            // hook restores the field without focus, so the keyboard does not
            // ambush someone whose attention is still in the app they shared
            // from.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setImportOpen(true);
            importer.resolveNow(source, "shared");
        }
        resetShareIntent();
        // `importer` is rebuilt every render; depending on it would re-run this
        // on every render instead of on every intent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasShareIntent, shareIntent, resetShareIntent]);

    async function progressCallback(progress: number): Promise<string | undefined> {
        if (Platform.OS === "ios") {
            // The placement teaching rather than a percentage: a read reports
            // only 30, 50 and 80, so a number here would be precise-looking
            // and wrong, and the sheet already has its own spinner.
            setNfcAlertIOS(progress >= 100
                ? "Recipe read from card"
                : "Hold the card to the top of the phone.");
        }
        setReadProgress(progress);
        return undefined;
    }

    async function readCard() {
        setScanning(true);
        setReadProgress(0);
        try {
            const recipe = new Recipe();
            const success = await recipe.readCard(nfc, progressCallback);
            setScanning(false);
            if (!success) {
                return;
            }

            // Stamped before serialising: the editor rebuilds the recipe from
            // this JSON, so anything set afterwards would be lost.
            recipe.source = "read";
            const {recipe: toOpen, isExisting} = resolveOnOpen(library.recipes, recipe);

            // A successful read needs no announcement: the editor opens on top
            // of this screen with the recipe in it, which says it better than a
            // toast could. The one thing the editor cannot say for itself is
            // why Save arrives disabled, so that message stays.
            if (isExisting) {
                notify({tone: "info", message: "Already in your library"});
            }

            router.push({
                pathname: "/editRecipe",
                // No `saveEnabled`: the editor lets any recipe be saved now,
                // including one that will not write, so there is nothing left
                // for a caller to disable.
                params:   {recipeJSON: JSON.stringify(toOpen)}
            });
        } catch {
            setScanning(false);
            // A cancelled Android scan throws. That is the user getting what
            // they asked for, not a failure to report.
            if (!nfc.getIsClosed()) {
                notify({tone: "error", message: "Could not read the card. Please try again."});
            }
        }
    }

    async function cancelScan() {
        await nfc.close();
        setScanning(false);
    }

    function openRecipe(recipe: Recipe) {
        router.push({
            pathname: "/editRecipe",
            params:   {recipeJSON: JSON.stringify(recipe)}
        });
    }

    // The import sheet covers the screen while it is open, and the NFC ceremony
    // while a scan is running. Both hide the subtree below from the reader.
    const screenCovered = scanning || importOpen;

    return (
        <>
            {/* The NFC ceremony is a modal moment, and an absolutely positioned
                overlay only covers the screen visually. While it -- or the
                import sheet, a non-modal Tamagui sheet that renders as a sibling
                of this screen rather than through a native Modal and so isolates
                nothing on Android -- is up, this subtree hides its own
                descendants from the screen reader, so TalkBack cannot reach and
                fire the controls behind it — the Android half of what
                `accessibilityViewIsModal` does on iOS. The sheet is rendered
                outside this guarded subtree, so it never hides itself. */}
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={screenCovered}
                    importantForAccessibility={screenCovered ? "no-hide-descendants" : "auto"}>
                <HomeHeader
                    count={library.recipes.length}
                    collapsed={collapsed}
                    editing={editing}
                    showEdit={!isEmpty}
                    canImport
                    onToggleEdit={() => setEditing((current) => !current)}
                    onScan={readCard}
                    onImport={() => setImportOpen(true)}
                    onSettings={() => router.push("/settings")}/>

                <Collapsible open={!collapsed}>
                    <XStack gap="$3" paddingHorizontal="$3" paddingBottom="$3">
                        <CtaTile icon="scan" label="READ CARD"
                                 accessibilityLabel="Read a card" onPress={readCard}/>
                        <ImportTile
                            onOpen={() => setImportOpen(true)}
                            onPasted={(text) => {
                                const source = parseImportInput(text);
                                setImportOpen(true);
                                // The tile's paste shortcut: atomic, but the hook
                                // degrades it to the found panel with the field
                                // shown when the recipe is already in the library,
                                // so a sticky clipboard cannot trap the user on
                                // the recipe they just imported. A value that does
                                // not parse opens the sheet with a plain field
                                // (the hook's default), indistinguishable from a
                                // plain tap.
                                if (source) importer.resolveNow(source, "shortcut");
                            }}/>
                    </XStack>
                </Collapsible>

                {isEmpty ? (
                    <EmptyLibrary/>
                ) : (
                    <FlatList
                        data={library.recipes}
                        keyExtractor={(item: Recipe) => item.key}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        // The list runs to the bottom of the display and the
                        // last card scrolls clear of the home indicator, rather
                        // than the whole screen stopping short of it.
                        contentContainerStyle={{paddingBottom: insets.bottom + 8}}
                        renderItem={({item, index}: {item: Recipe; index: number}) => (
                            <SwipeableRecipeRow
                                recipe={item}
                                editing={editing}
                                showCoffeeMarker={showCoffeeMarker}
                                dottedProfile={dottedProfile}
                                bounceOnMount={index === 0 && bounceFirstRow}
                                onPress={() => openRecipe(item)}
                                onDelete={() => {
                                    setBounceFirstRow(false);
                                    library.deleteRecipe(item);
                                }}
                                onDuplicate={() => {
                                    setBounceFirstRow(false);
                                    library.duplicateRecipe(item);
                                }}/>
                        )}/>
                )}
            </YStack>

            <ImportSheet
                open={importOpen}
                importer={importer}
                onOpenChange={(open) => {
                    setImportOpen(open);
                    if (!open) {
                        importer.reset();
                        library.refresh();
                    }
                }}/>

            <NfcOverlay visible={scanning} mode="read" progress={readProgress}
                        onCancel={cancelScan}/>
        </>
    );
}
