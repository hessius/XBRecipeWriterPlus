import {useRef, useState} from "react";

import {SHARE_API_URL, SHARE_TIMEOUT_MS} from "@/constants/share";
import type Recipe from "@/library/Recipe";
import {buildSharePayload, canonicalSnapshot, shareBlockReason} from "@/library/shareLink";

/**
 * Why a share did not happen.
 *
 * The same four words `useRecipeImport` uses, deliberately: the two features
 * fail in the same ways and a user should not have to learn two vocabularies
 * for one idea.
 */
export type ShareErrorReason = "network" | "limited" | "unavailable" | "unusable";

export type ShareState =
    | {status: "idle"}
    | {status: "sharing"}
    | {status: "failed"; reason: ShareErrorReason};

/**
 * Turn a recipe into a link.
 *
 * The memoisation is the point of the hook rather than a nicety. Every mint
 * creates a permanent, undeletable row in a shared xBloom account, so pressing
 * Share twice on an unchanged recipe must not create two of them. What is
 * compared is *what was sent*, not the whole recipe — changing raw backup bytes
 * does not needlessly mint, while changing a pour volume does.
 */
export function useShareRecipe() {
    const [state, setState] = useState<ShareState>({status: "idle"});
    // A ref, not state: it guards against a double tap within one render pass,
    // which a state flag would not see in time.
    const inFlight = useRef(false);

    async function share(recipe: Recipe): Promise<string | null> {
        if (inFlight.current) {
            return null;
        }

        if (shareBlockReason(recipe) !== null) {
            setState({status: "failed", reason: "unusable"});
            return null;
        }

        const payload = buildSharePayload(recipe);
        const snapshot = canonicalSnapshot(payload);
        if (recipe.shareUrl && recipe.shareSnapshot === snapshot) {
            setState({status: "idle"});
            return recipe.shareUrl;
        }

        inFlight.current = true;
        setState({status: "sharing"});

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), SHARE_TIMEOUT_MS);
        try {
            const res = await fetch(SHARE_API_URL, {
                method:  "POST",
                headers: {"content-type": "application/json"},
                body:    JSON.stringify({payload}),
                signal:  abort.signal
            });

            if (res.status === 429) {
                setState({status: "failed", reason: "limited"});
                return null;
            }
            if (res.status === 400) {
                setState({status: "failed", reason: "unusable"});
                return null;
            }
            if (!res.ok) {
                setState({status: "failed", reason: "unavailable"});
                return null;
            }

            const body = (await res.json()) as {tableId?: number; url?: string};
            if (typeof body.url !== "string" || typeof body.tableId !== "number") {
                setState({status: "failed", reason: "unavailable"});
                return null;
            }

            // Mutated in place and left for the caller to persist, which is how
            // every other recipe change in this app works.
            recipe.sharedTableId = body.tableId;
            recipe.shareUrl = body.url;
            recipe.shareSnapshot = snapshot;

            setState({status: "idle"});
            return body.url;
        } catch {
            setState({status: "failed", reason: "network"});
            return null;
        } finally {
            clearTimeout(timer);
            inFlight.current = false;
        }
    }

    function dismissError() {
        setState({status: "idle"});
    }

    return {state, share, dismissError};
}
