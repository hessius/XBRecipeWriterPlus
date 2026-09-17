import {act, renderHook} from "@testing-library/react-native";

import {useLibraryQuery} from "@/hooks/useLibraryQuery";
import {resolveLibraryFilter, resolveStockFilter} from "@/library/libraryFilters";
import {buildLibraryQuery} from "@/library/libraryQuery";
import {Settings, type SettingsStorage} from "@/library/Settings";

/**
 * A settings store over a plain map, optionally pre-seeded with raw JSON so a
 * test can plant a value a hostile or stale row would hold -- a sort axis this
 * build has no fragment for -- and prove the hook folds it back rather than
 * letting it reach the query builder.
 */
function settingsWith(raw: Record<string, string> = {}): Settings {
    const values = new Map<string, string>(Object.entries(raw));
    const storage: SettingsStorage = {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
    return new Settings(storage);
}

describe("useLibraryQuery", () => {
    it("starts as the whole library in the default order", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));
        expect(result.current.query).toEqual({
            search: "",
            filters: [],
            sort: "name",
            direction: "asc",
            favouritesFirst: false
        });
    });

    it("puts the settled search term into the query", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));
        await act(async () => result.current.onSearchChange("ethiopia"));
        expect(result.current.query.search).toBe("ethiopia");
    });

    it("toggles a filter on and back off", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.isFilterActive("tea")).toBe(true);
        expect(result.current.query.filters).toEqual(["tea"]);

        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.isFilterActive("tea")).toBe(false);
        expect(result.current.query.filters).toEqual([]);
    });

    it("drops a filter id this build no longer knows before it reaches the query", async () => {
        // The obligation the design flags for this task: a stale chip id -- one
        // removed from the vocabulary since it was last selected -- must never
        // reach `buildLibraryQuery`, whose throw for an unresolved id would
        // otherwise crash the library on every render. `toggleFilter` takes a
        // bare string (the rail hands it a chip id), so this is where a bad one
        // can arrive, and `asStockFilters` is what keeps it out of the SQL.
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => {
            result.current.toggleFilter("tea");
            result.current.toggleFilter("ghost");
        });

        expect(result.current.query.filters).toEqual(["tea"]);
        // The property that matters, stated as the builder sees it: a query the
        // hook produced must be runnable, never throw for an unknown id.
        expect(() =>
            buildLibraryQuery(result.current.query, resolveStockFilter)).not.toThrow();
    });

    it("folds an unknown stored sort axis back to name ascending", async () => {
        // `Settings.get` widens `librarySort` to a bare string and only checks
        // its type, so a row written by a build that knew an axis this one does
        // not comes back verbatim. Without the narrowing readers it would index
        // the sort table to nothing and take the query builder down; the hook
        // must fold it to the default instead.
        const settings = settingsWith({
            librarySort: JSON.stringify("supernova"),
            librarySortDirection: JSON.stringify("sideways")
        });
        const {result} = await renderHook(() => useLibraryQuery(settings));

        expect(result.current.query.sort).toBe("name");
        expect(result.current.query.direction).toBe("asc");
    });

    it("reads a valid stored sort straight through", async () => {
        const settings = settingsWith({
            librarySort: JSON.stringify("lastBrewed"),
            librarySortDirection: JSON.stringify("asc")
        });
        const {result} = await renderHook(() => useLibraryQuery(settings));

        expect(result.current.query.sort).toBe("lastBrewed");
        expect(result.current.query.direction).toBe("asc");
    });

    it("writes both halves of a sort in one change", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));

        await act(async () => result.current.onSortChange("added", "desc"));

        expect(result.current.query.sort).toBe("added");
        expect(result.current.query.direction).toBe("desc");
        expect(settings.get("librarySort")).toBe("added");
        expect(settings.get("librarySortDirection")).toBe("desc");
    });

    it("keeps favourites-first independent of the sort axis", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));

        await act(async () => result.current.onSortChange("ratio", "desc"));
        await act(async () => result.current.onFavouritesFirstChange(true));

        expect(result.current.query.favouritesFirst).toBe(true);
        // The axis change did not disturb the modifier, nor the modifier the axis.
        expect(result.current.query.sort).toBe("ratio");
        expect(settings.get("libraryFavouritesFirst")).toBe(true);
    });

    it("counts the applied filters", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        expect(result.current.activeFilterCount).toBe(0);
        await act(async () => result.current.toggleFilter("tea"));
        await act(async () => result.current.toggleFilter("singlePour"));
        expect(result.current.activeFilterCount).toBe(2);
    });

    it("starts with the filter rail closed and opens it on demand", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        expect(result.current.filterRailOpen).toBe(false);
        await act(async () => result.current.toggleFilterRail());
        expect(result.current.filterRailOpen).toBe(true);
        await act(async () => result.current.toggleFilterRail());
        expect(result.current.filterRailOpen).toBe(false);
    });

    it("opens the filter rail by itself once a filter is applied", async () => {
        // Applied means on screen: the narrowing has to be visible without the
        // user opening the rail, and this is derived, never synced from an
        // effect.
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        expect(result.current.filterRailOpen).toBe(false);
        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.filterRailOpen).toBe(true);
    });

    it("closes the rail on a tap even while a filter is applied", async () => {
        // The button must never be dead. A rail held open against a tap because
        // something is filtered would be inert on exactly the screen where it is
        // most likely to be pressed.
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.filterRailOpen).toBe(true);

        await act(async () => result.current.toggleFilterRail());

        expect(result.current.activeFilterCount).toBe(1);
        expect(result.current.filterRailOpen).toBe(false);
    });

    it("does not slam the rail shut when the last filter is removed after the user opened it", async () => {
        // The behaviour this task pins: open, apply, remove must leave the rail
        // open, because the user opened it. The settled intent outlives the
        // filter it once held.
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.toggleFilterRail());
        await act(async () => result.current.toggleFilter("tea"));
        await act(async () => result.current.toggleFilter("tea"));

        expect(result.current.activeFilterCount).toBe(0);
        expect(result.current.filterRailOpen).toBe(true);
    });

    it("closes the auto-opened rail once its only filter is removed", async () => {
        // The other side of the same choice: a rail the user never opened, only
        // auto-opened by a filter, closes again when that filter goes.
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.filterRailOpen).toBe(true);
        await act(async () => result.current.toggleFilter("tea"));
        expect(result.current.filterRailOpen).toBe(false);
    });

    it("clears the search, the filters and the open rail together", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        // Open the rail *first*, so `filterRailOpenedByUser` is standing when
        // clear runs -- otherwise the applied filter alone holds it open and the
        // reset of the user-open intent is never exercised.
        await act(async () => result.current.toggleFilterRail());
        await act(async () => result.current.onSearchChange("ethiopia"));
        await act(async () => result.current.toggleFilter("tea"));

        await act(async () => result.current.clear());

        expect(result.current.query.search).toBe("");
        expect(result.current.query.filters).toEqual([]);
        expect(result.current.activeFilterCount).toBe(0);
        expect(result.current.filterRailOpen).toBe(false);
    });
});

