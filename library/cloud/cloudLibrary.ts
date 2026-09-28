import type {Session} from "./session";
import {ADAPTED_MODEL, type AdaptedModel} from "@/library/machine/machineModel";
import {CloudError, authFields, post} from "./transport";

/**
 * The recipes the account *created*.
 *
 * The endpoint is `tuMyTeaRecipeCreated` — Created — and the #74 spike
 * confirmed against a live account that it means exactly that: recipes opened
 * from a share link and brewed do not appear. This is why the feature is
 * "import my xBloom recipes" and not "import my xBloom library".
 *
 * Every surveyed client asks for one page of 100 and stops. The spike proved
 * pagination actually works, so this walks it: a library of 101 recipes would
 * otherwise lose one silently, which is the worst way to lose anything.
 */

const PAGE_SIZE = 100;

/**
 * Far past any real library. A server still returning full pages here is
 * broken, and the walk fails rather than looping or truncating.
 */
const MAX_PAGES = 20;

/** A `recipeVo`, exactly as `XBloomRecipe` already knows how to read one. */
export type CloudRow = Record<string, unknown>;

export async function fetchCloudRecipes(
    session: Session,
    signal?: AbortSignal
): Promise<CloudRow[]> {
    const out: CloudRow[] = [];
    // Both partitions, not the user's current one. This answers "what has this
    // account minted", and that does not change when somebody corrects which
    // machine they own. Reading only the current partition would hide every
    // earlier link from the fingerprint check, which would then mint a
    // duplicate row on every share. See the design spec, section 4.4.
    for (const adaptedModel of Object.values(ADAPTED_MODEL)) {
        out.push(...await fetchPartition(session, adaptedModel, signal));
    }
    return out;
}

/**
 * One partition's rows, walked to the end.
 *
 * Its own accumulator on purpose. The mid-list check below asks "have we
 * already collected rows in *this* walk", which is how an empty account is
 * told from a server that stopped part way through one. Sharing an accumulator
 * across partitions would make a user with rows under 1 and none under 2 —
 * which is nearly all of them — look like a broken walk.
 */
async function fetchPartition(
    session: Session,
    adaptedModel: AdaptedModel,
    signal?: AbortSignal
): Promise<CloudRow[]> {
    const out: CloudRow[] = [];

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
        const response = await post(
            "tuMyTeaRecipeCreated.tuhtml",
            {
                ...authFields(session.memberId, session.token),
                pageNumber,
                countPerPage: PAGE_SIZE,
                adaptedModel,
            },
            true,
            signal
        );

        if (!Array.isArray(response.list)) {
            // An empty account is allowed to answer with no list at all, so on
            // the first page this is simply "nothing here". Part way through a
            // walk it is not: it would end the loop early and hand back some
            // of the user's recipes as though they were all of them, and the
            // ones missing would read as "not in your account" — a wrong
            // answer given confidently, which is worse than an error.
            if (out.length > 0) {
                throw new CloudError("server", "xBloom stopped mid-list");
            }
            break;
        }

        const list = response.list;
        for (const row of list) {
            if (typeof row === "object" && row !== null) out.push(row as CloudRow);
        }

        // Short page means last page. An exactly-full library returns a full
        // page and then an empty one, which the same test catches.
        if (list.length < PAGE_SIZE) break;

        // Reaching the cap is not an ending, it is a failure to find one. The
        // rows gathered so far are deliberately thrown away rather than
        // returned: 2,000 recipes indistinguishable from a complete library is
        // the silent partial this whole function is arranged to avoid.
        if (pageNumber === MAX_PAGES) {
            throw new CloudError("server", "xBloom never stopped sending pages");
        }
    }

    return out;
}
