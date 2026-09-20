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

/**
 * Read a `podsVo` object into the subset we keep.
 *
 * Null without a name. The name is the only field BC can match a bean on
 * (spec §4.5.1 decision 5), so a block without one cannot do anything except
 * take up room in the URL.
 */
export function podCoffeeFrom(podsVo: unknown): PodCoffee | null {
    if (podsVo === null || typeof podsVo !== "object") return null;
    const vo = podsVo as Record<string, unknown>;
    const name = text(vo.theName);
    if (name === undefined) return null;

    const coffee: PodCoffee = {name};
    const origin = text(vo.origin);
    const process = text(vo.process);
    const variety = text(vo.varietal);
    const aromatics = text(vo.flavor);
    const note = text(vo.introduce);
    const beanMix = text(vo.type);
    const imageUrl = httpsUrl(vo.imagePath);

    if (origin !== undefined) coffee.origin = origin;
    if (process !== undefined) coffee.process = process;
    if (variety !== undefined) coffee.variety = variety;
    if (aromatics !== undefined) coffee.aromatics = aromatics;
    if (note !== undefined) coffee.note = note;
    if (beanMix !== undefined) coffee.beanMix = beanMix;
    if (imageUrl !== undefined) coffee.imageUrl = imageUrl;
    return coffee;
}
