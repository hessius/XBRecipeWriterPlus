import type Recipe from "@/library/Recipe";

/**
 * A stable hash of what a recipe *brews like*.
 *
 * Used for exactly one judgement: has the user edited this imported recipe
 * since it arrived? So it covers the fields a user edits and nothing else.
 *
 * What it deliberately excludes matters more than what it includes:
 *
 * - `uuid`, `key` — identity, not content. Two copies of one recipe are one
 *   recipe.
 * - `accentIndex` — we choose the accent ourselves at import, so covering it
 *   would mark every recipe edited the moment it arrived.
 * - `backup`, `offline_backup`, `uid` — raw card bytes, which change when a
 *   card is written. Brewing a recipe is not editing it.
 * - `cloudId`, `cloudFingerprint` — stamping the fingerprint must not change
 *   the fingerprint.
 * - `createdAt`, `tags` — bookkeeping.
 *
 * This is not a security hash and does not need to be one: the only thing an
 * unlikely collision costs is one recipe offered as "unchanged" when it was
 * edited, and the user is choosing from a list either way.
 */
export function fingerprint(recipe: Recipe): string {
    const parts: (string | number)[] = [
        recipe.name ?? "",
        recipe.xbloomName ?? "",
        recipe.xid ?? "",
        recipe.dosage,
        recipe.ratio,
        recipe.grindSize,
        recipe.grindRPM,
        recipe.grinder ? 1 : 0,
        recipe.cupType,
        recipe.defaultCups,
        recipe.bypassEnabled ? 1 : 0,
        recipe.bypassVolume,
        recipe.bypassTemp,
        recipe.pours.length,
    ];

    for (const pour of recipe.pours) {
        parts.push(
            pour.pourNumber,
            pour.volume,
            pour.temperature,
            pour.flowRate,
            pour.getAgitation(),
            pour.pourPattern,
            pour.pauseTime
        );
    }

    // The separator is what stops 1|23 from colliding with 12|3. It is not
    // decoration.
    return hash(parts.join("\u001f"));
}

/**
 * FNV-1a, 32 bits, rendered as hex.
 *
 * Chosen because it is eight lines and needs no dependency. See the note above
 * about why cryptographic strength is not a requirement here.
 */
function hash(input: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}
