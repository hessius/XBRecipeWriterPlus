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
import {accents} from "@/constants/colors";

import type {HubListRow} from "./hubApi";

/**
 * The separators rows use to pre-join a facet array into one element.
 *
 * Found by censusing every non-ASCII punctuation mark in every facet value of
 * all 2,966 live coffee rows, rather than by listing the ones we expected:
 * middle dot 3,801, bullet 191, katakana middle dot 169, ideographic comma
 * 113, plus ASCII comma and semicolon. Split on all of them at once rather
 * than on the first one found, because rows mix two
 * (`Ginger flower · Ripe plum · Hints of cocoa, Tangerine zest`).
 *
 * Deliberately absent, each for its own reason:
 * - `&` and `/`: `Herbs & Spices` is one flavour, `Geisha/Gesha` and
 *   `Catuai / Catuaí` are one varietal spelled two ways, `N/A` is not two of
 *   anything.
 * - en dash and em dash: flavour uses them as separators but origin and
 *   process use them as qualifiers (`Rwanda – Gakenke District`,
 *   `Natural – Dry Fermentation`), so splitting would shred an address.
 * - fullwidth comma U+FF0C: all seven uses are prose, not lists
 *   (`红葡萄酒香，红布林般的酸质`).
 */
const JOINERS = /[\u00b7\u2022\u30fb\uff65\u3001,;]/;

/**
 * Mojibake seen in real recipe names.
 *
 * UTF-8 bytes decoded as Mac Roman somewhere upstream of us. Only the middle
 * dot has actually been observed, on four rows
 * (`El Salvador ¬∑ Guatemala Washed Medium - dark`), and it is repaired
 * rather than stripped because it is doing real work as a separator.
 *
 * The other two are the Mac Roman forms the same pipeline would produce for a
 * bullet and a right quote, and are defensive: neither has been seen in 2,966
 * rows. They are listed in Mac Roman rather than Latin-1 on purpose, so the
 * table is internally consistent with the one case that is real.
 */
const MISDECODED: [string, string][] = [
    ["\u00ac\u2211", "\u00b7"],
    ["\u201a\u00c4\u00a2", "\u2022"],
    ["\u201a\u00c4\u00f4", "\u2019"]
];

/** Words that mean "not stated" rather than naming anything. */
const PLACEHOLDERS = new Set(["n/a", "na", "none", "null", "unknown"]);

/**
 * Whether a value says anything at all.
 *
 * A rule rather than a longer list of punctuation: `-`, `--` and `???` all
 * appear live and are all somebody declining to answer, and so is whatever
 * the next person types instead.
 */
const SAYS_SOMETHING = /[\p{L}\p{N}]/u;

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
                    // Back through the whole cleaner, not straight out: every
                    // live leak so far is a single plain word, but nothing
                    // says the string somebody stringified was clean.
                    out.push(...splitFacet(parsed as string[], vocabulary));
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
            // `N/A`, `NONE`, a bare dash and `???` appear about forty times
            // between them and are all somebody declining to answer. Left in,
            // they become a filter chip offering to find coffees whose
            // flavour is "N/A".
            if (!SAYS_SOMETHING.test(value)) return false;
            if (PLACEHOLDERS.has(value.toLowerCase())) return false;
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

/** What the browse and detail screens actually read. */
export function normaliseHubRow(
    raw: HubListRow,
    /**
     * The server's own words, used only to gate the plain-space split. Best
     * effort on purpose: it changes six values across the whole catalogue, so
     * a page normalised before `loadHubCriteria()` resolves is not meaningfully
     * different from the same page normalised after, and no caller has to
     * sequence the two or re-normalise on arrival.
     */
    vocabulary: {
        origin?: readonly string[];
        process?: readonly string[];
        coffeeType?: readonly string[];
    } = {}
): HubRecipe {
    // Read as `unknown` first. `HubListRow.volume` is typed `string` because
    // that is what all 2,966 rows send, so the other branches would otherwise
    // narrow to `never` and read as dead code somebody should delete. They are
    // not dead; they are this file doing its job.
    const wire: unknown = raw.volume;
    const volume = typeof wire === "number"
        ? wire
        : typeof wire === "string" && wire.trim() !== ""
            ? Number(wire)
            : null;

    return {
        id: raw.communityRecipeId,
        name: repair(raw.recipeName ?? ""),
        imageURL: (raw.imageUrl ?? "").trim() === "" ? null : raw.imageUrl,
        author: repair(raw.userName ?? ""),
        official: raw.official === 1,
        machine: raw.model ?? "",
        cupType: raw.cupType ?? "",
        // `type` is a facet wearing a string's clothes: the server's own
        // `coffeeTypeList` has three members, but the field is free text and
        // carries the same junk everything else does (`N/A` on 11 rows, `???`
        // on two, a joiner on 25). Through the same cleaner, then the first
        // value, because this draws as one badge.
        coffeeType: splitFacet([raw.type], vocabulary.coffeeType)[0] ?? "",
        origin: splitFacet(raw.origin, vocabulary.origin),
        varietal: splitFacet(raw.varietal),
        process: splitFacet(raw.process, vocabulary.process),
        flavour: splitFacet(raw.flavor),
        // 0 and null both mean "not stated", and 479 of 3,020 rows are in that
        // state. Anything that treated 0 as an index would show them all as
        // the lightest roast, which is a fact about somebody's coffee that
        // nobody told us.
        roast: raw.roast !== null && raw.roast >= 1 && raw.roast <= 5 ? raw.roast : null,
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

/**
 * A stable colour for a catalogue row.
 *
 * Not `resolveAccent`: that one needs a `Recipe` and writes an accent index
 * onto it, and a hub row is not owned by anybody. Keyed on the catalogue id so
 * the browse row and the detail screen agree about a recipe's colour, and so
 * the same recipe looks the same on the way back to it.
 *
 * Always the coffee half of the palette, because `buildHubRequest` asks for
 * `recipeType: 1` and the partition holds no tea. If the catalogue ever gets a
 * tea door, this needs the same split `accentGroupFor` makes.
 */
export function hubAccent(id: number): string {
    return accents.coffee[Math.abs(id) % accents.coffee.length];
}
