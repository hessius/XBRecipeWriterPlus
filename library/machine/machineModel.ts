/**
 * Which xBloom this phone is driving.
 *
 * xBloom's endpoints partition on an `adaptedModel` discriminator, and the same
 * pod returns a different recipe under each: grind 55 on a Studio is grind 26
 * on an original xBloom for the same coffee. Only 1 and 2 return rows at all.
 *
 * The two grind scales do not convert. 918 paired recipes from the community
 * hub give a best linear fit of R^2 = 0.444, landing within two grind steps on
 * 20% of pairs, so nothing here or anywhere else may translate one into the
 * other. Where both are needed, both are fetched.
 *
 * Filed under `machine/` because it is about which machine this is, not about
 * talking to one: nothing here touches the radio, and its consumers are the
 * settings store and the xBloom HTTP clients.
 */
export const MACHINE_MODELS = ["studio", "original"] as const;

export type MachineModel = typeof MACHINE_MODELS[number];

/** xBloom's wire value for each model. */
export const ADAPTED_MODEL: Record<MachineModel, 1 | 2> = {
    studio:   1,
    original: 2
};

/**
 * xBloom's wire value, named so the request builders and the payload validator
 * can import it rather than each restating the pair.
 *
 * Derived from `ADAPTED_MODEL` rather than written out, so it cannot drift from
 * the mapping the way a hand-maintained union would.
 */
export type AdaptedModel = typeof ADAPTED_MODEL[MachineModel];

export function adaptedModelFor(model: MachineModel): AdaptedModel {
    return ADAPTED_MODEL[model];
}

export function isMachineModel(value: unknown): value is MachineModel {
    return typeof value === "string" &&
        (MACHINE_MODELS as readonly string[]).includes(value);
}
