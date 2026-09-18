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
    /** An arrow out of a tray: the inverse of `import`, which is an arrow into one. */
    share: [
        ".........",
        "....#....",
        "...###...",
        "..#.#.#..",
        "....#....",
        "....#....",
        "....#....",
        ".#######.",
        "........."
    ],
    /**
     * A play triangle: run this recipe.
     *
     * Its hypotenuses are pure 45-degree diagonals, the one non-axis-aligned
     * stroke this grid renders cleanly. That fixes the proportions — a 45-degree
     * point over nine rows is five columns wide — so it reads narrower than a
     * typographic play mark. Widening it means shallower slopes, which alias
     * into the noise the note above describes.
     */
    brew: [
        "..#......",
        "..##.....",
        "..###....",
        "..####...",
        "..#####..",
        "..####...",
        "..###....",
        "..##.....",
        "..#......"
    ],
    /**
     * An arrow coming down into a card: put this recipe on it.
     *
     * Deliberately not `scan`, which already means READ CARD on the same screen.
     * The arrow is what separates them: `scan` radiates outward from nothing,
     * this one points inward at a card that is drawn.
     */
    write: [
        "....#....",
        "....#....",
        "..#####..",
        "...###...",
        "....#....",
        "#########",
        "#.......#",
        "#.......#",
        "#########"
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
     * That reading is now load-bearing rather than hypothetical — the home
     * screen's NEW tile is a bare plus, and it means exactly that.
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
    /** A lowercase "i": the informational toast, and nothing else. */
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
    ],
    /**
     * The machine link, at three amounts of presence.
     *
     * One shape at three sizes rather than three symbols, so the three states
     * rank against each other before any colour is read: strip the colour and
     * a filled diamond, a hollow one and four dots still say more, less and
     * least. That is what lets the dot desaturate on collapse without losing
     * the only thing it was saying.
     *
     * Diamonds because of this file's own constraint. Only axis-aligned runs
     * and pure diagonals survive at 9x9, and a diamond is the one closed shape
     * that is entirely diagonal, so it is unmistakably not a square and still
     * lands cleanly on every dot.
     */
    "link-on": [
        "....#....",
        "...###...",
        "..#####..",
        ".#######.",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#...."
    ],
    "link-wait": [
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "#.......#",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#...."
    ],
    /** Four lit cells: the same diamond at its smallest drawable size. */
    "link-off": [
        ".........",
        ".........",
        ".........",
        ".........",
        "....#....",
        "...#.#...",
        "....#....",
        ".........",
        "........."
    ],
    /**
     * A blocky question mark: the help marker.
     *
     * The markers used the "i" above, which is four separate one-dot features
     * and greyed into a smudge at the 12-13px a marker is actually drawn at --
     * though the larger part of that was the dot weight, see `DotIcon`.
     * The hook here is two axis-aligned runs and one diagonal step, so there is
     * no feature narrower than the stroke; the counter is what makes it
     * readable rather than the stem.
     */
    help: [
        "..#####..",
        "..#...#..",
        "......#..",
        "....###..",
        "....#....",
        "....#....",
        ".........",
        "....#....",
        "........."
    ],
    /**
     * Two backward chevrons: the rewind mark.
     *
     * A curved arrow was drawn first and thrown away. It is the shape class the
     * note at the top of this file warns about — a one-dot stroke that is
     * neither axis-aligned nor a pure diagonal aliases into noise. Chevrons are
     * nothing but diagonals, so every dot lands on the grid.
     */
    revert: [
        ".........",
        "....#...#",
        "...#...#.",
        "..#...#..",
        ".#...#...",
        "..#...#..",
        "...#...#.",
        "....#...#",
        "........."
    ],
    /**
     * A downward caret.
     *
     * Points at the sheet that will rise, rather than at a menu that will drop.
     * Also used, rotated, as the disclosure mark on a stage tile.
     */
    more: [
        ".........",
        ".........",
        "#.......#",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#....",
        ".........",
        "........."
    ],
    /**
     * Three dots in a row: the overflow mark.
     *
     * Replaces the downward caret on the editor header. The caret pointed at
     * the sheet that would rise, which was true but read as "collapse this"
     * next to a title; three dots say "there is more here" and nothing else.
     * Two dots wide and two tall, because a one-dot block greys out at 16px.
     */
    overflow: [
        ".........",
        ".........",
        ".........",
        ".##.##.##",
        ".##.##.##",
        ".........",
        ".........",
        ".........",
        "........."
    ],
    /**
     * A left chevron: back.
     *
     * Two dots thick rather than one. Pure diagonals, so every dot lands on the
     * grid, but a single-dot stroke at header size is a hairline — and this is
     * the one control on the screen that must never be missed.
     */
    back: [
        ".........",
        ".....##..",
        "....##...",
        "...##....",
        "..##.....",
        "...##....",
        "....##...",
        ".....##..",
        "........."
    ],
    /** A right chevron: forward or open detail. */
    "chevron-right": [
        ".........",
        "..##.....",
        "...##....",
        "....##...",
        ".....##..",
        "....##...",
        "...##....",
        "..##.....",
        "........."
    ],
    /**
     * Dismisses the brew modal downwards.
     *
     * `chevron-right` turned a quarter turn, dot for dot, so the two read as
     * the same mark pointing two ways. Drawn by rotation rather than by hand
     * because a wider, shallower chevron sits beside `back` in the same nav
     * row and looked like a different icon set at the same point size.
     */
    "chevron-down": [
        ".........",
        ".........",
        ".#.....#.",
        ".##...##.",
        "..##.##..",
        "...###...",
        "....#....",
        ".........",
        "........."
    ],
    /** An X mark: close or dismiss. */
    close: [
        ".........",
        ".##...##.",
        "..##.##..",
        "...###...",
        "....#....",
        "...###...",
        "..##.##..",
        ".##...##.",
        "........."
    ],
    /** A single axis-aligned run. Steps a value down. */
    minus: [
        ".........",
        ".........",
        ".........",
        ".........",
        ".#######.",
        ".........",
        ".........",
        ".........",
        "........."
    ],
    /**
     * Steps a value up in a stepper, and stands alone for "new" on the home
     * screen's NEW tile and its collapsed-header glyph. Those are the only two
     * readings it carries; see `duplicate` for the offer it must not stand for.
     *
     * Deliberately square: 7 wide by 7 tall, both arms centred on row and
     * column 4. It was 7 by 5, which is invisible at stepper size but reads as
     * a squashed plus at tile size, where it is the largest glyph on the home
     * screen.
     */
    plus: [
        ".........",
        "....#....",
        "....#....",
        "....#....",
        ".#######.",
        "....#....",
        "....#....",
        "....#....",
        "........."
    ],
    /**
     * A five-pointed star, filled: a recipe the user has picked out.
     *
     * The riskiest shape in this set, for the reason the file header gives
     * about the gear: a star is close to radially symmetric and its points are
     * one dot wide. It survives where the gear did not only because it is drawn
     * solid, so the silhouette carries the meaning and no interior detail has
     * to.
     *
     * It was briefly replaced by a heart on the theory that it was being read
     * as a close button. It was not: the X people were seeing is the "will not
     * write" badge, which is `error`, sitting on the other side of the same
     * marker. Worth recording, because the star does share its bottom rows with
     * `close` and the coincidence is convincing until you look at a real card.
     */
    favourite: [
        "....#....",
        "...###...",
        "...###...",
        "#########",
        ".#######.",
        "..#####..",
        "..#####..",
        ".##...##.",
        ".#.....#."
    ],
    /**
     * A circular arrow: ask again for a fresh reading.
     *
     * Three-quarter arc of dots, open at the bottom-right, with a small
     * arrowhead pointing clockwise. Axis-aligned runs and pure diagonals only,
     * so every dot lands on the grid.
     */
    refresh: [
        "...####..",
        "..#....#.",
        ".#......#",
        ".#......#",
        ".#.......",
        "..#......",
        "...##....",
        "......##.",
        "....####."
    ],
    /**
     * A magnifying glass: search the library.
     *
     * A five-dot ring with a handle struck off its lower-right corner on a pure
     * 45-degree diagonal, the one non-axis-aligned stroke this grid renders
     * cleanly. Drawn rather than borrowed from a font because the rail's search
     * chip is icon-only, so this glyph is the whole of what the control says.
     */
    search: [
        "..###....",
        ".#...#...",
        ".#...#...",
        ".#...#...",
        "..###....",
        ".....#...",
        "......#..",
        ".......#.",
        "........."
    ],
    /**
     * Two arrows, one up and one down: reorder the library.
     *
     * The house glyph for sort, kept axis-aligned save for the two arrowheads so
     * every dot lands on the grid. The pair reads as "this can go either way",
     * which is exactly the sort chip's job before a direction is chosen.
     */
    sort: [
        "..#...#..",
        ".###..#..",
        "..#...#..",
        "..#...#..",
        "..#...#..",
        "..#...#..",
        "..#...#..",
        "..#..###.",
        "..#...#.."
    ],
    /**
     * Three ruled lines with a marker: the library as a list of rows.
     *
     * Pure horizontal strokes on rows 1, 4 and 7, the one stroke class this grid
     * renders without aliasing, and the separated leading dot is what keeps it
     * from reading as a hamburger menu. It is half of a segmented pair, so it
     * only has to be told apart from `shelves` beside it.
     */
    list: [
        ".........",
        "#..#####.",
        ".........",
        ".........",
        "#..#####.",
        ".........",
        ".........",
        "#..#####.",
        "........."
    ],
    /**
     * Four filled tiles: the library as a grid of shelves.
     *
     * Solid blocks rather than outlines, because at 9x9 an outlined tile is a
     * one-dot frame around a two-dot hole and greys into a smudge at rail size.
     * The gutter is one dot, the smallest gap that still reads as four things
     * rather than one.
     */
    shelves: [
        "####.####",
        "####.####",
        "####.####",
        "####.####",
        ".........",
        "####.####",
        "####.####",
        "####.####",
        "####.####"
    ],
    /**
     * A funnel: narrow the library to a shelf.
     *
     * A triangle whose edges are pure 45-degree diagonals down to a one-dot
     * stem, the two stroke classes this grid renders cleanly. Reads as a funnel
     * rather than the `sort` arrows so the rail's filter button is never mistaken
     * for its neighbour, and drawn here because the button is icon-only when no
     * filter is applied and this glyph is the whole of what it says.
     */
    filter: [
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        "....#....",
        "....#....",
        "....#....",
        "........."
    ],
    /**
     * The shelf marks, one per auto shelf.
     *
     * Fifteen glyphs is a lot to add to a set whose own rule is "keep it small",
     * and the rule still holds: these are one closed set, drawn once, for one
     * job. The auto shelves ship with the app and never change, so every glyph
     * is authored at design time and no user ever picks one -- which is exactly
     * why the art can be a drawing rather than something derived. A manual
     * shelf, being open ended, takes the derived mark instead.
     *
     * Same two stroke classes as everything above: axis-aligned runs and pure
     * diagonals. `shelfStrong` and `shelfMild` are deliberately the same frame
     * filled and emptied, because that is what the two shelves are -- the same
     * measure, more coffee or more water. `shelfQuickBrew` and `shelfSlowBrew`
     * borrow the trick for the other pair.
     */
    shelfTea: [
        ".........",
        "..#.#.#..",
        "..#.#.#..",
        ".........",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /** A pod: a capsule tapering to its outlet. */
    shelfPods: [
        ".........",
        ".#######.",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        "..#...#..",
        "..#...#..",
        "...###...",
        "........."
    ],
    /** A cup with the brew coming over its rim. */
    shelfOverflowOff: [
        ".........",
        ".#.....#.",
        ".##...##.",
        "...###...",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /** A cone dripper on its stand: a brewer that is not the machine. */
    shelfOtherBrewer: [
        ".........",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        "....#....",
        "...###...",
        "........."
    ],
    /** One stream, one cup. */
    shelfSinglePour: [
        "....#....",
        "....#....",
        "....#....",
        "....#....",
        ".........",
        ".#######.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /** A staircase of four: the shape a many-stage recipe draws. */
    shelfManyStages: [
        ".........",
        "......###",
        "......#..",
        "....###..",
        "....#....",
        "..###....",
        "..#......",
        "###......",
        "........."
    ],
    /** A hopper with the way out barred. */
    shelfGrinderOff: [
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        ".........",
        ".#######.",
        ".#######.",
        "........."
    ],
    /** The X of xBloom, which is two pure diagonals and nothing else. */
    shelfXbloom: [
        "#.......#",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "#.......#"
    ],
    /** The measure, full. */
    shelfStrong: [
        ".........",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        "........."
    ],
    /** The same measure, mostly water. */
    shelfMild: [
        ".........",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        ".#.....#.",
        ".#.....#.",
        ".#.....#.",
        ".#######.",
        "........."
    ],
    /** Steam off a plate. */
    shelfHot: [
        "..#.#.#..",
        "..#.#.#..",
        "..#.#.#..",
        "..#.#.#..",
        "..#.#.#..",
        ".........",
        "#########",
        "#########",
        "........."
    ],
    /**
     * A house. The author shelves are every recipe that arrived from somebody;
     * this is the shelf for the ones that did not, so it is drawn as home
     * rather than as a person.
     */
    shelfMine: [
        "....#....",
        "...###...",
        "..#####..",
        ".#######.",
        "#########",
        ".#.....#.",
        ".#.###.#.",
        ".#.###.#.",
        "........."
    ],
    /**
     * An hourglass run through, and the same hourglass still full.
     *
     * The strong/mild pair's trick, applied to duration: one frame, the sand
     * at one end or the other. They share a silhouette with `shelfXbloom`,
     * which is the bare X with neither the bars nor the fill.
     */
    shelfQuickBrew: [
        "#########",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#....",
        "...###...",
        "..#####..",
        ".#######.",
        "#########"
    ],
    shelfSlowBrew: [
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "#########"
    ],
    /** A boxed plus: something newly put on the shelf. */
    shelfRecent: [
        "#########",
        "#.......#",
        "#...#...#",
        "#...#...#",
        "#.#####.#",
        "#...#...#",
        "#...#...#",
        "#.......#",
        "#########"
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
