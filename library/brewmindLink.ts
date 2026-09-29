import {LEGACY_NAMES, PodCoffee, httpsUrl, podCoffeeFromStored} from "@/library/podCoffee";

/**
 * The deep link a coffee app hands XBRW++ (issue #159).
 *
 *     xbrw://import?v=1&source=brewmind&share=<xBloom share URL>&bean.name=...
 *
 * The grammar is a contract with a second codebase, so this file is the only
 * place that knows it, in the same way `library/importInput.ts` is the only
 * place that knows what an xBloom link looks like. A screen must not read a
 * query parameter off one of these itself.
 *
 * Nothing here is React and nothing here navigates. The caller decides what to
 * do with a link; this only says what one means.
 */

/** The only grammar version this build can read. */
export const BREWMIND_LINK_VERSION = "1";

/** The provenance a `source=brewmind` link is recorded under. */
export const BREWMIND_SOURCE = "brewmind";

/**
 * Length caps.
 *
 * These exist because the value arrived from outside. They are *not* in
 * `podCoffee.ts` on purpose: a pod's `note` is a producer narrative running to
 * several hundred words and has always been kept whole, so a cap on the type
 * would start dropping a field that works today. Length is a property of where
 * a value came from rather than of the field, so it is enforced here, where an
 * untrusted value first arrives.
 *
 * The second reason is less obvious. `library/brew/handoff/encode.ts` does not
 * degrade the bean block when a share URL runs long, it throws. An uncapped
 * hostile link could therefore make every brew of that recipe unexportable, so
 * these caps are also what keeps the handoff working. Capped, the whole block
 * is roughly 3 kB before gzip against a 131 kB budget.
 */
const SHORT_TEXT = 120;
/** A URL's cap, shared by the coffee's link, its image, and `recipe.url`. */
const MAX_URL = 2000;
const CAPS: Readonly<Record<string, number>> = {
    name: SHORT_TEXT,
    roaster: SHORT_TEXT,
    roastingDate: SHORT_TEXT,
    roast: SHORT_TEXT,
    origin: SHORT_TEXT,
    country: SHORT_TEXT,
    region: SHORT_TEXT,
    farm: SHORT_TEXT,
    farmer: SHORT_TEXT,
    processing: SHORT_TEXT,
    fermentation: SHORT_TEXT,
    variety: SHORT_TEXT,
    beanMix: SHORT_TEXT,
    // Not a text field, but it arrives as text and is read by `elevated`.
    // A height nobody could write in 120 characters is not a height.
    elevation: SHORT_TEXT,
    aromatics: 500,
    note: 2000,
    url: MAX_URL,
    imageUrl: MAX_URL
};

/**
 * The parameter names that differ from the field names.
 *
 * `bean.image` is #159's spelling and `imageUrl` is the key this app has
 * stored and sent since the handoff shipped, so renaming either would break a
 * half that already works.
 *
 * The rest are #159's first table, which claimed Beanconqueror's field names
 * and diverged on five of them. The table has been corrected, but a link is
 * minted by a second codebase on a release schedule this one does not control,
 * so the old spellings keep working rather than becoming a silently dropped
 * field. They are taken from `LEGACY_NAMES` rather than listed again here:
 * two hand-maintained copies of the same rename would eventually disagree
 * about one field, and the one that disagreed would fail quietly.
 *
 * Aliasing happens before the cap is looked up, so a legacy spelling is capped
 * exactly like the current one.
 */
const PARAM_ALIASES: Readonly<Record<string, string>> = {
    image: "imageUrl",
    ...LEGACY_NAMES
};

export type BrewMindLink = {
    /** The raw `share` value, still to go through `parseImportInput`. */
    share: string;
    /** The coffee block, absent if the link carried no usable one. */
    coffee?: PodCoffee;
    /** The producer, as stated. Recorded rather than gated. */
    source?: string;
    /**
     * `recipe.url`: the producer's own page for this recipe.
     *
     * Not the share link and not the coffee's `url`. The share link resolves
     * to xBloom's copy of the numbers; this is the page that says why the
     * numbers are what they are, which is the part a recipe loses on the way
     * through xBloom. https only, on the same reasoning as an image.
     */
    recipeUrl?: string;
};

/**
 * Read an import deep link, or null if it is not one we can act on.
 *
 * `v` must be exactly `1`. An unknown version is refused outright rather than
 * read as far as it parses, which is the entire reason #159 puts a version in
 * the grammar: a link minted against a later grammar may mean something
 * different by the same parameter name, and half-reading it would import a
 * recipe with quietly wrong coffee rather than failing honestly.
 *
 * `source` is recorded, not gated. Only `brewmind` maps to a provenance today,
 * but anything else still imports and simply reads as an ordinary import.
 * The link is useful to anyone who can mint one, and refusing an unknown
 * producer would buy nothing.
 */
export function parseBrewMindLink(link: string): BrewMindLink | null {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return null;
    }

    // A custom scheme puts "import" in the host and an https one puts it in
    // the path, so look in both rather than assuming a door. Which links can
    // actually reach the app is settled by the registered schemes, not here.
    const segments = [url.host, ...url.pathname.split("/")]
        .map(part => part.trim().toLowerCase())
        .filter(part => part !== "");
    if (!segments.includes("import")) return null;

    const params = url.searchParams;
    if (params.get("v") !== BREWMIND_LINK_VERSION) return null;

    const share = params.get("share")?.trim();
    if (!share) return null;

    const result: BrewMindLink = {share};
    const source = params.get("source")?.trim();
    if (source) result.source = source;

    const coffee = coffeeFrom(params);
    if (coffee !== null) result.coffee = coffee;

    const recipeUrl = params.get("recipe.url")?.trim();
    if (recipeUrl !== undefined && recipeUrl.length <= MAX_URL) {
        const checked = httpsUrl(recipeUrl);
        if (checked !== undefined) result.recipeUrl = checked;
    }
    return result;
}

/**
 * Collect the `bean.*` parameters into a record and validate it.
 *
 * The validation is deliberately *not* reimplemented here. The record is handed
 * to `podCoffeeFromStored`, the same reader a restored backup goes through, so
 * the URL door and the storage door cannot drift apart: the https rule on a
 * link's image is the https rule on a stored one because it is the same line of
 * code. This function's only job is the part that is genuinely about URLs,
 * which is length.
 */
function coffeeFrom(params: URLSearchParams): PodCoffee | null {
    const record: Record<string, string> = {};
    let sawAny = false;

    for (const [key, value] of params.entries()) {
        if (!key.startsWith("bean.")) continue;
        sawAny = true;
        const param = key.slice("bean.".length);
        const field = PARAM_ALIASES[param] ?? param;
        const trimmed = value.trim();
        if (trimmed === "") continue;

        // Over-length drops the field and keeps the rest, rather than
        // truncating. A farm name cut at 120 characters is a different farm,
        // and a confident wrong answer is worse than a missing one.
        const cap = CAPS[field];
        if (cap !== undefined && trimmed.length > cap) continue;

        record[field] = trimmed;
    }

    if (!sawAny) return null;
    return podCoffeeFromStored(record);
}
