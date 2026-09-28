/**
 * One catalogue row, cleaned up.
 *
 * The catalogue's metadata is dirty in ways that are inherited rather than
 * fixable, so this is the one place in the app that knows about any of it.
 * Nothing downstream should ever split a string or second-guess a roast.
 *
 * Deliberately does not import `Recipe`. A hub row is a thing you are looking
 * at; it becomes a recipe only when somebody saves it, and only through the
 * existing share-link importer.
 */
import type {HubListRow} from "./hubApi";

/**
 * The separators rows use to pre-join a facet array into one element.
 *
 * Counted across all 2,966 live coffee rows: middle dot 1,666, comma 456,
 * bullet 119, katakana middle dot 76, semicolon 6. Split on all of them at
 * once rather than on the first one found, because four rows mix two
 * (`Ginger flower · Ripe plum · Hints of cocoa, Tangerine zest`).
 *
 * `&` and `/` are deliberately absent. `Herbs & Spices` is one flavour,
 * `Geisha/Gesha` is one varietal and `N/A` is not two of anything, so treating
 * either as a separator invents values that nobody wrote.
 */
const JOINERS = /[\u00b7\u2022\u30fb\uff65,;]/;

/**
 * Mojibake seen in real recipe names.
 *
 * These are UTF-8 bytes that were decoded as Mac Roman somewhere upstream of
 * us, most often a middle dot. Repaired rather than stripped, because the
 * character is doing real work as a separator in the name.
 */
const MISDECODED: [string, string][] = [
    ["\u00ac\u2211", "\u00b7"],
    ["\u00e2\u0080\u00a2", "\u2022"],
    ["\u00e2\u0080\u0099", "\u2019"]
];

/** Values that mean "not stated" rather than naming anything. */
const PLACEHOLDERS = new Set(["n/a", "na", "none", "null", "unknown", "-", "--"]);

export type HubRecipe = {
    id: number;
    name: string;
    imageURL: string | null;
    author: string;
    official: boolean;
    machine: string;
    cupType: string;
    coffeeType: string;
    origin: string[];
    varietal: string[];
    process: string[];
    flavour: string[];
    /** 1 to 5, or null when the row does not say. */
    roast: number | null;
    dose: number;
    grind: number;
    rpm: number;
    pourCount: number;
    ratio: number;
    volume: number | null;
    shareLink: string;
};

function repair(text: string): string {
    return MISDECODED.reduce((out, [wrong, right]) => out.split(wrong).join(right), text).trim();
}

/**
 * Turn a facet array into the list of values it was trying to be.
 *
 * Three shapes arrive here. A genuine array (`["Washed", "Natural"]`), a single
 * element with the whole list joined into it, and a single element that is
 * unparsed JSON the server stringified by accident.
 *
 * The plain-space separator is the awkward one and is why `vocabulary` exists.
 * "Washed Thermal Shock" is one process and "Costa Rica" is one country, so a
 * blind split on spaces would shred more rows than it rescued. A space is only
 * treated as a separator when neither real separator is present and **every**
 * piece is a value the server's own vocabulary lists. Without a vocabulary,
 * spaces are left alone.
 */
export function splitFacet(
    values: readonly (string | null)[] | null | undefined,
    vocabulary: readonly string[] = []
): string[] {
    if (!values) return [];
    const known = new Set(vocabulary.map((v) => v.toLowerCase()));
    const out: string[] = [];

    for (const raw of values) {
        if (typeof raw !== "string") continue;
        const text = repair(raw);
        if (text === "") continue;

        if (text.startsWith("[") && text.endsWith("]")) {
            try {
                const parsed: unknown = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    out.push(...parsed.filter((v): v is string => typeof v === "string"));
                    continue;
                }
            } catch {
                // Not JSON after all. Fall through and treat it as text, which
                // is better than dropping a value because of a stray bracket.
            }
        }

        if (JOINERS.test(text)) {
            out.push(...text.split(JOINERS));
            continue;
        }

        const pieces = text.split(/\s+/);
        if (pieces.length > 1 && pieces.every((p) => known.has(p.toLowerCase()))) {
            out.push(...pieces);
            continue;
        }

        out.push(text);
    }

    const seen = new Set<string>();
    return out
        .map((value) => value.trim())
        .filter((value) => {
            // `N/A`, `NONE` and a bare dash appear 38 times between them and
            // are somebody declining to answer, not a value. Left in, they
            // would become a filter chip offering to find coffees with no
            // flavour.
            if (value === "" || PLACEHOLDERS.has(value.toLowerCase())) return false;
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

/** What the browse and detail screens actually read. */
export function normaliseHubRow(
    raw: HubListRow,
    vocabulary: {origin?: readonly string[]; process?: readonly string[]} = {}
): HubRecipe {
    const volume = typeof raw.volume === "number"
        ? raw.volume
        : typeof raw.volume === "string" && raw.volume.trim() !== ""
            ? Number(raw.volume)
            : null;

    return {
        id: raw.communityRecipeId,
        name: repair(raw.recipeName ?? ""),
        imageURL: raw.imageUrl === "" ? null : raw.imageUrl,
        author: repair(raw.userName ?? ""),
        official: raw.official === 1,
        machine: raw.model ?? "",
        cupType: raw.cupType ?? "",
        coffeeType: repair(raw.type ?? ""),
        origin: splitFacet(raw.origin, vocabulary.origin),
        varietal: splitFacet(raw.varietal),
        process: splitFacet(raw.process, vocabulary.process),
        flavour: splitFacet(raw.flavor),
        // 0 and null both mean "not stated", and 479 of 3,020 rows are in that
        // state. Anything that treated 0 as an index would show them all as
        // the lightest roast, which is a fact about somebody's coffee that
        // nobody told us.
        roast: raw.roast === null || raw.roast === 0 ? null : raw.roast,
        dose: raw.dose,
        grind: raw.grinderSize,
        rpm: raw.rpm,
        pourCount: raw.pourCount,
        // `grandWater` is the ratio, not a water figure, despite the name: a
        // live row reads dose 15, grandWater 16, volume "240", and 15 x 16 = 240.
        ratio: raw.grandWater,
        volume: volume === null || Number.isNaN(volume) ? null : volume,
        shareLink: raw.shareRecipeLink
    };
}
