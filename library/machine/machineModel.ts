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
 */
export const MACHINE_MODELS = ["studio", "original"] as const;

export type MachineModel = typeof MACHINE_MODELS[number];

/** xBloom's wire value for each model. */
export const ADAPTED_MODEL: Record<MachineModel, 1 | 2> = {
    studio:   1,
    original: 2
};

export function adaptedModelFor(model: MachineModel): 1 | 2 {
    return ADAPTED_MODEL[model];
}

export function isMachineModel(value: unknown): value is MachineModel {
    return typeof value === "string" &&
        (MACHINE_MODELS as readonly string[]).includes(value);
}

/**
 * The model a wire value names, falling back to the Studio.
 *
 * A fallback rather than a refusal because this reads values that came from
 * storage and from a third party, and the Studio is what every user was served
 * before the setting existed: guessing it wrongly restores the old behaviour,
 * where guessing Original wrongly would be a new fault for almost everybody.
 */
export function modelFromAdapted(value: number): MachineModel {
    return value === ADAPTED_MODEL.original ? "original" : "studio";
}
