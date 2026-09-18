import {formatBrewAgo} from "@/library/brew/brewFormat";
import type {RecipeEvidence} from "@/library/libraryQuery";

/**
 * `4.3 · 12 · 3D`, or nothing.
 *
 * One average, one count, one recency, in the order a glance wants them: how
 * good, how often, how lately. The average is dropped rather than printed as
 * 0.0 for a recipe brewed and never judged, because unrated is not nought and
 * a 0.0 would be a verdict nobody gave.
 *
 * Shared by the list card and the shelf tile rather than written twice. The two
 * views draw the same recipe and a user moving between them is entitled to read
 * the same figures; two copies of this would agree until the first time one of
 * them was edited.
 */
export function evidenceLine(evidence?: RecipeEvidence): string | null {
    if (evidence === undefined || evidence.brews <= 0) return null;
    return [
        evidence.avgRating > 0 ? evidence.avgRating.toFixed(1) : undefined,
        String(evidence.brews),
        evidence.lastBrewedAt > 0 ? formatBrewAgo(evidence.lastBrewedAt) : undefined
    ].filter((part) => part !== undefined).join(" · ");
}

/**
 * The same three figures, for someone who cannot see them.
 *
 * Recency is left out on purpose: `3D` is a glance's shorthand and reads as a
 * unit of nothing when it is spoken.
 */
export function spokenEvidence(evidence?: RecipeEvidence): string[] {
    if (evidence === undefined || evidence.brews <= 0) return [];
    return [
        ...(evidence.avgRating > 0 ? [`rated ${evidence.avgRating.toFixed(1)}`] : []),
        evidence.brews === 1 ? "brewed once" : `brewed ${evidence.brews} times`
    ];
}

/**
 * `Recipe` initialises `ratio` and `grindSize` to -1 to mean "not set yet".
 *
 * A sentinel passed straight through would tell the user the ratio is 0, which
 * is not a possible value and is indistinguishable from a real reading.
 */
export function isSet(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}
