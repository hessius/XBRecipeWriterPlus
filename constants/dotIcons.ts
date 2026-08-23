/**
 * The app's icons, as dot-matrix bitmaps.
 *
 * These are hand-authored, not generated. Signed-distance rasterisation was
 * tried first and produces blobs at this resolution: at 9x9 a stroke is one dot
 * wide, so anything that is not axis-aligned or a pure diagonal aliases into
 * noise. Only two shape classes survive, and every icon here is one of them.
 *
 * 9x9 is the working size. A finer grid holds more shape in the abstract, but at
 * the 20px header size each dot falls under 2px and the icon greys into a smudge.
 *
 * Settings is two faders rather than a gear on purpose. A gear is radially
 * symmetric with fine teeth, which is the single worst shape for this grid; four
 * candidates were drawn and compared at 16/20/26/44px before the metaphor was
 * abandoned. The meaning is "settings", not "gear".
 *
 * Adding an icon means drawing one. Keep the set small.
 */

/** Both dimensions of every bitmap. */
export const DOT_ICON_GRID = 9;

/** A lit dot. Any other character is unlit; `.` is the convention used here. */
const LIT = "#";

export const DOT_ICONS = {
    /** Three concentric rings: signal radiating outward, which is what a scan does. */
    scan: [
        "#########",
        "#.......#",
        "#.#####.#",
        "#.#...#.#",
        "#.#.#.#.#",
        "#.#...#.#",
        "#.#####.#",
        "#.......#",
        "#########"
    ],
    /** An arrow into a tray. */
    import: [
        ".........",
        "....#....",
        "....#....",
        "....#....",
        "..#.#.#..",
        "...###...",
        "....#....",
        ".#######.",
        "........."
    ],
    /** Two faders. See the note above on why this is not a gear. */
    settings: [
        ".........",
        "...#.....",
        "#########",
        "...#.....",
        ".........",
        "......#..",
        "#########",
        "......#..",
        "........."
    ],
    /** A pencil on a baseline. The bare diagonal read as a stroke, not a tool. */
    edit: [
        ".......##",
        "......##.",
        ".....##..",
        "....##...",
        "...##....",
        "..##.....",
        ".##......",
        ".........",
        "#########"
    ],
    /**
     * A lidded bin with three ribs.
     *
     * Not an X, which was the first instinct and the wrong one: `error` is
     * already an X, and the two would have appeared within a second of each
     * other — an X to delete, then an X if the delete failed.
     */
    delete: [
        "...###...",
        ".#######.",
        ".#.....#.",
        ".#.#.#.#.",
        ".#.#.#.#.",
        ".#.#.#.#.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /**
     * Two offset squares, the back one occluded by the front.
     *
     * A plus was considered and rejected: on its own a plus reads as "new", and
     * duplicating a recipe is not the same offer as writing one from scratch.
     */
    duplicate: [
        "...######",
        "...#....#",
        "...#....#",
        "######..#",
        "#....#..#",
        "#....####",
        "#....#...",
        "#....#...",
        "######..."
    ],
    success: [
        ".........",
        ".........",
        ".......#.",
        "......#..",
        ".#...#...",
        "..#.#....",
        "...#.....",
        ".........",
        "........."
    ],
    error: [
        ".........",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "........."
    ],
    info: [
        ".........",
        "....#....",
        ".........",
        "...##....",
        "....#....",
        "....#....",
        "...###...",
        ".........",
        "........."
    ]
} as const satisfies Record<string, readonly string[]>;

export type DotIconName = keyof typeof DOT_ICONS;

/** One lit dot's position on the grid. */
export type DotCell = {x: number; y: number};

/**
 * The lit dots of a bitmap, in reading order.
 *
 * Kept out of the component so the sequenced entry animation can index into a
 * stable order, and so the bitmaps can be checked without a renderer.
 */
export function litCells(rows: readonly string[]): DotCell[] {
    const cells: DotCell[] = [];
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            if (rows[y][x] === LIT) {
                cells.push({x, y});
            }
        }
    }
    return cells;
}
