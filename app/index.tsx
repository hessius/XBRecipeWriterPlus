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
    // editor, stacking two screens for one shared link.
    //
    // A redelivery and a deliberate re-share of the same link are *identical* in
    // `hasShareIntent`/`shareIntent`: both are `false -> true` with the same
    // `webUrl`. So the guard cannot be cleared on the intent going away -- that
    // absence is one we cause ourselves by calling `resetShareIntent`, which
    // fires between the first handling and the redelivery and would forget the
    // payload just in time to import it again (the race the previous fix only
    // sometimes won). What actually tells the two apart is the user: a
    // deliberate re-share happens only after they backed out of the editor this
    // import opened and returned *here*. So the guard is cleared on this screen
    // regaining focus (the `useFocusEffect` below) -- an explicit user action --
    // and never on the mere absence of an intent.
    const handledShareUrl = useRef<string | null>(null);
    // The share URL present on the *previous* render, so the effect can act on a
    // genuinely new delivery rather than on a live intent merely continuing to
    // sit there. A dropped redelivery is not consumed by `resetShareIntent`
    // (there is nothing left to import), so `hasShareIntent` stays true with the
    // same `webUrl` until the next focus clears the guard -- at which point the
    // guard alone would let that still-live intent re-import. Keyed on the URL
    // going from absent (or different) to present, the effect ignores that
    // unchanged intent no matter when focus lands, while a deliberate re-share --
    // which the app's own `resetShareIntent` first drives to absent -- still
    // reads as a fresh delivery.
    const lastSeenShareUrl = useRef<string | null>(null);

    // True from the moment a push to the editor is issued until this screen is
    // focused again. Everything upstream of this guards one particular way a
    // recipe can arrive twice -- a redelivered share intent, a double tap, a
    // paste racing a share -- and each of those guards has to model its own
    // source correctly to work. This one models nothing: opening a second
    // editor while the first is still opening is never what the user asked
    // for, whatever produced the second recipe. It is the last line, not the
    // first.
    const navigatingToEditor = useRef(false);

    const importer = useRecipeImport({
        stored:       library.recipes,
        onOpenRecipe: (recipe, isExisting) => {
            setImportOpen(false);
            // Ask to navigate first: a recipe that arrives while an editor is
            // already opening is dropped whole, and a dropped arrival must not
            // announce itself either.
            if (!openRecipe(recipe)) {
                return;
            }
            if (isExisting) {
                // The same words a card read already uses when it turns out the
                // library has this one. `resolveOnOpen` never makes a copy, so
                // opening the existing recipe is the whole reveal.
                notify({tone: "info", message: "Already in your library"});
            }
        }
    });

    // The URL of a live web-URL share intent, or null when there is none. A
    // redelivery of the same payload and a deliberate re-share both surface here
    // as the same string; the effect below tells them apart by *when* the URL
    // appears, not by the value.
    const liveShareUrl =
        hasShareIntent && shareIntent.type === "weburl" && shareIntent.webUrl
            ? shareIntent.webUrl
            : null;
    // A failed shared lookup has nothing left to guard, and its intent is
    // already consumed. Read as a primitive so the clearing effect depends on
    // the status, not on the per-render `importer` identity.
    const importStatus = importer.state.status;

    // The header owns the whole strip, so the navigator's own bar would be a
    // second title above ours.
    useEffect(() => {
        navigation.setOptions({headerShown: false});
    }, [navigation]);

    useFocusEffect(
        React.useCallback(() => {
            library.refresh();
            // Back from the editor, so the next recipe to arrive is a new
            // journey and may open one of its own.
            navigatingToEditor.current = false;
            // Regaining focus is the one signal that separates a redelivery of a
            // shared link from a deliberate re-share of it: a re-share only
            // happens after the user left the editor this import opened and came
            // back here, whereas a redelivery arrives while that editor is still
            // opening or open and this screen never re-focuses. So this is where
            // the share guard is forgotten -- an explicit return by the user,
            // not the absence of an intent, which we cause ourselves.
            handledShareUrl.current = null;
            // Refreshing on focus is how a recipe saved in the editor appears
            // here. `library` is rebuilt every render, so depending on it would
            // re-run this on every render instead of on every focus.
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    useEffect(() => {
        // `useShareIntent` recreates `resetShareIntent` every render and hands a
        // redelivery back as a fresh object, so this effect re-runs over one
        // unchanging intent again and again. Acting only when the live URL
        // *differs from the one present last render* is what makes a redelivery
        // -- the same URL still sitting there -- a no-op, whether it arrives
        // while the editor is opening or survives untouched to a later focus.
        // The previous guard leaned on focus never landing during a redelivery;
        // but a dropped redelivery is never consumed, so it outlived the focus
        // that then cleared the guard and re-imported. A deliberate re-share is
        // a real change: the app reset the intent after handling, so the URL was
        // absent in between and reappears as a genuine new delivery.
        const previousUrl = lastSeenShareUrl.current;
        lastSeenShareUrl.current = liveShareUrl;
        if (!liveShareUrl || liveShareUrl === previousUrl) {
            // No live intent, or the same one we already saw last render. The
            // guard is *not* cleared here: that absence is one we cause by
            // calling `resetShareIntent` after handling, and clearing on it is
            // exactly what let a redelivery re-import. The guard is cleared only
            // when the user returns to this screen (the `useFocusEffect` above).
            return;
        }
        if (handledShareUrl.current === liveShareUrl) {
            // A genuinely new delivery, but of a payload we already acted on: the
            // redelivery that follows the reset we caused. Consume it so it
            // cannot linger in `useShareIntent` and re-fire across a foreground.
            resetShareIntent();
            return;
        }
        handledShareUrl.current = liveShareUrl;
        // The screen no longer knows what an xBloom link looks like. One module
        // does, and it is the same one the field uses -- two that had to agree
        // eventually would not.
        const source = parseImportInput(liveShareUrl);
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
    }, [liveShareUrl, resetShareIntent]);

    useEffect(() => {
        // A shared link that failed (network down, not found) leaves its guard
        // set while its intent is already consumed, so re-sharing the same link
        // to retry would be dropped until the user navigated away and back. An
        // error has nothing left to guard against a redelivery of, so forget it
        // and let a retry land. A fresh delivery is still required to act (see
        // the share effect), so clearing here cannot re-run the failed import on
        // its own.
        if (importStatus === "error") {
            handledShareUrl.current = null;
        }
    }, [importStatus]);

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
            //
            // No `saveEnabled` param: the editor lets any recipe be saved now,
            // including one that will not write, so there is nothing left for a
            // caller to disable.
            if (!openRecipe(toOpen)) {
                return;
            }
            if (isExisting) {
                notify({tone: "info", message: "Already in your library"});
            }
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

    function openRecipe(recipe: Recipe): boolean {
        if (navigatingToEditor.current) {
            return false;
        }
        navigatingToEditor.current = true;
        router.push({
            pathname: "/editRecipe",
            params:   {recipeJSON: JSON.stringify(recipe)}
        });
        return true;
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
