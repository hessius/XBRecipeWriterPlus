/**
 * Where a dragged shelf tile would land.
 *
 * Pure arithmetic, deliberately kept out of the component. A gesture cannot be
 * exercised by the test renderer at all, so everything that could be wrong
 * about dragging a tile is moved in here where it can be, and what is left in
 * `ShelfGrid` is the wiring: read the finger, ask this module, animate.
 *
 * Marked `"worklet"` because the gesture handlers run on the UI thread and
 * would otherwise have to hop to JavaScript for every frame of a drag.
 */

export type ShelfDragPoint = {
    x: number;
    y: number;
};

export type ShelfDragGeometry = {
    columns: number;
    tileWidth: number;
    tileHeight: number;
    gapX: number;
    gapY: number;
};

function clamp(value: number, min: number, max: number): number {
    "worklet";
    return Math.min(max, Math.max(min, value));
}

/**
 * The slot under a point, as an index into the arrangement.
 *
 * Clamped at both ends, so a finger dragged off the top of the grid holds the
 * first slot rather than reporting nothing. The gap between two tiles is split
 * at its middle rather than belonging to either, which is what makes a tile
 * swap the moment the finger passes halfway.
 *
 * The padding square on an odd final row is not a slot. It clamps to the last
 * shelf, so a tile released over the empty half of the bottom row goes to the
 * end of the arrangement instead of to a position that does not exist.
 */
export function shelfSlotAt(
    point: ShelfDragPoint,
    geometry: ShelfDragGeometry,
    count: number
): number {
    "worklet";
    if (count <= 0) return -1;

    const columns = Math.max(1, geometry.columns);
    const cellWidth = geometry.tileWidth + geometry.gapX;
    const cellHeight = geometry.tileHeight + geometry.gapY;
    const column = clamp(Math.floor((point.x + geometry.gapX / 2) / cellWidth), 0, columns - 1);
    const rows = Math.ceil(count / columns);
    const row = clamp(Math.floor((point.y + geometry.gapY / 2) / cellHeight), 0, rows - 1);

    return clamp(row * columns + column, 0, count - 1);
}

/**
 * The arrangement with one id lifted out and put back at a slot.
 *
 * A move, not a swap: the tiles between the two positions shuffle along, which
 * is what the grid animates while the finger is down. Returns a copy of the
 * order unchanged when there is nothing to do, so a caller can compare the
 * result without special-casing the no-op.
 */
export function moveShelfIdToSlot(
    order: readonly string[],
    id: string,
    slot: number
): string[] {
    const from = order.indexOf(id);
    if (from === -1 || slot < 0 || slot >= order.length || from === slot) {
        return [...order];
    }

    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(slot, 0, moved);
    return next;
}

/** The top left corner of a slot, which is where its tile is drawn. */
export function shelfSlotOrigin(slot: number, geometry: ShelfDragGeometry): ShelfDragPoint {
    "worklet";
    const columns = Math.max(1, geometry.columns);
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    return {
        x: column * (geometry.tileWidth + geometry.gapX),
        y: row * (geometry.tileHeight + geometry.gapY)
    };
}
