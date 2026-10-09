export const OVERFLOW_INTERVALS = [15, 30, 45] as const;

export type OverflowInterval = typeof OVERFLOW_INTERVALS[number];

/**
 * Per-recipe opt-in protection for the Other dripper. `retainedGrams` is the
 * most water, dispensed minus collected coffee, the user accepts the dripper
 * holding; it is always entered explicitly and never defaulted.
 */
export type OverflowProtection = {
    retainedGrams: number;
    checkSeconds: OverflowInterval;
};

export function isOverflowProtection(value: unknown): value is OverflowProtection {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const {retainedGrams, checkSeconds} = value as Record<string, unknown>;
    return typeof retainedGrams === "number"
        && Number.isSafeInteger(retainedGrams)
        && retainedGrams > 0
        && (OVERFLOW_INTERVALS as readonly unknown[]).includes(checkSeconds);
}

// CUP_TYPE.OTHER, spelled as its byte so this module need not import Recipe,
// which imports this one.
const OTHER_CUP_TYPE = 0x01;

/** The configuration in force: only the Other dripper uses it, but others keep what is stored. */
export function overflowFor(
    recipe: {cupType: number; overflowProtection?: OverflowProtection}
): OverflowProtection | undefined {
    return recipe.cupType === OTHER_CUP_TYPE ? recipe.overflowProtection : undefined;
}
