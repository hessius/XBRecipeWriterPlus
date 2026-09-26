import {useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {asLibraryFilters} from "@/library/libraryFilters";
import {asLibraryView, type LibraryView} from "@/library/libraryView";
import type {LibraryQuery} from "@/library/libraryQuery";
import {asSortAxis, asSortDirection, type SortAxis, type SortDirection}
    from "@/library/librarySort";
import type {Settings} from "@/library/Settings";

/**
 * The rail's question and the handles that change it.
 *
 * `query` is what `useRecipeLibrary` runs. The rest is what the rail draws
 * itself from: the sort axis and direction so the chip can name itself and the
 * sheet can mark its rows, the favourites-first modifier for its switch, and the
 * active filter set so a chip can read as on. The wiring task reads these; this
 * hook does not draw anything.
 */
export type LibraryController = {
    query: LibraryQuery;
    /** The settled search term reaches here already debounced, from `useRailSearch`. */
    onSearchChange: (term: string) => void;
    /** Turn a filter on if it is off, off if it is on. */
    toggleFilter: (id: string) => void;
    /**
     * Replace the whole applied set in one write.
     *
     * `toggleFilter` cannot express the bean sheet's rated switch, which
     * rewrites every bean id at once: a loop of toggles would pass through
     * states where half the ids are rated and re-query the library at each one.
     * The updater receives the current set so a caller can preserve the filters
     * it does not own, which every caller must.
     */
    applyFilters: (update: (current: readonly string[]) => string[]) => void;
    /** Whether a given filter is currently applied, so a chip can read as on. */
    isFilterActive: (id: string) => boolean;
    /** How many filters are applied, for the filter button's count and fill. */
    activeFilterCount: number;
    /**
     * Whether the filter rail is showing. Derived, never synced: the rail is
     * open when the user opened it or when any filter is applied, so an applied
     * narrowing is always on screen.
     */
    filterRailOpen: boolean;
    /** Flip the filter rail's user-open intent. */
    toggleFilterRail: () => void;
    sort: SortAxis;
    direction: SortDirection;
    favouritesFirst: boolean;
    /** Axis and direction together, because the two only mean anything as a pair. */
    onSortChange: (axis: SortAxis, direction: SortDirection) => void;
    onFavouritesFirstChange: (value: boolean) => void;
    /** Drop every transient narrowing and remount the rail's field. */
    clear: () => void;
    /** Changes only when clear() is taken, so an uncontrolled search field can reset by key. */
    clearToken: number;
    /**
     * Which of the two library views is showing.
     *
     * A preference rather than transient state, unlike the search term and the
     * filters beside it: a ten recipe library and a hundred and eighty recipe
     * library want different front doors, and which one a person is should
     * survive a relaunch rather than being asked again every launch.
     */
    view: LibraryView;
    onViewChange: (view: LibraryView) => void;
    /**
     * The shelf whose room is open, or `null` when the grid itself is showing.
     *
     * A shelf room is the shelf view in a third state, the way selection mode is
     * a third state and not a route: the screen still owns one header, one rail
     * and one list, and there is one place a future library change has to land.
     * This is the flag that tells it a room is open and which shelf is in it, so
     * it can draw the shelf's recipes as tiles under the shelf's name rather
     * than the grid of shelves.
     *
     * Held apart from `view` on purpose. `view` is a persisted preference -- the
     * front door a person likes -- and a room is a transient place inside the
     * shelf view, so it is local state that a relaunch forgets. The two are
     * paired only in what the screen draws: a room shows when the view is
     * `shelves` and this is set.
     */
    openShelfId: string | null;
    /**
     * Open a shelf into its own room, and stay in the shelf idiom.
     *
     * Reversed in phase 4b. This used to apply the shelf and switch to the list,
     * which device testing read as the app undoing the tap: you pressed a
     * square, the squares vanished, and a dimmed chip was the only sign anything
     * had happened. It now applies the shelf's filter *and* remembers which
     * shelf is open, leaving the view where it is, so the screen can draw the
     * shelf's contents as tiles of the same square under the shelf's name.
     *
     * One handle rather than the screen calling `toggleFilter` and setting the
     * id itself, because the two only mean anything together: an id set without
     * its filter is a room over the wrong recipes, and a filter set without its
     * id is the old reversed behaviour back again.
     */
    openShelf: (id: string) => void;
    /**
     * Close the open room, back to the grid.
     *
     * Clears the id and the filter it applied together, because a shelf is not a
     * chip: leaving a room must not leave its narrowing behind as an applied
     * filter, which is exactly the lens-borrowing the room was built to stop.
     */
    closeShelf: () => void;
};

/**
 * The rail's transient state and the three persisted settings, assembled into
 * the one query the library list is the answer to.
 *
 * Two kinds of state, kept apart on purpose. The search term and the active
 * filters are transient -- a fresh library each launch, because a filter you
 * set to find one recipe is not a preference you want to greet the app with
 * next time -- so they live in local state here. The sort axis, its direction
 * and favourites-first are preferences, so they live in `Settings` and reach a
 * backup; this hook only reads and writes them.
 *
 * The persistence boundary is where the narrowing readers earn their keep.
 * `Settings.get` widens `librarySort` back to a bare `string`, so a row this
 * build has no fragment for -- an axis renamed or removed since it was written
 * -- would otherwise index the sort table to nothing and take the query builder
 * down. `asSortAxis`/`asSortDirection` fold such a value back to name-ascending.
 * The filters get the same treatment through `asLibraryFilters` before they
 * reach the query: an id the vocabulary no longer defines is dropped here, so
 * `buildLibraryQuery`'s throw for an unresolved id stays reserved for a real
 * in-code disagreement between the ids and the resolver rather than firing on
 * stale state and crashing the library on every render.
 *
 * No `useMemo`: the React Compiler owns memoisation, and `query` is a plain
 * object literal it keeps stable across renders when its fields are unchanged,
 * which is what lets `useRecipeLibrary` skip re-reading SQLite on a render that
 * changed nothing.
 *
 * @param settings Injected by tests. Production call sites omit it.
 */
export function useLibraryQuery(settings?: Settings): LibraryController {
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<string[]>([]);
    const [clearToken, setClearToken] = useState(0);
    // Which shelf's room is open, or null for the grid. Transient state, not a
    // setting: a room is a place inside the shelf view, and a relaunch should
    // open the grid rather than drop the user back inside a shelf they left.
    const [openShelfId, setOpenShelfId] = useState<string | null>(null);
    // The filter rail's *user* intent only. The rail's actual open state is
    // derived below, never stored: syncing it from an effect is exactly the
    // `set-state-in-effect` the compiler forbids here.
    const [filterRailIntent, setFilterRailIntent] = useState<boolean | null>(null);

    const [sortRaw, setSort] = useSetting("librarySort", settings);
    const [directionRaw, setDirection] = useSetting("librarySortDirection", settings);
    const [favouritesFirst, setFavouritesFirst] =
        useSetting("libraryFavouritesFirst", settings);
    const [viewRaw, setView] = useSetting("libraryView", settings);

    const sort = asSortAxis(sortRaw);
    const direction = asSortDirection(directionRaw);
    const view = asLibraryView(viewRaw);

    // Narrowed once, here, because both the query and the count must agree on
    // what "applied" means: a stale id that `asLibraryFilters` drops is not an
    // applied filter and must not swell the button's number. It is
    // `asLibraryFilters` and not `asStockFilters` because a tag shelf is an
    // applied filter too, and the stock narrowing would drop every one of them.
    const activeFilters = asLibraryFilters(filters);
    const activeFilterCount = activeFilters.length;

    // Derived, not synced. "Applied means open" is a reading of the current
    // state, not an event to react to. The intent is deliberately three-valued:
    // `null` means the user has not said, and the rail follows the filters, so a
    // narrowing applied from anywhere puts its chips on screen rather than
    // hiding them behind a number. A tap settles it either way and wins from
    // then on, because a button whose tap does nothing is worse than a rail in
    // the wrong state -- and a user who just closed the rail on a filter they
    // applied a second ago does not need it shown back to them.
    //
    // Nothing outside this hook can apply a filter today, so `null` currently
    // resolves to closed at every launch. It is written this way for phase 4,
    // where a shelf selects filters without the rail being open.
    const filterRailOpen = filterRailIntent ?? activeFilterCount > 0;

    const query: LibraryQuery = {
        search,
        // Narrowed at the query boundary, never trusted raw: a stale id must not
        // reach `buildLibraryQuery`'s throw. The typed state cannot hold one
        // today, but `toggleFilter` takes a bare `string` (the rail hands it a
        // chip id), so this is the seam that keeps a bad id out of the SQL.
        filters: activeFilters,
        sort,
        direction,
        favouritesFirst
    };

    function onSearchChange(term: string) {
        setSearch(term);
    }

    function toggleFilter(id: string) {
        setFilters((current) =>
            current.includes(id) ? current.filter((f) => f !== id) : [...current, id]
        );
    }

    function applyFilters(update: (current: readonly string[]) => string[]) {
        setFilters((current) => update(current));
        // A filter applied away from a visible rail must still explain itself
        // on screen. Reset to derived intent so a non-empty result auto-opens.
        setFilterRailIntent(null);
    }

    function isFilterActive(id: string): boolean {
        return filters.includes(id);
    }

    function toggleFilterRail() {
        // Flip what is on screen, not the stored intent, so the first tap always
        // does the opposite of what the user can see -- including the first tap
        // after an auto-open, which must close rather than re-open.
        setFilterRailIntent(!filterRailOpen);
    }

    /**
     * Open a shelf into its own room.
     *
     * Replaces the applied filters rather than adding to them. A shelf is a
     * whole lens, not a chip: tapping one in the grid while another was applied
     * would otherwise intersect the two and open a room holding neither shelf's
     * contents, which is the one result the user did not ask for.
     *
     * The view is deliberately left where it is. The grid is drawn in the shelf
     * view, so a shelf is opened from the shelf view, and the room is the shelf
     * view still -- the same rail, the same idiom, a different thing on the
     * squares. What changes is `openShelfId`, which is how the screen tells the
     * grid and the room apart within the one view.
     */
    function openShelf(id: string) {
        setFilters([id]);
        setOpenShelfId(id);
    }

    /**
     * Close the open room, back to the grid.
     *
     * The id and the filter go together: a room is a room only while both hold,
     * so clearing one without the other would leave either a room over an empty
     * filter or a filter with no room naming it.
     */
    function closeShelf() {
        setOpenShelfId(null);
        setFilters([]);
    }

    function onViewChange(next: LibraryView) {
        // Switching to the list from inside a room leaves the room, and the
        // shelf does not follow as an applied chip: a shelf is a place you
        // opened, not a lens you carry into the list. Only a genuine room is
        // closed here -- a plain view toggle with no room open leaves any
        // filters the user set in the list untouched.
        if (next === "list" && openShelfId !== null) {
            closeShelf();
        }
        setView(next);
    }

    function onSortChange(axis: SortAxis, nextDirection: SortDirection) {
        // Both in one gesture: an axis and a direction that belonged to the
        // previous axis are never a valid pair to persist, so writing them apart
        // would leave a flicker of NEWEST under RATIO between the two writes.
        setSort(axis);
        setDirection(nextDirection);
    }

    function onFavouritesFirstChange(value: boolean) {
        setFavouritesFirst(value);
    }

    function clear() {
        setSearch("");
        setFilters([]);
        setFilterRailIntent(null);
        // A filter cleared by any route closes the room with it, so a room can
        // never be left hanging open over an empty filter.
        setOpenShelfId(null);
        setClearToken((current) => current + 1);
    }

    return {
        query,
        onSearchChange,
        toggleFilter,
        applyFilters,
        isFilterActive,
        activeFilterCount,
        filterRailOpen,
        toggleFilterRail,
        sort,
        direction,
        favouritesFirst,
        onSortChange,
        onFavouritesFirstChange,
        clear,
        clearToken,
        view,
        onViewChange,
        openShelf,
        closeShelf,
        openShelfId
    };
}

export default useLibraryQuery;
