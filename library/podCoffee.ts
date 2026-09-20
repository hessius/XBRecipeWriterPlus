/**
 * What an xPod tells us about its coffee.
 *
 * Named for BC's `Bean` fields rather than xBloom's, because this exists to
 * be handed to something else. `roast` is deliberately absent: it was `1` on
 * all five pods probed, so whether it is a roast level or a constant is
 * unknown, and an invented roast level is worse than none (spec §2.1.1).
 */
export type PodCoffee = {
    name: string;
    origin?: string;
    process?: string;
    variety?: string;
    aromatics?: string;
    note?: string;
    beanMix?: string;
    imageUrl?: string;
};

/** A trimmed string, or undefined when there was nothing worth carrying. */
function text(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/**
 * An image URL we are willing to hand onwards.
 *
 * Checked here rather than at the far end because this is where the
 * third-party response is first touched: the endpoint is undocumented and
 * nothing guarantees the shape it returns.
 *
 * This is intentionally stricter than `Recipe.imageURL`, its looser sibling
 * read from the same xBloom field. Task 3 should converge the two.
 */
function httpsUrl(value: unknown): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    try {
        return new URL(raw).protocol === "https:" ? raw : undefined;
    } catch {
        return undefined;
    }
}

type PodCoffeeFields = Record<keyof Required<PodCoffee>, string>;

function podCoffeeFromRecord(value: unknown, fields: PodCoffeeFields): PodCoffee | null {
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const name = text(record[fields.name]);
    if (name === undefined) return null;

    const coffee: PodCoffee = {name};
    const origin = text(record[fields.origin]);
    const process = text(record[fields.process]);
    const variety = text(record[fields.variety]);
    const aromatics = text(record[fields.aromatics]);
    const note = text(record[fields.note]);
    const beanMix = text(record[fields.beanMix]);
    const imageUrl = httpsUrl(record[fields.imageUrl]);

    if (origin !== undefined) coffee.origin = origin;
    if (process !== undefined) coffee.process = process;
    if (variety !== undefined) coffee.variety = variety;
    if (aromatics !== undefined) coffee.aromatics = aromatics;
    if (note !== undefined) coffee.note = note;
    if (beanMix !== undefined) coffee.beanMix = beanMix;
    if (imageUrl !== undefined) coffee.imageUrl = imageUrl;
    return coffee;
}

/**
 * Read a `podsVo` object into the subset we keep.
 *
 * Null without a name. The name is the only field BC can match a bean on
 * (spec §4.5.1 decision 5), so a block without one cannot do anything except
 * take up room in the URL.
 */
export function podCoffeeFromPodsVo(podsVo: unknown): PodCoffee | null {
    return podCoffeeFromRecord(podsVo, {
        name: "theName",
        origin: "origin",
        process: "process",
        variety: "varietal",
        aromatics: "flavor",
        note: "introduce",
        beanMix: "type",
        imageUrl: "imagePath"
    });
}

/**
 * Read coffee metadata back from XBRW++'s own stored recipe JSON.
 *
 * Stored recipe JSON is not trusted input: backups and restores pass through
 * the same constructor, so keep the validation beside the xBloom reader rather
 * than assigning a persisted object directly.
 */
export function podCoffeeFromStored(value: unknown): PodCoffee | null {
    return podCoffeeFromRecord(value, {
        name: "name",
        origin: "origin",
        process: "process",
        variety: "variety",
        aromatics: "aromatics",
        note: "note",
        beanMix: "beanMix",
        imageUrl: "imageUrl"
    });
}
