import React, {useEffect, useState} from "react";
import {Platform} from "react-native";
// gesture-handler's FlatList, not React Native's: it keeps the list scroll
// gesture and each row's swipe gesture from fighting each other on Android.
import {FlatList} from "react-native-gesture-handler";
import {useFocusEffect, useNavigation, useRouter} from "expo-router";
import {useShareIntentContext} from "expo-share-intent";
import {XStack, YStack} from "tamagui";

import CtaTile from "@/components/CtaTile";
import EmptyLibrary from "@/components/EmptyLibrary";
import HomeHeader from "@/components/HomeHeader";
import ImportRecipeComponent from "@/components/ImportRecipeComponent";
import NfcOverlay from "@/components/NfcOverlay";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useCollapsibleHeader} from "@/hooks/useCollapsibleHeader";
import {useRecipeLibrary, type RecipeStore} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import Recipe from "@/library/Recipe";
import {resolveOnOpen} from "@/library/duplicates";
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
    const router = useRouter();
    const navigation = useNavigation();

    const library = useRecipeLibrary(db);
    const {collapsed, onScroll} = useCollapsibleHeader();
    const [showCoffeeMarker] = useSetting("showCoffeeMarker", settings);

    const [editing, setEditing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [readProgress, setReadProgress] = useState(0);
    const [importId, setImportId] = useState<string | null>(null);
    const [bounceFirstRow, setBounceFirstRow] = useState(true);

    const {hasShareIntent, shareIntent, resetShareIntent} = useShareIntentContext();
    const nfc = new NFC();

    const isEmpty = library.recipes.length === 0;

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
            return;
        }
        const id = new URL(shareIntent.webUrl).searchParams.get("id");
        if (id) {
            // Reacting to an inbound share intent — an external system pushing
            // into React, which is what effects are for.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setImportId(id);
            resetShareIntent();
        }
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

            notify(isExisting
                ? {tone: "info", message: "Already in your library"}
                : {tone: "success", message: "Recipe read from card"});

            router.push({
                pathname: "/editRecipe",
                params:   {
                    recipeJSON: JSON.stringify(toOpen),
                    // An already-saved recipe opens with Save disabled, as it
                    // would from the list; only a genuinely new read arrives
                    // needing to be saved.
                    saveEnabled: isExisting ? "false" : "true"
                }
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
        router.push({pathname: "/editRecipe", params: {recipeJSON: JSON.stringify(recipe)}});
    }

    return (
        <>
            <YStack flex={1} backgroundColor={palette.base}>
                <HomeHeader
                    count={library.recipes.length}
                    collapsed={collapsed}
                    editing={editing}
                    showEdit={!isEmpty}
                    onToggleEdit={() => setEditing((current) => !current)}
                    onScan={readCard}
                    onImport={() => setImportId("")}
                    onSettings={() => router.push("/settings")}/>

                {!collapsed && (
                    <XStack gap="$3" paddingHorizontal="$3" paddingBottom="$3">
                        <CtaTile icon="scan" label="READ CARD"
                                 accessibilityLabel="Read a card" onPress={readCard}/>
                        <CtaTile icon="import" label="IMPORT"
                                 accessibilityLabel="Import a recipe"
                                 onPress={() => setImportId("")}/>
                    </XStack>
                )}

                {isEmpty ? (
                    <EmptyLibrary/>
                ) : (
                    <FlatList
                        data={library.recipes}
                        keyExtractor={(item: Recipe) => item.key}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        renderItem={({item, index}: {item: Recipe; index: number}) => (
                            <SwipeableRecipeRow
                                recipe={item}
                                editing={editing}
                                showCoffeeMarker={showCoffeeMarker}
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

            {importId !== null && (
                <ImportRecipeComponent
                    key={`import-${importId}`}
                    recipeId={importId}
                    onClose={() => {
                        setImportId(null);
                        library.refresh();
                    }}/>
            )}

            <NfcOverlay visible={scanning} mode="read" progress={readProgress}
                        onCancel={cancelScan}/>
        </>
    );
}
