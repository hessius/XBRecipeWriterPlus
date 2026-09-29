/**
 * What we know about a coffee, and hand onwards.
 *
 * Named for BC's `Bean` fields rather than xBloom's, because this exists to
 * be handed to something else: `library/brew/handoff/envelope.ts` emits this
 * type as the envelope's `bean` block, so this declaration *is* the contract
 * with Beanconqueror.
 *
 * Two sources fill it, and neither fills all of it. An xPod carries what
 * xBloom's `podsVo` holds; a BrewMind link (#159) carries the rest. Every
 * name here is Beanconqueror's own, read off their `Bean` class and
 * `IBeanInformation`, including where that means their spelling rather than
 * this codebase's house style (`cupping_points`, not `cuppingScore`). #159's
 * first table claimed to use their names and quietly diverged on five of
 * them; the point of the block is to need no mapping layer at the far end, so
 * the table was corrected rather than the code. See the design doc.
 *
 * Their structure is not copied, only their names. Beanconqueror nests the
 * origin fields in a `bean_information[]` array because a blend has several
 * of them; a single coffee has one, and flattening it costs nothing a reader
 * at the far end cannot undo.
 *
 * Their types are not copied either, where copying them would lose something:
 * `cupping_points` and `elevation` are strings in their model and numbers
 * here, because a score and a height in metres are quantities, and the whole
 * reason this block exists is that a value should not decay into text on the
 * way through.
 *
 * `roast` is filled by a BrewMind link and never by a pod, though the pod
 * endpoint sends a field of that name: it was `1` on all five pods probed, so
 * whether it is a roast level or a constant is unknown, and an invented roast
 * level is worse than none (spec §2.1.1). BrewMind states a roast level
 * outright, which is a different thing from this app guessing one.
 *
 * `origin` has no #159 param on purpose. That issue replaces it with the finer
 * `country`/`region`/`farm`/`farmer`, but the pod path populates `origin` and
 * `resolvedOrigin` reads it, so removing it would drop a field from every pod
 * brew already recorded.
 */
export type PodCoffee = {
    name: string;
    roaster?: string;
    /** ISO 8601 date. */
    roastingDate?: string;
    roast?: string;
    origin?: string;
    country?: string;
    region?: string;
    farm?: string;
    farmer?: string;
    /** Metres. */
    elevation?: number;
    processing?: string;
    fermentation?: string;
    variety?: string;
    beanMix?: string;
    aromatics?: string;
    note?: string;
    cupping_points?: number;
    decaffeinated?: boolean;
    /** Link to the coffee. https only. */
    url?: string;
    imageUrl?: string;
};

/** A trimmed string, or undefined when there was nothing worth carrying. */
function text(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/**
 * An ISO 8601 date, kept exactly as it was given.
 *
 * #159 states the type, so it is enforced rather than assumed: without this a
 * roast date of "sometime last week" is stored, handed to Beanconqueror and
 * parsed by whatever reads it there, and the failure surfaces in the other
 * codebase rather than at the door it came through.
 *
 * The calendar is checked too, not just the shape. `2026-02-31` matches any
 * reasonable pattern and is not a day, and `Date` would quietly roll it into
 * March rather than refusing it.
 *
 * A time is allowed after the date because an ISO 8601 timestamp is still an
 * ISO 8601 date, and a roaster's system may well send one. The string is
 * returned untouched: trimming it to a date would be this app deciding what
 * the value meant.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function isoDate(value: unknown): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    const match = ISO_DATE.exec(raw);
    if (match === null) return undefined;

    const [, year, month, day] = match;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return undefined;
    // A rolled-over date is a different day from the one written down.
    if (
        parsed.getUTCFullYear() !== Number(year) ||
        parsed.getUTCMonth() + 1 !== Number(month) ||
        parsed.getUTCDate() !== Number(day)
    ) {
        return undefined;
    }
    return raw;
}

/**
 * A URL we are willing to keep and hand onwards.
 *
 * Checked here rather than at the far end because this is where a third-party
 * value is first touched: the pod endpoint is undocumented, and a #159 link is
 * a string from the open internet.
 */
export function httpsUrl(value: unknown): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    try {
        return new URL(raw).protocol === "https:" ? raw : undefined;
    } catch {
        return undefined;
    }
}

/**
 * An image URL we are willing to hand onwards.
 *
 * Shared by coffee metadata and recipe artwork so both paths apply the same
 * decorative-image rule. Kept as its own name because callers read as image
 * code; the rule itself is `httpsUrl`.
 */
export function podImageUrl(value: unknown): string | undefined {
    return httpsUrl(value);
}

/**
 * The text-valued keys, which is every field a name map can describe.
 *
 * Split out so the exhaustiveness guard below survives the widening. The
 * original `Record<keyof Required<PodCoffee>, string>` worked only while every
 * field was a string; #159 adds a number, a number and a boolean, and those
 * cannot be read by looking up one source key and trimming it.
 */
