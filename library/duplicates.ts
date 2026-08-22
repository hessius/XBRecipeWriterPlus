import Recipe from "./Recipe";

/**
 * The fingerprint of a recipe, or `null` if its bytes cannot be built.
 *
 * A recipe that throws here is malformed. It is treated as having no identity
 * rather than as matching everything or nothing in particular, so a broken
 * import lands in the library to be inspected instead of disappearing into a
 * de-duplication branch.
 */
function safeFingerprint(recipe: Recipe): string | null {
    try {
        return recipe.fingerprint();
    } catch {
        return null;
    }
}

/**
 * The stored recipe that would write the same card as `candidate`, if any.
 *
 * A recipe with the candidate's own uuid is skipped: re-saving a recipe over
 * itself is an update, not a duplicate.
 */
export function findDuplicate(stored: Recipe[], candidate: Recipe): Recipe | null {
    const target = safeFingerprint(candidate);
    if (target === null) {
        return null;
    }

    for (const existing of stored) {
        if (existing.uuid === candidate.uuid) {
            continue;
        }
        if (safeFingerprint(existing) === target) {
            return existing;
        }
    }
    return null;
}
