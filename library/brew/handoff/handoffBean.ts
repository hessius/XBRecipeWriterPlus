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
 * the same thing either way. The fallback runs on a blank origin as well as a
 * missing one, because an endpoint that answers with an empty string has not
 * named an origin.
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

/**
 * Contributes the key only when there is something to say.
 *
 * A blank string is nothing said. The raw pod endpoints answer an unknown
 * field with an empty string about as often as they omit it, but
 * `podCoffee.ts` already trims and drops blanks at the door, so nothing blank
 * reaches here today. This is a second gate: the mapping should not depend on
 * that staying true.
 *
 * The check is on strings alone, deliberately. `decaffeinated: false` is an
 * answer and must survive, and an elevation of zero reaches here as the string
 * `"0"`, which is not blank.
 *
 * The key is a `keyof HandoffBean` rather than any string because the result
 * is spread, and a spread gets no excess-property check: a mistyped key used
 * to compile and silently drop the field, which is exactly the mismatch this
 * module exists to prevent.
 */
function whenSaid<K extends keyof HandoffBean>(
    key: K,
    value: HandoffBean[K] | undefined
): Partial<Pick<HandoffBean, K>> {
    if (value === undefined) return {};
    if (typeof value === "string" && value.trim() === "") return {};
    return {[key]: value} as Partial<Pick<HandoffBean, K>>;
}

/** The first of these that says anything, if any of them do. */
function firstSaid(
    ...values: (string | undefined)[]
): string | undefined {
    return values.find(
        value => value !== undefined && value.trim() !== ""
    );
}

export function handoffBean(coffee: PodCoffee): HandoffBean {
    return {
        // This one required field is the caller's contract: a `PodCoffee`
        // cannot exist without a name, so a blank name is not ours to hide.
        name: coffee.name,
        ...whenSaid("roaster", coffee.roaster),
        ...whenSaid("roastingDate", coffee.roastingDate),
        ...whenSaid("origin", firstSaid(coffee.origin, coffee.country)),
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