type TextField = {
    [K in keyof PodCoffee]-?: PodCoffee[K] extends string | undefined ? K : never
}[keyof PodCoffee];

/**
 * A source key for every text field.
 *
 * Still exhaustive, and still deliberately so: adding a text field to
 * `PodCoffee` without saying where it is read from is a compile error in both
 * readers below, which is what stops a new field being declared and then
 * silently never populated.
 */
type PodCoffeeFields = Record<TextField, string>;

/** A positive integer within range, or undefined. */
/**
 * A whole measurement, or nothing.
 *
 * Zero is refused rather than kept. Nothing grows at sea level and no roaster
 * prints "0 masl", so a zero here is overwhelmingly an empty field that was
 * serialised as a number on the way out. Keeping it would put a confident
 * wrong figure on a bean card, which is worse than saying nothing.
 *
 * Strings are accepted because a URL only ever carries strings.
 */
function counted(value: unknown, max: number): number | undefined {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
    if (!Number.isInteger(n) || n <= 0 || n > max) return undefined;
    return n;
}

/** A score within range, or undefined. Fractional, unlike a height. */
/**
 * A fractional score, or nothing. Cupping scores run to a half or a quarter
 * point, so unlike `counted` this one keeps the fraction.
 *
 * Zero is refused for the same reason the brew rating treats 0 as unrated
 * rather than as a verdict of nothing: an SCA score is a number between about
 * 60 and 100, and nobody scores a coffee zero. It is an empty field.
 */
function scored(value: unknown, max: number): number | undefined {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
    if (n <= 0 || n > max) return undefined;
    return n;
}

/**
 * Metres, out of however somebody wrote a height down.
 *
 * Beanconqueror stores elevation as a string and BrewMind's value is whatever
 * a user copied off a bag, so `1,800`, `1800 masl` and `5900 ft` all turn up
 * where `counted` alone would see only NaN and drop the field without telling
 * anyone. This reads the shapes a bag actually uses.
 *
 * Feet are converted rather than refused, because `5900 ft` states a height
 * unambiguously; it is only the *unit* that differs, and 0.3048 is exact by
 * definition. What is refused is anything that does not state one height:
 * a range (`1800-2000`), a unit this does not know, or trailing prose. The
 * pattern is anchored, so all three fall out of it rather than needing a rule
 * each.
 *
 * Deliberately not a general number parser. A confident wrong height on a bean
 * card is worse than a blank one, which is the same judgement `counted` makes
 * about zero.
 */
const METRES_PER_FOOT = 0.3048;
const METRE_UNITS = new Set(["", "m", "masl", "amsl", "mamsl",
                             "meter", "meters", "metre", "metres"]);
const FOOT_UNITS = new Set(["ft", "foot", "feet"]);
/** Digits, optionally grouped in thousands, then an optional bare unit word. */
const HEIGHT = /^(\d{1,3}(?:,\d{3})+|\d+)\s*([a-z]*)\.?$/i;

function elevated(value: unknown, max: number): number | undefined {
    if (typeof value !== "string") return counted(value, max);
    const match = HEIGHT.exec(value.trim());
    if (match === null) return undefined;
    const height = Number(match[1].replace(/,/g, ""));
    const unit = match[2].toLowerCase();
    if (FOOT_UNITS.has(unit)) return counted(Math.round(height * METRES_PER_FOOT), max);
    return METRE_UNITS.has(unit) ? counted(height, max) : undefined;
}

/**
 * A flag, from a boolean or from the `1`/`0` #159 sends over a URL.
 *
 * Anything else is undefined rather than false. "Not stated" and "stated not
 * to be decaf" are different claims about somebody's coffee, and only one of
 * them is ours to make.
 */
/**
 * A stated yes or no, or nothing at all.
 *
 * The three-way return is the point. `false` means the roaster said
 * caffeinated and `undefined` means they said nothing, and a bean card should
 * not claim the first when it was given the second.
 */
function flagged(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (value === "1" || value === 1) return true;
    if (value === "0" || value === 0) return false;
    return undefined;
}

/** Metres. Higher than any coffee grows, low enough to reject a typo. */
export const MAX_ELEVATION = 10_000;
/** Beanconqueror's cupping score is out of 100. */
export const MAX_CUPPING_SCORE = 100;

function podCoffeeFromRecord(value: unknown, fields: PodCoffeeFields): PodCoffee | null {
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const name = text(record[fields.name]);
    if (name === undefined) return null;

    const coffee: PodCoffee = {name};

    // Every text field, by its source key. A loop rather than a line each:
    // the list is now long enough that fourteen near-identical lines is where
    // a copy-paste slip puts `region` into `farm` without anything noticing.
    const textFields: readonly Exclude<TextField, "name">[] = [
        "roaster", "roast", "origin", "country", "region",
        "farm", "farmer", "processing", "fermentation", "variety", "beanMix",
        "aromatics", "note"
    ];
    for (const field of textFields) {
        const read = text(record[fields[field]]);
        if (read !== undefined) coffee[field] = read;
    }

    const imageUrl = podImageUrl(record[fields.imageUrl]);
    if (imageUrl !== undefined) coffee.imageUrl = imageUrl;
    const url = httpsUrl(record[fields.url]);
    if (url !== undefined) coffee.url = url;
    const roastingDate = isoDate(record[fields.roastingDate]);
    if (roastingDate !== undefined) coffee.roastingDate = roastingDate;
    return coffee;
}

