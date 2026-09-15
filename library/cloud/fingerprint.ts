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
 * This is not a security hash — nobody is trying to forge one. But it is not
 * a throwaway either. Equal means "untouched since import", and untouched is
 * the state the sync is allowed to overwrite without asking, so a collision
 * costs a user the edits they made. That asymmetry is why the digest is 64
 * bits rather than 32 and why the input is encoded unambiguously below: both
 * cost nothing, and the failure they prevent is silent.
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

    // Encoded, not joined. A separator stops 1|23 colliding with 12|3, but
    // `name` and `xbloomName` are whatever the user typed, so a name that
    // contained the separator could reproduce another recipe's parts string
    // exactly -- an ambiguity in the encoding rather than a collision in the
    // hash, and not one the digest width can help with. JSON quotes and
    // escapes every string, so distinct parts always encode distinctly.
    return hash(JSON.stringify(parts));
}

/** FNV-1a's 64-bit offset basis and prime. */
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * FNV-1a, 64 bits, rendered as hex.
 *
 * Chosen because it is ten lines and needs no dependency. 64 rather than 32
 * because the birthday bound on 32 bits is around 77,000 values, which is not
 * a comfortable distance from a real library, and the price of being wrong is
 * a user's edits. BigInt is slower than `Math.imul`, but this runs once per
 * recipe at import, not per frame.
 */
function hash(input: string): string {
    let h = OFFSET;
    for (let i = 0; i < input.length; i++) {
        h = (h ^ BigInt(input.charCodeAt(i))) * PRIME & MASK;
    }
    return h.toString(16).padStart(16, "0");
}
