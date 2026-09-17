import {useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {asStockFilters} from "@/library/libraryFilters";
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
 * The filters get the same treatment through `asStockFilters` before they reach
 * the query: an id the vocabulary no longer defines is dropped here, so
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
    // The filter rail's *user* intent only. The rail's actual open state is
    // derived below, never stored: syncing it from an effect is exactly the
    // `set-state-in-effect` the compiler forbids here.
    const [filterRailIntent, setFilterRailIntent] = useState<boolean | null>(null);

    const [sortRaw, setSort] = useSetting("librarySort", settings);
    const [directionRaw, setDirection] = useSetting("librarySortDirection", settings);
    const [favouritesFirst, setFavouritesFirst] =
        useSetting("libraryFavouritesFirst", settings);

    const sort = asSortAxis(sortRaw);
    const direction = asSortDirection(directionRaw);

    // Narrowed once, here, because both the query and the count must agree on
    // what "applied" means: a stale id that `asStockFilters` drops is not an
    // applied filter and must not swell the button's number.
    const activeFilters = asStockFilters(filters);
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

    function isFilterActive(id: string): boolean {
        return filters.includes(id);
    }

    function toggleFilterRail() {
        // Flip what is on screen, not the stored intent, so the first tap always
        // does the opposite of what the user can see -- including the first tap
        // after an auto-open, which must close rather than re-open.
        setFilterRailIntent(!filterRailOpen);
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
        setClearToken((current) => current + 1);
    }

    return {
        query,
        onSearchChange,
        toggleFilter,
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
        clearToken
    };
}

export default useLibraryQuery;
