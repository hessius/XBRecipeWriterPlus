import Recipe from "./Recipe";

/**
 * How much of a recipe counts as its identity.
 *
 * `"card"` is the card bytes: two recipes match when they would write the same
 * card. `"brew"` adds the bypass, which no card can carry.
 *
 * Both are needed, and neither will do for both jobs. A card read can only ever
 * produce a recipe with no bypass, so matching strictly there would deposit a
 * stripped duplicate every time the user scans a recipe they already hold. An
 * import, by contrast, carries the bypass from xBloom, and matching loosely
 * there silently discards it: the user asks for the recipe with the dilution
 * and is handed the twin without it, with nothing to say a difference existed.
 */
export type Identity = "card" | "brew";

/**
 * The fingerprint of a recipe, or `null` if its bytes cannot be built.
 *
 * A recipe that throws here is malformed. It is treated as having no identity
 * rather than as matching everything or nothing in particular, so a broken
 * import lands in the library to be inspected instead of disappearing into a
 * de-duplication branch.
 */
function safeFingerprint(recipe: Recipe, identity: Identity = "card"): string | null {
    let card: string;
    try {
        card = recipe.fingerprint();
    } catch {
        return null;
    }
    if (identity === "card") {
        return card;
    }
    // A bypass that is switched off is not dispensed, so the volume and
    // temperature still sitting behind the switch are not a difference in the
    // brew -- only in what the recipe would remember if it were switched on.
    const bypass = recipe.bypassEnabled
        ? `${recipe.bypassVolume}@${recipe.bypassTemp}`
        : "off";
    return `${card}|${bypass}`;
}

/**
 * The stored recipe that would write the same card as `candidate`, if any.
 *
 * A recipe with the candidate's own uuid is skipped: re-saving a recipe over
 * itself is an update, not a duplicate.
 */
export function findDuplicate(stored: Recipe[], candidate: Recipe,
                              identity: Identity = "card"): Recipe | null {
    const target = safeFingerprint(candidate, identity);
    if (target === null) {
        return null;
    }

    for (const existing of stored) {
        if (existing.uuid === candidate.uuid) {
            continue;
        }
        if (safeFingerprint(existing, identity) === target) {
            return existing;
        }
    }
    return null;
}

/**
 * The name for a copy of `name`, given the names already in the library.
 *
 * Scoped to copies of this one name rather than the whole library: recipe names
 * are no longer unique, so this is a nicety that keeps two copies of the same
 * recipe apart, not a constraint.
 */
export function copyName(name: string, existing: string[]): string {
    if (name.trim().length === 0) {
        return name;
    }

    const base = name.replace(/ \(Copy\)(?:\(\d+\))?$/, "");
    const first = `${base} (Copy)`;
    if (!existing.includes(first)) {
        return first;
    }

    let count = 2;
    while (existing.includes(`${base} (Copy)(${count})`)) {
        count++;
    }
    return `${base} (Copy)(${count})`;
}

/**
 * Which recipe to open after a card read or an import.
 *
 * When the library already holds one that would write the same card, that one
 * is opened instead of the new one. This is the de-duplication: no second copy
 * is ever created, and opening the existing recipe *is* the reveal.
 *
 * Only for the automatic paths. Duplicating a recipe is an explicit request and
 * must always produce a copy.
 *
 * The default identity is the card, which is what a card read means. An import
 * passes `"brew"`: see `Identity` for why one answer cannot serve both.
 */
export function resolveOnOpen(
    stored: Recipe[],
    candidate: Recipe,
    identity: Identity = "card"
): {recipe: Recipe; isExisting: boolean} {
    const existing = findDuplicate(stored, candidate, identity);
    return existing
        ? {recipe: existing, isExisting: true}
        : {recipe: candidate, isExisting: false};
}
