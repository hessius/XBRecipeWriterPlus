import React from "react";
import {usePathname, useRouter} from "expo-router";

import BrewMiniBar from "@/components/BrewMiniBar";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {resolveAccent} from "@/library/accent";

/**
 * The live brew bar, wherever you are.
 *
 * Mounted beside the navigator rather than inside a screen: the whole point of
 * the bar is that a brew you walked away from is still there when you are in
 * Settings or the editor, and a bar that belongs to the library screen goes
 * away with it.
 */
/**
 * Where the bar has nothing to add.
 *
 * `brew` is the same brew at full size. The other two are the record it
 * becomes: the modal covers them, and before it was a modal the bar sat on top
 * of the export screen.
 */
const SILENT = new Set(["/brew", "/brewRecord", "/brewHistory"]);

export default function LiveBrewBar() {
    const {run, dismiss} = useLiveBrew();
    const router = useRouter();
    const pathname = usePathname();

    if (run === null || SILENT.has(pathname)) return null;

    return (
        <BrewMiniBar
            recipeName={run.recipe.displayName()}
            dose={run.recipe.dosage}
            pours={run.recipe.pours}
            samples={run.samples}
            accent={resolveAccent(run.recipe)}
            phase={run.phase}
            elapsed={run.elapsed}
            holding={run.holding}
            heldSeconds={run.heldSeconds}
            // `view=1`, not the recipe: this opens the run that is already
            // going rather than asking for a new one.
            onOpen={() => router.push("/brew?view=1")}
            onDismiss={dismiss}
        />
    );
}
