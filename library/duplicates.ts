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
