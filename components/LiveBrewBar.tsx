import React, {useEffect, useRef, useState} from "react";
import {Keyboard} from "react-native";
import {usePathname} from "expo-router";

import BrewMiniBar from "@/components/BrewMiniBar";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import BrewRatingBar from "@/components/BrewRatingBar";
import {EXIT_GRACE} from "@/components/XbrwSheet";
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
    const {run, dismiss, setRatingNoteOpen} = useLiveBrew();
    const prompt = useRatingPrompt();
    const router = useSteadyRouter();
    const pathname = usePathname();
    const wasSilent = useRef(SILENT.has(pathname));
    // The brew the note sheet is about, held here rather than read from the
    // prompt. Rating is what opens the sheet, and a rated brew is no longer a
    // brew the prompt offers -- so a sheet drawn from `prompt.brew` would be
    // unmounted by the very gesture that opened it.
    const [noting, setNoting] = useState<StoredBrew | null>(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const silent = SILENT.has(pathname);
        if (wasSilent.current && !silent) {
            prompt.refresh();
        }
        wasSilent.current = silent;
    }, [pathname, prompt]);

    function commitNoteDraft(updateLocal: boolean): void {
        Keyboard.dismiss();
        if (noting !== null && noteDraft !== (noting.note ?? "") &&
            prompt.annotate(noting.id, noteDraft)) {
            if (updateLocal) {
                setNoting((was) => was === null ? was : {...was, note: noteDraft});
            }
        }
    }

    function closeNoteSheet(): void {
        commitNoteDraft(true);
        setNoteOpen(false);
        setRatingNoteOpen(false);
        const closing = noting?.id;
        if (closeTimer.current !== null) {
            clearTimeout(closeTimer.current);
        }
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            setNoting((was) => was?.id === closing ? null : was);
        }, EXIT_GRACE);
    }

    function openNoteSheet(brew: StoredBrew, rating: number): void {
        if (closeTimer.current !== null) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        setNoting({...brew, rating});
        setNoteDraft(brew.note ?? "");
        setNoteOpen(true);
        setRatingNoteOpen(true);
    }

    useEffect(() => {
        if ((SILENT.has(pathname) || run !== null) && noting !== null) {
            Keyboard.dismiss();
            if (noteDraft !== (noting.note ?? "")) {
                prompt.annotate(noting.id, noteDraft);
            }
            const timer = setTimeout(() => {
                if (noting !== null) setNoting(null);
                if (noteOpen) setNoteOpen(false);
                if (noteDraft !== "") setNoteDraft("");
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [pathname, run, noting, noteDraft, noteOpen, prompt]);

    useEffect(() => () => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    }, []);

    if (SILENT.has(pathname)) {
        return null;
    }

    if (run !== null) {
        return (
            <BrewMiniBar
                recipeName={run.recipe.displayName()}
                dose={run.recipe.dosage}
                pours={run.recipe.pours}
                samples={run.samples}
                pauseIntervals={run.pauseIntervals}
                bypass={run.bypass}
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
                    accent={asking.accent}
                    onOpen={() => router.push(`/brewRecord?id=${asking.id}`)}
                    onRate={(rating) => {
                        // Written first, so dismissing the sheet loses nothing.
                        if (!prompt.rate(asking.id, rating)) return;
                        openNoteSheet(asking, rating);
                    }}
                    onDismiss={() => prompt.dismiss(asking.id)}
                />
            )}
            {noting !== null && (
                <BrewNoteSheet
                    open={noteOpen}
                    onOpenChange={(open) => {
                        if (open) {
                            setNoteOpen(true);
                            setRatingNoteOpen(true);
                        } else {
                            closeNoteSheet();
                        }
                    }}
                    onDone={closeNoteSheet}
                    figures={brewFigures(noting)}
                    recipeName={noting.recipeName}
                    rating={noting.rating ?? 0}
                    note={noting.note ?? ""}
                    onRate={(rating) => {
                        if (!prompt.rate(noting.id, rating)) return;
                        setNoting((was) => was === null ? was : {...was, rating});
                    }}
                    onNote={(note) => {
                        if (!prompt.annotate(noting.id, note)) return;
                        setNoteDraft(note);
                        setNoting((was) => was === null ? was : {...was, note});
                    }}
                    onNoteDraft={setNoteDraft}
                />
            )}
        </>
    );
}
