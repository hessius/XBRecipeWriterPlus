import {useState} from "react";
import {Platform} from "react-native";

import {notify} from "@/components/XbrwToast";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import type Recipe from "@/library/Recipe";

type CardWriter = {
    /** Write the given recipe to a card, reporting a pour-volume error first if invalid. */
    writeCard: (recipe: Recipe | null) => Promise<void>;
    /** Dismiss the NFC overlay and release the NFC session. */
    onNFCDialogClose: () => Promise<void>;
    /** Whether the NFC overlay should be shown, on both platforms. */
    showNfcOverlay: boolean;
    /** Write progress 0-100. */
    writeProgress: number;
};

/**
 * Owns writing a recipe to an NFC card.
 *
 * iOS and Android report progress differently: iOS also updates the text of
 * the system NFC sheet, while `writeProgress` drives the `NfcOverlay` on
 * both platforms.
 *
 * A fresh `NFC` instance is created per render, matching the previous
 * behaviour in editRecipe.tsx — `NFC` tracks whether its session is closed,
 * and holding one across renders would change when that flag is reset.
 */
export function useCardWriter(
    // The pour-volume mismatch is one state of one recipe, not an event, and
    // `useRecipeEditor` owns the recipe. Reporting into its setter rather than
    // keeping a local copy means there is a single atom for the message,
    // which both the write path and the save path can clear — two copies
    // of the same state can never reliably clear each other.
    onVolumeError: (message: string | null) => void
): CardWriter {
    const [writeProgress, setWriteProgress] = useState(0);
    const [showNfcOverlay, setShowNfcOverlay] = useState(false);

    const nfc = new NFC();

    async function onNFCDialogClose() {
        await nfc.close();
        setShowNfcOverlay(false);
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
                    onVolumeError(null);
                    setWriteProgress(0);
                    setShowNfcOverlay(true);
                    await recipe.writeCard(nfc, progressCallback);
                    setShowNfcOverlay(false);
                } else {
                    onVolumeError(
                        "Your individual pour volumes must add up to the total volume."
                    );
                }
            }
        } catch (e) {
            console.log("Write error!:" + e);
            setShowNfcOverlay(false);
            // A cancelled scan throws, and the user cancelling is not a failure.
            if (!nfc.getIsClosed()) {
                notify({tone: "error", message: "Could not write the recipe to the card."});
            }
        }
    }

    return {writeCard, onNFCDialogClose, showNfcOverlay, writeProgress};
}

export default useCardWriter;