describe("the view and the shelves", () => {
    it("starts in the list", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));
        expect(result.current.view).toBe("list");
    });

    it("remembers a chosen view in settings", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));

        await act(async () => result.current.onViewChange("shelves"));

        expect(result.current.view).toBe("shelves");
        expect(settings.get("libraryView")).toBe("shelves");
    });

    // The persistence boundary. A stale or hand-edited row must light one half
    // of the pair rather than neither.
    it("folds an unknown stored view back to the list", async () => {
        const {result} = await renderHook(() =>
            useLibraryQuery(settingsWith({libraryView: JSON.stringify("mosaic")}))
        );
        expect(result.current.view).toBe("list");
    });

    // Reversed in phase 4b. This test used to assert opening a shelf switched
    // the view back to the list; device testing rejected that as the app
    // undoing the tap. A shelf now opens into itself: the view stays on the
    // shelf idiom and the hook remembers which shelf is open, so the screen can
    // draw the shelf room rather than a list with a chip.
    it("opens a shelf into a room, staying in the shelf view", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));
        await act(async () => result.current.onViewChange("shelves"));

        await act(async () => result.current.openShelf("tea"));

        expect(result.current.view).toBe("shelves");
        expect(result.current.openShelfId).toBe("tea");
        expect(result.current.query.filters).toEqual(["tea"]);
    });

    // Back out of the room, all the way back to the grid: the id and the filter
    // it applied go together, because the room is only a room while both hold.
    it("closes the room, clearing both the open id and its filter", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));
        await act(async () => result.current.onViewChange("shelves"));
        await act(async () => result.current.openShelf("tea"));

        await act(async () => result.current.closeShelf());

        expect(result.current.view).toBe("shelves");
        expect(result.current.openShelfId).toBeNull();
        expect(result.current.query.filters).toEqual([]);
    });

    // Switching to list view from inside a room leaves the room. The shelf must
    // not survive the switch as an applied chip: a shelf is a thing you opened,
    // a chip is a lens you borrowed, and the two only ever competed when opening
    // a shelf turned into applying a chip.
    it("leaves the room when the view switches to the list", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));
        await act(async () => result.current.onViewChange("shelves"));
        await act(async () => result.current.openShelf("tea"));

        await act(async () => result.current.onViewChange("list"));

        expect(result.current.view).toBe("list");
        expect(result.current.openShelfId).toBeNull();
        expect(result.current.query.filters).toEqual([]);
    });

    // The invariant the design calls out: a filter cleared by any other route
    // must not leave a room hanging open against an empty filter, which would
    // be a room with no shelf under it.
    it("clears the open shelf when the whole query is cleared", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useLibraryQuery(settings));
        await act(async () => result.current.onViewChange("shelves"));
        await act(async () => result.current.openShelf("tea"));

        await act(async () => result.current.clear());

        expect(result.current.openShelfId).toBeNull();
        expect(result.current.query.filters).toEqual([]);
    });

    // A shelf is a whole lens, not another chip. Intersecting two would open a
    // list holding neither shelf's contents, which is the one answer the user
    // did not ask for.
    it("replaces the applied filters rather than adding to them", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));
        await act(async () => result.current.toggleFilter("hot"));

        await act(async () => result.current.openShelf("tea"));

        expect(result.current.query.filters).toEqual(["tea"]);
    });

    it("keeps a tag shelf in the query, where the stock narrowing would drop it", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.openShelf("tag:morning"));

        expect(result.current.query.filters).toEqual(["tag:morning"]);
        expect(result.current.activeFilterCount).toBe(1);
    });

    // An applied filter opens the filter rail by derivation, so a shelf tap puts
    // its own narrowing on screen without touching the user's stored intent.
    it("shows the narrowing a shelf applied", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));

        await act(async () => result.current.openShelf("tea"));

        expect(result.current.filterRailOpen).toBe(true);
    });

    it("builds a real query for a tag shelf", async () => {
        const {result} = await renderHook(() => useLibraryQuery(settingsWith()));
        await act(async () => result.current.openShelf("tag:Morning"));

        const {sql, params} = buildLibraryQuery(result.current.query, resolveLibraryFilter);

        expect(sql).toContain("recipe_tags");
        // Folded, so the shelf holds what the tag search finds.
        expect(params).toContain("morning");
    });
});
