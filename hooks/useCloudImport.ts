import {useEffect, useState} from "react";

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

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const stored = await loadSession();
            // A restore that lands after the screen is gone must not touch
            // state: React warns, and worse, it would fetch on behalf of a hook
            // nobody is watching.
            if (cancelled) return;
            if (!stored) {
                setStatus("signedOut");
                return;
            }
            setSession(stored);
            await list(stored, () => cancelled);
        })();
        return () => {
            cancelled = true;
        };
        // Once, on mount. The hook owns the session from here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function list(active: Session, gone: () => boolean = () => false) {
        setStatus("listing");
        setError(null);
        try {
            const rows = await fetchCloudRecipes(active);
            if (gone()) return;
            setPlan(buildImportPlan(rows, localRecipes()));
            setStatus("choosing");
        } catch (caught) {
            if (gone()) return;
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
                setStatus(session ? "choosing" : "signedOut");
            }
        }
    }

    async function submitSignIn(email: string, password: string) {
        setStatus("signingIn");
        setError(null);
        try {
            const next = await signIn(email, password);
            setSession(next);
            await list(next);
        } catch (caught) {
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
                          entry.cloudId === cloudId
                              ? {...entry, selected: !entry.selected}
                              : entry
                      ),
                  }
        );
    }

    async function confirm() {
        if (!plan) return;
        setStatus("importing");

        const chosen = plan.entries.filter((entry) => entry.selected);
        const fresh = chosen.filter((entry) => !entry.existingUuid);
        const replacing = chosen.filter((entry) => entry.existingUuid);

        // One call for the inserts, because `saveRecipes` is transactional:
        // twenty recipes arrive together or not at all.
        if (fresh.length > 0) saveRecipes(fresh.map((entry) => entry.recipe));
        for (const entry of replacing) {
            replaceRecipe(entry.existingUuid!, entry.recipe);
        }

        setImported(chosen.length);
        setStatus("done");
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
