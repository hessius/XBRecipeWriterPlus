import {useEffect, useRef, useState} from "react";

import type Recipe from "@/library/Recipe";
import {fetchCloudRecipes} from "@/library/cloud/cloudLibrary";
import {buildImportPlan, type ImportPlan} from "@/library/cloud/importPlan";
import {loadSession, signIn, signOut, type Session} from "@/library/cloud/session";
import {CloudError, type CloudErrorKind} from "@/library/cloud/transport";

/**
 * Sign in, list, choose, write.
 *
 * The screen above holds no logic: everything that can be got wrong is either
 * here or, better, in `buildImportPlan`, which is pure. This hook's own job is
 * only the order things happen in and what to do when one of them fails.
 *
 * The database is injected rather than reached for, which is what lets the
 * whole state machine be tested without one.
 */

export type CloudImportStatus =
    | "restoring"
    | "signedOut"
    | "signingIn"
    | "listing"
    | "choosing"
    | "importing"
    | "done";

export type CloudImportDeps = {
    localRecipes: () => Recipe[];
    saveRecipes: (recipes: Recipe[]) => void;
    replaceRecipe: (uuid: string, recipe: Recipe) => void;
};

export function useCloudImport(deps: CloudImportDeps) {
    const {localRecipes, saveRecipes, replaceRecipe} = deps;

    const [status, setStatus] = useState<CloudImportStatus>("restoring");
    const [session, setSession] = useState<Session | null>(null);
    const [plan, setPlan] = useState<ImportPlan | null>(null);
    const [error, setError] = useState<CloudErrorKind | null>(null);
    const [imported, setImported] = useState(0);
    // Not state: nothing renders from it, and every async path reads it after
    // an await, where a captured render's value would already be stale.
    const gone = useRef(false);
    const written = useRef(false);

    useEffect(() => {
        gone.current = false;
        void (async () => {
            const stored = await loadSession();
            // A restore that lands after the screen is gone must not touch
            // state: React warns, and worse, it would fetch on behalf of a hook
            // nobody is watching.
            if (gone.current) return;
            if (!stored) {
                setStatus("signedOut");
                return;
            }
            setSession(stored);
            await list(stored);
        })();
        return () => {
            gone.current = true;
        };
        // Once, on mount. The hook owns the session from here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function list(active: Session) {
        setStatus("listing");
        setError(null);
        try {
            const rows = await fetchCloudRecipes(active);
            if (gone.current) return;
            setPlan(buildImportPlan(rows, localRecipes()));
            // A new plan is a new decision, and may be taken up to once.
            written.current = false;
            setStatus("choosing");
        } catch (caught) {
            if (gone.current) return;
            const kind = caught instanceof CloudError ? caught.kind : "server";
            setError(kind);
            if (kind === "unauthorised") {
                // A token-only design has exactly one failure that matters,
                // and this is it. Drop the dead session and ask again rather
                // than leaving the user on an error with no way out.
                await signOut();
                setSession(null);
                setStatus("signedOut");
            } else {
                // `choosing`, flatly. An earlier version asked `active ?
                // ... : "signedOut"` here, guarding against a listing failure
                // arriving with no session -- but `active` is the `Session`
                // this call was made with, so the limb could never run. The
                // guard it was reaching for is real and lives above: on the
                // first listing after a restore or a sign-in, `session` in
                // state still holds the `null` from the render that started
                // this, so that is the value never to read here. It would sign
                // out a user whose token is fine and whose wifi is not.
                setStatus("choosing");
            }
        }
    }

    async function submitSignIn(email: string, password: string) {
        setStatus("signingIn");
        setError(null);
        try {
            const next = await signIn(email, password);
            if (gone.current) return;
            setSession(next);
            await list(next);
        } catch (caught) {
            if (gone.current) return;
            setError(caught instanceof CloudError ? caught.kind : "server");
            setStatus("signedOut");
        }
    }

    function toggle(cloudId: number) {
        setPlan((current) =>
            current === null
                ? current
                : {
                      ...current,
                      entries: current.entries.map((entry) =>
                          entry.cloudId === cloudId && entry.selectable
                              ? {...entry, selected: !entry.selected}
                              : entry
                      ),
                  }
        );
    }

    /**
     * Returns what happened, rather than leaving the caller to read it back
     * out of state. The screen reports the outcome in a toast and navigates
     * away in the same handler, and after an await the `imported` it captured
     * at render is stale. An effect watching `status` would be the other way
     * round, and this repo does not seed or react to state in effects.
     */
    async function confirm(): Promise<{imported: number; failed: boolean} | null> {
        if (!plan) return null;
        // A second tap before the first render of `importing` would otherwise
        // run the writes again: the inserts collide on their uuids and throw,
        // and the replacements are applied twice. State cannot guard this --
        // it has not re-rendered yet -- and neither can releasing the flag at
        // the end of this function, because there is no await before the
        // writes, so the whole body runs before the second tap is dispatched.
        //
        // So the flag belongs to the plan rather than to the call: one plan is
        // imported at most once, and `list` clears it when a new one arrives.
        if (written.current) return null;
        written.current = true;
        setStatus("importing");

        const chosen = plan.entries.filter((entry) => entry.selected);
        const fresh = chosen.filter((entry) => !entry.existingUuid);
        const replacing = chosen.filter((entry) => entry.existingUuid);

        let landed = 0;
        try {
            // One call for the inserts, because `saveRecipes` is transactional:
            // twenty recipes arrive together or not at all.
            if (fresh.length > 0) {
                saveRecipes(fresh.map((entry) => entry.recipe));
                landed += fresh.length;
            }
            for (const entry of replacing) {
                replaceRecipe(entry.existingUuid!, entry.recipe);
                landed += 1;
            }
            setImported(landed);
            setStatus("done");
            return {imported: landed, failed: false};
        } catch {
            // The writes that landed are real and the user keeps them. Report
            // the count rather than a total that never happened, and land on
            // `done` with an error beside it: a half-finished import the user
            // can see is recoverable, a screen stuck on a spinner is not.
            setImported(landed);
            setError("server");
            setStatus("done");
            return {imported: landed, failed: true};
        }
    }

    async function forgetAccount() {
        await signOut();
        setSession(null);
        setPlan(null);
        setError(null);
        setStatus("signedOut");
    }

    async function refresh() {
        if (session) await list(session);
    }

    return {
        status,
        session,
        plan,
        error,
        imported,
        submitSignIn,
        toggle,
        confirm,
        refresh,
        forgetAccount,
    };
}
