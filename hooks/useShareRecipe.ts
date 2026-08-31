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
export type ShareErrorReason =
    | "network"
    | "limited"
    | "unavailable"
    | "unusable"
    /** A mint for this exact recipe is already running on the server. */
    | "pending";

/**
 * An opaque per-snapshot idempotency key.
 *
 * Random rather than derived from the payload: a hash of the snapshot would be
 * the same string for two people who built the same recipe, and the server
 * caches a *minted link* against this key. A collision would hand one user the
 * other's share URL. Randomness makes that impossible; reuse across retries is
 * what `keys` below provides.
 */
function newIdempotencyKey(): string {
    const rand = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

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
    // Snapshot → idempotency key. The timeout below aborts our fetch but cannot
    // abort the server's already-started mint, so a retry has to arrive under
    // the *same* key or it mints a second permanent copy of the same recipe.
    const keys = useRef(new Map<string, string>());

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

        let key = keys.current.get(snapshot);
        if (key === undefined) {
            key = newIdempotencyKey();
            keys.current.set(snapshot, key);
        }

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), SHARE_TIMEOUT_MS);
        try {
            const res = await fetch(SHARE_API_URL, {
                method:  "POST",
                headers: {"content-type": "application/json", "idempotency-key": key},
                body:    JSON.stringify({payload}),
                signal:  abort.signal
            });

            if (res.status === 429) {
                setState({status: "failed", reason: "limited"});
                return null;
            }
            if (res.status === 409) {
                // The mint we started before the last timeout is still running.
                // Retrying under the same key will return its result once it
                // lands, so this is worth waiting out rather than giving up on.
                setState({status: "failed", reason: "pending"});
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
            // The link is on the recipe now, so the key has nothing left to
            // protect and the map does not grow for the life of the screen.
            keys.current.delete(snapshot);

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
