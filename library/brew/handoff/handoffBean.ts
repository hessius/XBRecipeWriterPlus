/**
 * A pod's coffee, said in the words Beanconqueror's import contract uses.
 *
 * This exists because the two vocabularies are nearly but not quite the same,
 * and handing `PodCoffee` straight over looked right while quietly losing
 * fields. `PodCoffee.processing` is Beanconqueror's `process`, so a pod's
 * process never once arrived despite both sides having implemented it. An
 * explicit map makes that class of mismatch a thing somebody has to write
 * down rather than a thing that silently does not happen.
 *
 * Fields are left out only when the receiving app has nowhere to put them:
 *
 * - `roast` is a free string here and a `ROASTS_ENUM` there, and a pod never
 *   fills it anyway (see the note on `PodCoffee`), so there is nothing to map
 *   and no safe guess to make.
 * - `fermentation` has no field in Beanconqueror's bean or bean information.
 * - `cupping_points` is a number here; Beanconqueror's is a string holding a
 *   cupping score the user gave, which is a different claim from a roaster's.
 * - `url` has a home on a Beanconqueror bean but no field in the contract.
 *
 * `origin` falls back to `country` because Beanconqueror stores the contract's
 * `origin` as `country`, and a coffee that names one and not the other means
 * the same thing either way.
 */
import type {PodCoffee} from "@/library/podCoffee";

/** The bean block of a handoff envelope, as Beanconqueror decodes it. */
export type HandoffBean = {
    name: string;
    roaster?: string;
    /** ISO 8601, a bare day or a full timestamp. */
    roastingDate?: string;
    origin?: string;
    region?: string;
    farm?: string;
    farmer?: string;
    /** Metres, as text: the receiving app stores elevation as a string. */
    elevation?: string;
    process?: string;
    variety?: string;
    aromatics?: string;
    note?: string;
    beanMix?: string;
    decaffeinated?: boolean;
    imageUrl?: string;
};

/** Contributes the key only when there is something to say. */
function whenSaid<K extends string, T>(
    key: K,
    value: T | undefined
): Partial<Record<K, T>> {
    return value === undefined ? {} : ({[key]: value} as Partial<Record<K, T>>);
}

export function handoffBean(coffee: PodCoffee): HandoffBean {
    return {
        name: coffee.name,
        ...whenSaid("roaster", coffee.roaster),
        ...whenSaid("roastingDate", coffee.roastingDate),
        ...whenSaid("origin", coffee.origin ?? coffee.country),
        ...whenSaid("region", coffee.region),
        ...whenSaid("farm", coffee.farm),
        ...whenSaid("farmer", coffee.farmer),
        ...whenSaid(
            "elevation",
            typeof coffee.elevation === "number" &&
                Number.isFinite(coffee.elevation)
                ? String(coffee.elevation)
                : undefined
        ),
        ...whenSaid("process", coffee.processing),
        ...whenSaid("variety", coffee.variety),
        ...whenSaid("aromatics", coffee.aromatics),
        ...whenSaid("note", coffee.note),
        ...whenSaid("beanMix", coffee.beanMix),
        ...whenSaid("decaffeinated", coffee.decaffeinated),
        ...whenSaid("imageUrl", coffee.imageUrl)
    };
}

export default handoffBean;
