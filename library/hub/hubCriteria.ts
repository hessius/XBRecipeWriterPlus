/**
 * The catalogue's own filter vocabularies.
 *
 * Filtering goes through the server's ids rather than through the text on a
 * row, and that is deliberate: the text is dirty. `Brazil Anaerobic Honey` is
 * filed under origin Colombia, and its description is about a third lot again.
 * An id filter still returns it for Colombia, which is the honest answer to
 * "what does the catalogue think this is". Free-text search alone would miss
 * every row whose own text is wrong.
 *
 * Held for the session rather than persisted. 28 origins, 49 varietals and 93
 * flavours are not worth a migration, and they are wanted only while somebody
 * is actually browsing.
 */
import {fetchHubCriteria, type HubCriteria} from "./hubApi";

let held: HubCriteria | null = null;
let inFlight: Promise<HubCriteria> | null = null;

/**
 * The vocabularies, fetched at most once.
 *
 * The in-flight promise is shared so that a screen and a chip mounting
 * together make one request rather than two, and it is cleared on failure so a
 * user who was in a tunnel can try again. A cached rejection would cost the
 * chips for the rest of the session.
 */
export function loadHubCriteria(signal?: AbortSignal): Promise<HubCriteria> {
    if (held !== null) return Promise.resolve(held);
    if (inFlight !== null) return inFlight;

    inFlight = fetchHubCriteria(signal)
        .then((criteria) => {
            held = criteria;
            inFlight = null;
            return criteria;
        })
        .catch((error: unknown) => {
            inFlight = null;
            throw error;
        });

    return inFlight;
}

/** The vocabularies if they are already here, for a caller that cannot wait. */
export function heldHubCriteria(): HubCriteria | null {
    return held;
}

/** Tests only. Production has one session and never needs to forget. */
export function __resetHubCriteria(): void {
    held = null;
    inFlight = null;
}

/**
 * What to call a roast, or nothing.
 *
 * The vocabulary's `value` is a string and a row's `roast` is an int, so the
 * comparison has to go through `String`. A roast this list does not describe
 * gets no label rather than a nearest guess: `podCoffee.ts` already applies
 * that rule to roast, and an invented value is worse than no value.
 */
export function roastLabel(roast: number | null, criteria: HubCriteria | null): string | null {
    if (roast === null || criteria === null) return null;
    return criteria.roastList.find((item) => item.value === String(roast))?.name ?? null;
}

/** The plain names of a vocabulary, for `splitFacet`'s space rule. */
export function vocabularyNames(items: readonly {name: string}[] | undefined): string[] {
    return (items ?? []).map((item) => item.name);
}
