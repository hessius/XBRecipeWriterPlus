import {act, renderHook} from "@testing-library/react-native";

import {useLibraryQuery} from "@/hooks/useLibraryQuery";
import {resolveStockFilter} from "@/library/libraryFilters";
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
});
