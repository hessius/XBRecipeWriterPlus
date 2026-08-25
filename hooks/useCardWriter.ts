import {useState} from "react";
import {Platform} from "react-native";
import {notify} from "@/components/XbrwToast";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import {canWriteToCard} from "@/library/cardLimits";
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
 * One `NFC` instance is held for the hook's lifetime. It used to be built per
 * render, which quietly broke Cancel: showing the overlay is a state change, so
 * by the time the user could press Cancel the handler they pressed belonged to
 * a later render and closed a transport nobody was writing to. The write went
 * on behind a dismissed overlay.
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

    // A lazy `useState` rather than `useMemo`: React only promises `useMemo` as
    // a hint and may drop the cache, and a dropped cache here would be the very
    // bug this replaces. This one must genuinely be constructed once.
    const [nfc] = useState(() => new NFC());

    async function onNFCDialogClose() {
        await nfc.close();
        setShowNfcOverlay(false);
    }

    async function progressCallback(progress: number, id?: string): Promise<string | undefined> {
        // Both platforms, not one. The overlay reaches iOS for the first time
        // in this sub-project, and this used to sit in the `else` of the check
        // below — so on iOS the bloom stayed at zero for the whole write.
        setWriteProgress(progress);

        if (Platform.OS === "ios") {
            // The one line of Apple's sheet we control. It carries the
            // placement teaching rather than a percentage: the sheet already
            // has a spinner, and our own half above it no longer repeats the
            // copy, so this is the only place it appears on iOS.
            setNfcAlertIOS(progress >= 100
                ? "Recipe written to card"
                : "Hold the card to the top of the phone.");
        }
        return undefined;
    }

    async function writeCard(recipe: Recipe | null) {
        console.log('Write Card')
        try {
            if (recipe !== null) {
                console.log(recipe);
                if (canWriteToCard(recipe)) {
                    onVolumeError(null);
                    setWriteProgress(0);
                    setShowNfcOverlay(true);
                    await recipe.writeCard(nfc, progressCallback);
                    setShowNfcOverlay(false);
                } else {
                    onVolumeError(
                        "The recipe cannot be written to the card. Check that all values are within range."
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
