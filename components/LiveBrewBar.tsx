import React, {useEffect, useRef, useState} from "react";
import {usePathname} from "expo-router";

import BrewMiniBar from "@/components/BrewMiniBar";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import BrewRatingBar from "@/components/BrewRatingBar";
import {useSteadyRouter} from "@/hooks/steadyRouter";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRatingPrompt} from "@/hooks/useRatingPrompt";
import {resolveAccent} from "@/library/accent";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {brewFigures} from "@/library/brew/brewFigures";
import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * Whatever the bottom of the app has to say, wherever you are.
 *
 * Mounted beside the navigator rather than inside a screen: a brew you walked
 * away from is still there when you are in Settings or the editor, and the
 * question about the brew you have just drunk has exactly the same shape.
 *
 * One slot, and a live run always wins it. A brew that is happening is time
 * critical and a question about an old one is not, so the question waits until
 * the new brew is over.
 */
/**
 * Where the bar has nothing to add.
 *
 * `brew` is the same brew at full size. The other two are the record it
 * becomes: the modal covers them, and the rating question would be asking
 * about the very brew the screen is already showing.
 */
const SILENT = new Set(["/brew", "/brewRecord", "/brewHistory"]);

export default function LiveBrewBar() {
    const {run, dismiss} = useLiveBrew();
    const prompt = useRatingPrompt();
    const router = useSteadyRouter();
    const pathname = usePathname();
    const wasSilent = useRef(SILENT.has(pathname));
    // The brew the note sheet is about, held here rather than read from the
    // prompt. Rating is what opens the sheet, and a rated brew is no longer a
    // brew the prompt offers -- so a sheet drawn from `prompt.brew` would be
    // unmounted by the very gesture that opened it.
    const [noting, setNoting] = useState<StoredBrew | null>(null);

    useEffect(() => {
        const silent = SILENT.has(pathname);
        if (wasSilent.current && !silent) {
            prompt.refresh();
        }
        wasSilent.current = silent;
    }, [pathname, prompt]);

    if (SILENT.has(pathname)) return null;

    if (run !== null) {
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

    const asking = prompt.brew;
    if (asking === null && noting === null) return null;

    return (
        <>
            {asking !== null && (
                <BrewRatingBar
                    recipeName={asking.recipeName}
                    figures={brewFigures(asking)}
                    pours={poursFromPlan(asking.plan)}
                    samples={[]}
                    accent={asking.accent}
                    onOpen={() => router.push(`/brewRecord?id=${asking.id}`)}
                    onRate={(rating) => {
                        // Written first, so dismissing the sheet loses nothing.
                        prompt.rate(rating);
                        setNoting({...asking, rating});
                    }}
                    onDismiss={prompt.dismiss}
                />
            )}
            {noting !== null && (
                <BrewNoteSheet
                    open={true}
                    onOpenChange={() => setNoting(null)}
                    figures={brewFigures(noting)}
                    recipeName={noting.recipeName}
                    rating={noting.rating ?? 0}
                    note={noting.note ?? ""}
                    onRate={(rating) => {
                        prompt.rate(rating);
                        setNoting((was) => was === null ? was : {...was, rating});
                    }}
                    onNote={prompt.annotate}
                />
            )}
        </>
    );
}
