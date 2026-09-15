import type {Session} from "./session";
import {authFields, post} from "./transport";

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

/** Far past any real library. A server still returning full pages here is broken. */
const MAX_PAGES = 20;

/** A `recipeVo`, exactly as `XBloomRecipe` already knows how to read one. */
export type CloudRow = Record<string, unknown>;

export async function fetchCloudRecipes(
    session: Session,
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
                adaptedModel: 1,
            },
            true,
            signal
        );

        const list = Array.isArray(response.list) ? response.list : [];
        for (const row of list) {
            if (typeof row === "object" && row !== null) out.push(row as CloudRow);
        }

        // Short page means last page. An exactly-full library returns a full
        // page and then an empty one, which the same test catches.
        if (list.length < PAGE_SIZE) break;
    }

    return out;
}
