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
 *
 * It hides itself on the brew screen, which is the same brew at full size.
 */
export default function LiveBrewBar() {
    const {run, dismiss} = useLiveBrew();
    const router = useRouter();
    const pathname = usePathname();

    if (run === null || pathname === "/brew") return null;

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
