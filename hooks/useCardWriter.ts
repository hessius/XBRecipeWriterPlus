import {useState} from "react";
import {Alert, Platform} from "react-native";

import NFC, {setNfcAlertIOS} from "@/library/NFC";
import type Recipe from "@/library/Recipe";

type CardWriter = {
    /** Write the given recipe to a card, reporting a pour-volume error first if invalid. */
    writeCard: (recipe: Recipe | null) => Promise<void>;
    /** Dismiss the Android progress sheet and release the NFC session. */
    onNFCDialogClose: () => Promise<void>;
    /** Whether the Android progress sheet should be shown. iOS uses the system sheet. */
    showAndroidNFCDialog: boolean;
    /** Write progress 0-100. Only meaningful on Android. */
    writeProgress: number;
};

/**
 * Owns writing a recipe to an NFC card.
 *
 * iOS and Android report progress differently: iOS updates the text of the
 * system NFC sheet, Android drives our own sheet via `writeProgress`.
 *
 * A fresh `NFC` instance is created per render, matching the previous
 * behaviour in editRecipe.tsx — `NFC` tracks whether its session is closed,
 * and holding one across renders would change when that flag is reset.
 */
export function useCardWriter(): CardWriter {
    const [writeProgress, setWriteProgress] = useState(0);
    const [showAndroidNFCDialog, setShowAndroidNFCDialog] = useState(false);

    const nfc = new NFC();

    async function onNFCDialogClose() {
        await nfc.close();
        setShowAndroidNFCDialog(false);
    }

    async function progressCallback(progress: number, id?: string): Promise<string | undefined> {
        console.log("Progress:" + progress);

        if (Platform.OS === "ios") {
            setNfcAlertIOS(progress >= 100
                ? "Recipe written to card"
                : "Writing recipe to card: " + Math.round(progress) + "%");
        } else {
            setWriteProgress(progress);
        }
        return undefined;
    }

    async function writeCard(recipe: Recipe | null) {
        console.log('Write Card')
        try {
            if (recipe !== null) {
                console.log(recipe);
                if (recipe.isPourVolumeValid()) {
                    if (Platform.OS !== "ios") {
                        setWriteProgress(0);
                        setShowAndroidNFCDialog(true);
                    }
                    await recipe.writeCard(nfc, progressCallback);
                    if (Platform.OS !== "ios") {
                        setShowAndroidNFCDialog(false);
                    }
                } else {
                    Alert.alert('Pour Volume Error', 'Your individual pour volumes must add up to the total volume', [
                        {
                            text:    'Ok',
                            onPress: () => console.log('Cancel Pressed')
                        }
                    ]);
                }
            }
        } catch (e) {
            console.log("Write error!:" + e);
            setShowAndroidNFCDialog(false);
            Alert.alert('Write Error', 'There was an error writing the recipe to the card');
        }
    }

    return {writeCard, onNFCDialogClose, showAndroidNFCDialog, writeProgress};
}

export default useCardWriter;
