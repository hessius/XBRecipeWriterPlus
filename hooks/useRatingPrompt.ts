import {useEffect, useState} from "react";
import {AppState} from "react-native";

import {useSetting} from "@/hooks/useSetting";
import {sharedBrewDatabase} from "@/hooks/useBrewHistory";
import {isRating} from "@/library/brew/BrewRecord";
import {brewToRate, RATING_PROMPT_WINDOW_MS} from "@/library/brew/ratingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {Settings} from "@/library/Settings";

/** The two things the prompt needs of the database. Injected by tests. */
export type RatingPromptStore = {
    lastMeasuredBrew: () => StoredBrew | null;
    judge: (id: string, judgement: {rating?: number; note?: string}) => void;
};

type Candidate = {
    brew: StoredBrew | null;
    now: number;
};

/**
 * The next-visit rating question for the bottom bar.
 *
 * The candidate is read on mount and when the app returns to the foreground,
 * and deliberately nowhere else. Dismissing the live brew bar at the end of a
 * brew must not hand the same bottom-bar slot straight to a rating question,
 * because that reads as the bar refusing to go away. Waiting until the next
 * visit is the feature: the user has had a chance to taste the cup, and the
 * prompt appears because they came back rather than because the brew screen
 * finished.
 *
 * The first database read happens once per mount, in a lazy initialiser; that
 * is where this repo already puts a synchronous first read. Every later read
 * happens inside an app-state or navigation callback, so tests can inject a
 * tiny store instead of opening the native database.
 *
 * Nothing here writes rating columns by hand. `BrewDatabase.judge` is the one
 * verdict write path, and it pins the brew in the same statement, so a verdict
 * whose trace the next retention sweep would have taken is protected for free.
 */
export function useRatingPrompt(
    store?: RatingPromptStore,
    settings?: Settings
): {
    brew: StoredBrew | null;
    rate: (id: string, rating: number) => void;
    annotate: (id: string, note: string) => void;
    dismiss: (id: string) => void;
    refresh: () => void;
} {
    const [enabled] = useSetting("askForRatings", settings);
    const [dismissedId, setDismissedId] = useSetting("ratingPromptDismissed", settings);
    const database = () => store ?? sharedBrewDatabase();
    const [candidate, setCandidate] = useState<Candidate>(() => ({
        brew: database().lastMeasuredBrew(),
        now: Date.now()
    }));

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active") {
                setCandidate({brew: database().lastMeasuredBrew(), now: Date.now()});
            }
        });
        return () => subscription.remove();
        // The subscription is intentionally one per mount. `database` is a
        // render-local resolver so production can avoid opening SQLite during
        // render; adding it here would turn unrelated renders into app-state
        // resubscriptions without making the foreground read more correct.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function refresh(): void {
        setCandidate({brew: database().lastMeasuredBrew(), now: Date.now()});
    }

    const brew = brewToRate({
        brew: candidate.brew,
        now: candidate.now,
        dismissedId,
        enabled
    });

    useEffect(() => {
        if (brew === null) return;
        const expiresAt = brew.endedAt + RATING_PROMPT_WINDOW_MS;
        const timer = setTimeout(() => {
            setCandidate((was) => was.brew?.id === brew.id
                ? {...was, now: Math.max(Date.now(), expiresAt)}
                : was);
        }, Math.max(0, expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [brew]);

    function offeredBrew(id: string): StoredBrew | null {
        return candidate.brew?.id === id ? candidate.brew : null;
    }

    // The caller names the brew being written rather than asking this hook to
    // remember "the last one it offered". LiveBrewBar already owns that state
    // for the note sheet; duplicating it here would make the hook hold a stale
    // historical prompt alongside the current candidate.
    function rate(id: string, rating: number): void {
        const target = offeredBrew(id);
        if (target === null) return;
        if (!isRating(rating) || rating < 1) return;
        database().judge(target.id, {rating});
        // Written through and held locally so the bar leaves on this same
        // render pass, not on the next foreground read.
        setCandidate((was) => was.brew?.id === target.id
            ? {...was, brew: {...was.brew, rating}}
            : was);
    }

    function annotate(id: string, note: string): void {
        const target = offeredBrew(id);
        if (target === null) return;
        if (note === (target.note ?? "")) return;
        database().judge(target.id, {note});
        // Same local echo as `rate`: the screen should agree with the user's
        // action immediately rather than waiting for the next app visit.
        setCandidate((was) => was.brew?.id === target.id
            ? {...was, brew: {...was.brew, note}}
            : was);
    }

    function dismiss(id: string): void {
        if (offeredBrew(id) === null) return;
        setDismissedId(id);
    }

    return {brew, rate, annotate, dismiss, refresh};
}

export default useRatingPrompt;