/**
 * Read a `podsVo` object into the subset we keep.
 *
 * Null without a name. The name is the only field BC can match a bean on
 * (spec §4.5.1 decision 5), so a block without one cannot do anything except
 * take up room in the URL.
 *
 * The #159 fields are mapped to source keys the pod endpoint does not send, so
 * a pod produces exactly the object it produced before that issue. They are
 * named rather than omitted because the map is exhaustive on purpose: a field
 * added to `PodCoffee` and forgotten here would otherwise be a field that
 * silently never populates. If xBloom ever starts sending one, the key is
 * already waiting.
 */
export function podCoffeeFromPodsVo(podsVo: unknown): PodCoffee | null {
    return podCoffeeFromRecord(podsVo, {
        name: "theName",
        origin: "origin",
        processing: "process",
        variety: "varietal",
        aromatics: "flavor",
        note: "introduce",
        beanMix: "type",
        imageUrl: "imagePath",
        roaster: "roaster",
        roastingDate: "roastDate",
        // Deliberately *not* the pod's own `roast`, which is the field the
        // doc comment above refuses to record. This key is one the endpoint
        // does not send, so a pod leaves the roast level empty.
        roast: "roastLevel",
        country: "country",
        region: "region",
        farm: "farm",
        farmer: "farmer",
        fermentation: "fermentation",
        url: "url"
    });
}

/**
 * Read coffee metadata back from XBRW++'s own stored recipe JSON.
 *
 * Stored recipe JSON is not trusted input: backups and restores pass through
 * the same constructor, so keep the validation beside the xBloom reader rather
 * than assigning a persisted object directly.
 *
 * The three non-text fields are read here and not in the shared mapper,
 * because the pod endpoint has no concept of any of them: a name map would
 * have to invent source keys for fields that provably never arrive. Their
 * stored names are their own, which is what "stored" means.
 *
 * No length caps, deliberately. A pod's `introduce` is a producer narrative
 * running to several hundred words, so a cap added here would begin dropping a
 * field that works today. Length is a property of where a value came from
 * rather than of the type, so it is enforced where untrusted values arrive:
 * `library/brewmindLink.ts` for a URL.
 */
/**
 * The names this block used before it was corrected to Beanconqueror's own.
 *
 * A recipe imported while the app spoke the old names carries them in its
 * stored JSON, and a brew recorded from one carries them in its `coffee`
 * column. Neither is rewritten on upgrade, so both are still read here: a
 * rename that silently emptied the process and roast level of every coffee
 * already on a phone would be a worse bug than the drift it fixed.
 *
 * Applied only where the current name is absent. A record holding both was
 * written by a newer app than the one that wrote the legacy key, so its own
 * spelling is the one that meant something.
 */
export const LEGACY_NAMES: Readonly<Record<string, string>> = {
    roastDate:    "roastingDate",
    roastLevel:   "roast",
    process:      "processing",
    cuppingScore: "cupping_points",
    decaf:        "decaffeinated"
};

function withCurrentNames(record: Record<string, unknown>): Record<string, unknown> {
    let patched: Record<string, unknown> | undefined;
    for (const legacy of Object.keys(LEGACY_NAMES)) {
        const current = LEGACY_NAMES[legacy];
        if (record[current] === undefined && record[legacy] !== undefined) {
            patched ??= {...record};
            patched[current] = record[legacy];
        }
    }
    return patched ?? record;
}

export function podCoffeeFromStored(value: unknown): PodCoffee | null {
    if (value === null || typeof value !== "object") return null;
    const record = withCurrentNames(value as Record<string, unknown>);

    const coffee = podCoffeeFromRecord(record, {
        name: "name",
        origin: "origin",
        processing: "processing",
        variety: "variety",
        aromatics: "aromatics",
        note: "note",
        beanMix: "beanMix",
        imageUrl: "imageUrl",
        roaster: "roaster",
        roastingDate: "roastingDate",
        roast: "roast",
        country: "country",
        region: "region",
        farm: "farm",
        farmer: "farmer",
        fermentation: "fermentation",
        url: "url"
    });
    if (coffee === null) return null;

    const elevation = elevated(record.elevation, MAX_ELEVATION);
    const cuppingPoints = scored(record.cupping_points, MAX_CUPPING_SCORE);
    const decaffeinated = flagged(record.decaffeinated);

    if (elevation !== undefined) coffee.elevation = elevation;
    if (cuppingPoints !== undefined) coffee.cupping_points = cuppingPoints;
    if (decaffeinated !== undefined) coffee.decaffeinated = decaffeinated;
    return coffee;
}
