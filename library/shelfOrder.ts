import {canonicalShelfId, parseHidden, serialiseHidden} from "@/library/hiddenShelves";

/**
 * The order a user has put their own shelves in.
 *
 * There is no `shelves` table and no `position` column, and #111 parked
 * ordering because of it. What settled the question is that the answer was
 * already stored: `myShelves` is an ordered JSON list of canonical shelf ids,
 * written when a shelf is made and carried in backup, so a user's order is that
 * list's order and needs no new storage at all. This module is the arithmetic
 * on it; `hiddenShelves.ts` still owns the format.
 *
 * Only the shelves the user made are ordered here. The auto shelves keep
 * `STOCK_FILTER_ORDER`, which is the app's own vocabulary rather than anybody's
 * arrangement, and FROM TAGS is a nursery the app fills.
 */

/**
 * The stored list with a subset of its ids rearranged.
 *
 * The subset matters. The stored list can hold an id whose shelf is not on
 * screen -- `hiddenShelves.ts` carries unknown ids rather than dropping them,
 * so an answer survives a shelf's absence -- and the grid can only ever hand
 * back the order of what it drew. So the positions held by the named ids are
 * treated as slots and refilled in the given order, and everything else stays
 * exactly where it was. A ghost between two shelves does not move when they
 * swap, and does not come back to life either.
 *
 * Ids not already stored are ignored. `order` describes an arrangement of the
 * user's shelves; a shelf that is not one of them has no slot to be put in, and
 * inventing one would quietly promote it.
 */
export function orderShelves(stored: string, order: readonly string[]): string {
    const ids = parseHidden(stored);
    const wanted = [...new Set(order.map(canonicalShelfId))].filter((id) => ids.includes(id));
    if (wanted.length < 2) return serialiseHidden(ids);

    const slots = ids.flatMap((id, index) => (wanted.includes(id) ? [index] : []));
    const next = [...ids];
    slots.forEach((slot, index) => {
        next[slot] = wanted[index];
    });
    return serialiseHidden(next);
}

/**
 * The stored list with one shelf moved one place along the given arrangement.
 *
 * Takes the arrangement it is moving through, rather than reading the stored
 * list directly, for the same reason `orderShelves` does: the user is moving a
 * tile past the tile they can see, which may not be the next id in storage.
 * Returns the list unchanged at either end, so a caller that offers the action
 * anyway cannot rotate a shelf from the top of the grid to the bottom.
 */
export function moveShelf(
    stored: string, order: readonly string[], id: string, delta: -1 | 1
): string {
    const ids = order.map(canonicalShelfId);
    const from = ids.indexOf(canonicalShelfId(id));
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return serialiseHidden(parseHidden(stored));

    const next = [...ids];
    next[from] = ids[to];
    next[to] = ids[from];
    return orderShelves(stored, next);
}
