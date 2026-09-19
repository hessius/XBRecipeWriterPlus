import {act, renderHook} from "@testing-library/react-native";

import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import type {BackupPayload} from "@/library/backup";
import {
    resolveLibraryFilter, resolveStockFilter, STOCK_FILTER_ORDER
} from "@/library/libraryFilters";
import type {LibraryQuery, RecipeEvidence} from "@/library/libraryQuery";
import Recipe from "@/library/Recipe";
import {MARK_MEMBERS} from "@/components/ShelfMark";

jest.mock("@/library/RecipeDatabase");

function stubDb(recipes: Recipe[]) {
    return {
        queryRecipes:       jest.fn(() => recipes),
        // Typed nullable because the real `retrieveAllRecipes` returns null for
        // an empty table rather than an empty array, and a stub that cannot
        // express that hides the case from every test using it.
        retrieveAllRecipes: jest.fn((): Recipe[] | null => recipes),
        countRecipes:       jest.fn(() => recipes.length),
        deleteRecipe:       jest.fn(),
        cloneRecipe:        jest.fn(),
        // Writes through to the backing array so a reload after the write
        // returns the changed recipe, the same as the real database does.
        updateRecipe:       jest.fn((uuid: string, updated: Recipe) => {
            const index = recipes.findIndex((r) => r.uuid === uuid);
            if (index !== -1) recipes[index] = updated;
        }),
        deleteAllRecipes:   jest.fn(),
        insertRecipes:      jest.fn(),
        replaceAllRecipes:  jest.fn(),
        countRecipesByFilter: jest.fn((ids: readonly string[]) =>
            Object.fromEntries(ids.map((id) => [id, 0]))
        ),
        countRecipesByTag: jest.fn((): {tag: string; count: number}[] => []),
        brewEvidence: jest.fn((): Record<string, RecipeEvidence> => ({})),
        shelfMembers: jest.fn((): Record<string, Recipe[]> => ({})),
        countRecipesByAuthor: jest.fn((): {author: string; count: number}[] => [])
    };
}

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function plainRecipe(): Recipe {
    return named("Ethiopia");
}

function favouriteRecipe(): Recipe {
    const r = named("Ethiopia");
    r.favourite = true;
    return r;
}

function payloadOf(recipes: Recipe[]): BackupPayload {
    return {
        recipes, brews: [], settings: {}, skipped: 0, skippedBrews: 0,
        appVersion: "2.6.0", exportedAt: ""
    };
}

describe("useRecipeLibrary", () => {
    it("hands back the store's order without re-sorting it", async () => {
        // Sorting moved out of the hook and into the SQL query the store runs;
        // the hook must present exactly what `queryRecipes` returned, in that
        // order. Seeding an order the hook would once have alphabetised
        // (Ethiopia, Kenya, Zambia) proves it no longer sorts in JavaScript.
        const db = stubDb([named("Zambia"), named("Ethiopia"), named("Kenya")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes.map((r) => r.displayName()))
            .toEqual(["Zambia", "Ethiopia", "Kenya"]);
    });

    it("runs the exact query and filter resolver through queryRecipes", async () => {
        // The hook's one job on the read path is to hand the query straight to
        // the store. A stub that ignored its arguments let a reviewer replace the
        // real query with a different one and watch every test stay green, so the
        // wiring task that hands a live query down this path would have no test
        // that could see it working. Pin both arguments to what was passed in.
        const query: LibraryQuery = {
            search: "ethiopia",
            filters: [],
            sort: "ratio",
            direction: "desc",
            favouritesFirst: true
        };
        const db = stubDb([named("Ethiopia")]);
        await renderHook(() => useRecipeLibrary(db, query));
        expect(db.queryRecipes).toHaveBeenCalledWith(query, resolveLibraryFilter);
    });

    it("reads stock filter counts through the store's count method", async () => {
        const db = stubDb([named("Ethiopia")]);
        await renderHook(() => useRecipeLibrary(db));

        expect(db.countRecipesByFilter).toHaveBeenCalledWith(
            STOCK_FILTER_ORDER,
            resolveStockFilter
        );
    });

    it("reads tag counts through the store's count method", async () => {
        const db = stubDb([named("Ethiopia")]);
        db.countRecipesByTag.mockReturnValue([{tag: "morning", count: 2}]);

        const {result} = await renderHook(() => useRecipeLibrary(db));

        expect(db.countRecipesByTag).toHaveBeenCalled();
        expect(result.current.tagCounts).toEqual([{tag: "morning", count: 2}]);
    });

    // The same reasoning as the stock counts above. A store that cannot answer
    // must not be allowed to say "no tags": every manual shelf the user built
    // would vanish from the grid, which is a success-shaped lie about their own
    // work rather than a failure they can see.
    it("throws when a store cannot count tags", async () => {
        const {countRecipesByTag: _omitted, ...withoutTags} = stubDb([named("Ethiopia")]);

        await expect(renderHook(() => useRecipeLibrary(withoutTags))).rejects.toThrow(
            "This store cannot count tags"
        );
    });

    it("throws when a store cannot count stock filters", async () => {
        const {countRecipesByFilter: _omitted, ...withoutCounts} = stubDb([named("Ethiopia")]);

        await expect(renderHook(() => useRecipeLibrary(withoutCounts))).rejects.toThrow(
            "This store cannot count stock filters"
        );
    });

    it("throws when a store can count its recipes neither way", async () => {
        // Rather than reporting zero. `librarySize` is what the screen asks "is
        // the library empty?", so a success-shaped zero from a store that cannot
        // count hides the rail and the list over a table that may hold
        // everything the user has. Failing loudly is recoverable; an empty
        // library that is not empty is not.
        const {countRecipes: _c, retrieveAllRecipes: _r, ...neither} = stubDb([named("Ethiopia")]);

        await expect(renderHook(() => useRecipeLibrary(neither as never))).rejects.toThrow(
            "This store cannot count its recipes"
        );
    });

    it("reads a null from a store that does have the method as an empty table", async () => {
        // `retrieveAllRecipes` returns null for an empty table as well as never
        // being there at all, so the guard above has to test the method rather
        // than its answer. Testing the answer would throw on a genuinely empty
        // library, which is the first library every new user has.
        const {countRecipes: _omitted, ...byList} = stubDb([]);
        byList.retrieveAllRecipes.mockReturnValue(null);
        const {result} = await renderHook(() => useRecipeLibrary(byList as never));

        expect(result.current.librarySize).toBe(0);
    });

    it("refuses to build a backup from a store that cannot read the table", async () => {
        // An empty backup is the one outcome worse than a failed one: it looks
        // like it worked, and the user finds out on the day it is all they have.
        const {retrieveAllRecipes: _omitted, ...withoutIt} = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(withoutIt as never));

        expect(() => result.current.allRecipes()).toThrow();
    });

    it("backs up the whole table even while the list holds a narrowing query", async () => {
        // The moment a caller hands the rail's live query in, `recipes` is only
        // what a search left on screen. A backup taken from that would silently
        // drop everything the filter hid -- data loss dressed as an export. The
        // whole library must reach the backup regardless of the query, so the two
        // reads are pointed at different store methods: the list at a narrowing
        // `queryRecipes`, the backup at `retrieveAllRecipes`.
        const whole = [named("Ethiopia"), named("Kenya"), named("Zambia")];
        const db = stubDb(whole);
        db.queryRecipes.mockReturnValue([named("Ethiopia")]);
        const narrowing: LibraryQuery = {
            search: "eth",
            filters: [],
            sort: "name",
            direction: "asc",
            favouritesFirst: false
        };
        const {result} = await renderHook(() => useRecipeLibrary(db, narrowing));

        expect(result.current.recipes.map((r) => r.displayName())).toEqual(["Ethiopia"]);
        expect(result.current.allRecipes().map((r) => r.displayName()))
            .toEqual(["Ethiopia", "Kenya", "Zambia"]);
    });

    it("reports an empty library as an empty list", async () => {
        // `queryRecipes` returns [] for an empty table, never null, so the hook
        // no longer has a null to absorb -- but the screen still needs [].
        const db = {...stubDb([]), queryRecipes: jest.fn(() => [])};
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes).toEqual([]);
    });

    it("deletes through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.deleteRecipe(result.current.recipes[0]));

        expect(db.deleteRecipe).toHaveBeenCalledTimes(1);
        expect(db.queryRecipes).toHaveBeenCalledTimes(2);
    });

    it("duplicates through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.duplicateRecipe(result.current.recipes[0]));

        expect(db.cloneRecipe).toHaveBeenCalledTimes(1);
        expect(db.queryRecipes).toHaveBeenCalledTimes(2);
    });

    it("toggles a favourite and persists it", async () => {
        const db = stubDb([plainRecipe()]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            result.current.toggleFavourite(result.current.recipes[0]);
        });

        expect(db.updateRecipe).toHaveBeenCalledTimes(1);
        expect(result.current.recipes[0].favourite).toBe(true);
    });

    it("toggles back off", async () => {
        const db = stubDb([favouriteRecipe()]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            result.current.toggleFavourite(result.current.recipes[0]);
        });

        expect(result.current.recipes[0].favourite).toBe(false);
    });

    it("reloads to the true value instead of throwing when the write fails", async () => {
        // toggleFavourite mutates before it writes, so a throw here must not
        // skip the reload. stubDb's retrieveAllRecipes hands back the same
        // live object every call, which would hide this bug (the mutation
        // would just look "restored" because it never left in the first
        // place), so this store keeps its own serialized copy and rebuilds a
        // fresh Recipe on every read, the way the real database does.
        const original = plainRecipe();
        const stored = JSON.stringify(original);
        const db = {
            queryRecipes:       jest.fn(() => [new Recipe(undefined, stored)]),
            countRecipes:       jest.fn(() => 1),
            countRecipesByFilter: jest.fn((ids: readonly string[]) =>
                Object.fromEntries(ids.map((id) => [id, 0]))
            ),
            countRecipesByTag:  jest.fn((): {tag: string; count: number}[] => []),
            deleteRecipe:       jest.fn(),
            cloneRecipe:        jest.fn(),
            updateRecipe:       jest.fn(() => {
                throw new Error("database is locked");
            })
        };
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            expect(() => {
                result.current.toggleFavourite(result.current.recipes[0]);
            }).not.toThrow();
        });

        expect(result.current.recipes[0].favourite).toBe(false);
    });

    it("re-reads on refresh", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.refresh());

        expect(db.queryRecipes).toHaveBeenCalledTimes(2);
    });

    it("deletes the whole library and reports how many went", async () => {
        const db = stubDb([named("Ethiopia"), named("Kenya")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            outcome = result.current.deleteAll();
        });

        expect(outcome).toEqual({status: "deleted", deleted: 2});
        expect(db.deleteAllRecipes).toHaveBeenCalledTimes(1);
    });

    it("reports the whole table deleted, not the narrowed list on screen", async () => {
        // Delete-all deletes the table whatever the rail was showing, so a count
        // taken from the view would tell the user a smaller number than the one
        // they actually lost.
        const shown = named("Kenya");
        const db = stubDb([shown]);
        db.countRecipes.mockReturnValue(3);
        const {result} = await renderHook(() =>
            useRecipeLibrary(db, {
                search:          "kenya",
                filters:         [],
                sort:            "name",
                direction:       "asc",
                favouritesFirst: false
            })
        );

        let outcome;
        await act(async () => {
            outcome = result.current.deleteAll();
        });

        expect(outcome).toEqual({status: "deleted", deleted: 3});
    });

    it("reports a failed delete instead of throwing into the screen", async () => {
        // The one irreversible action in the app, and the only destructive path
        // that had no outcome to report. A `runSync` that threw escaped into the
        // press handler, where nothing caught it and nothing could tell the user
        // their recipes were still there.
        const db = stubDb([named("Ethiopia"), named("Kenya")]);
        db.deleteAllRecipes = jest.fn(() => {
            throw new Error("database is locked");
        });
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            expect(() => {
                outcome = result.current.deleteAll();
            }).not.toThrow();
        });

        expect(outcome).toEqual({status: "failed"});
    });

    it("merges a restore through insertRecipes, skipping what is already present", async () => {
        const present = named("Ethiopia");
        const db = stubDb([present]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        let outcome;
        await act(async () => {
            outcome = result.current.applyRestore(
                payloadOf([present, incoming]), {replace: false}
            );
        });

        expect(outcome).toEqual({status: "restored", added: 1});
        expect(db.insertRecipes).toHaveBeenCalledTimes(1);
        expect(db.insertRecipes.mock.calls[0][0].map((r: Recipe) => r.name)).toEqual(["Kenya"]);
        expect(db.replaceAllRecipes).not.toHaveBeenCalled();
    });

    it("dedupes a restore against the whole table, not the list on screen", async () => {
        // A recipe the rail filtered out is still in the library. Deduping
        // against the view would hand it back as an insert and collide.
        const hidden = named("Ethiopia");
        const shown = named("Kenya");
        const db = stubDb([shown]);
        db.retrieveAllRecipes.mockReturnValue([shown, hidden]);
        const {result} = await renderHook(() =>
            useRecipeLibrary(db, {
                search:          "kenya",
                filters:         [],
                sort:            "name",
                direction:       "asc",
                favouritesFirst: false
            })
        );

        await act(async () => {
            result.current.applyRestore(payloadOf([hidden, shown]), {replace: false});
        });

        expect(db.insertRecipes).toHaveBeenCalledTimes(1);
        expect(db.insertRecipes.mock.calls[0][0]).toEqual([]);
    });

    it("replaces a restore through the transactional replaceAllRecipes", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        await act(async () => {
            result.current.applyRestore(payloadOf([incoming]), {replace: true});
        });

        expect(db.replaceAllRecipes).toHaveBeenCalledTimes(1);
        expect(db.replaceAllRecipes.mock.calls[0][0].map((r: Recipe) => r.name)).toEqual(["Kenya"]);
        expect(db.insertRecipes).not.toHaveBeenCalled();
    });

    it("reports a failed restore rather than throwing when the store rejects", async () => {
        const db = stubDb([]);
        db.insertRecipes.mockImplementation(() => {
            throw new Error("DB: Recipe already exists");
        });
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            outcome = result.current.applyRestore(payloadOf([named("Kenya")]), {replace: false});
        });

        expect(outcome).toEqual({status: "failed"});
    });

    it("ignores a second restore that re-enters before the first has repainted", async () => {
        // Two taps in one React batch, with no render between them, would both
        // read the same pre-reload snapshot and insert the same uuids. The
        // in-flight flag lets only the first through.
        const db = stubDb([]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        let first;
        let second;
        await act(async () => {
            first = result.current.applyRestore(payloadOf([incoming]), {replace: false});
            second = result.current.applyRestore(payloadOf([incoming]), {replace: false});
        });

        expect(first).toEqual({status: "restored", added: 1});
        expect(second).toEqual({status: "busy"});
        expect(db.insertRecipes).toHaveBeenCalledTimes(1);
    });
});

describe("the store it reads through", () => {
    it("is built once, not on every render", async () => {
        // The default used to be a default parameter, so every render of Home
        // ran `new RecipeDatabase()` — and each of those opens SQLite and
        // replays the table setup. Home re-renders for scrolling, for the
        // settings sheet and for NFC progress.
        const RecipeDatabase = jest.requireMock("@/library/RecipeDatabase").default;
        RecipeDatabase.mockClear();

        const {rerender} = await renderHook(() => useRecipeLibrary());
        await rerender(undefined);
        await rerender(undefined);

        expect(RecipeDatabase).toHaveBeenCalledTimes(1);
    });

    describe("the evidence the cards carry", () => {
        it("hands back what the store read", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.brewEvidence.mockReturnValue({
                one: {brews: 3, lastBrewedAt: 1_000, avgRating: 4}
            });

            const {result} = await renderHook(() => useRecipeLibrary(db));

            expect(result.current.evidence["one"])
                .toEqual({brews: 3, lastBrewedAt: 1_000, avgRating: 4});
        });

        it("re-reads it on a refresh, so a brew just judged shows up", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.brewEvidence.mockReturnValue({});
            const {result} = await renderHook(() => useRecipeLibrary(db));
            expect(result.current.evidence).toEqual({});

            db.brewEvidence.mockReturnValue({
                one: {brews: 1, lastBrewedAt: 9, avgRating: 5}
            });
            await act(async () => { result.current.refresh(); });

            expect(result.current.evidence["one"].brews).toBe(1);
        });

        it("is empty, not undefined, for a store that cannot report any", async () => {
            // `brewEvidence` is optional on the store so the backup and test
            // stubs elsewhere need not grow a method they have no use for.
            const db = stubDb([named("Ethiopia")]);
            const {brewEvidence: _unused, ...without} = db;

            const {result} = await renderHook(() => useRecipeLibrary(without));

            expect(result.current.evidence).toEqual({});
        });
    });

    describe("the art each shelf tile draws", () => {
        it("asks for every stock shelf and every tag", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.countRecipesByTag.mockReturnValue([{tag: "morning", count: 3}]);

            await renderHook(() => useRecipeLibrary(db));

            const [asked] = db.shelfMembers.mock.calls[0] as unknown as [string[]];
            expect(asked).toContain("tea");
            expect(asked).toContain("tag:morning");
        });

        // Art is read one synchronous query per shelf, on the thread that is
        // drawing. A library shared into by two hundred people would otherwise
        // pay for two hundred reads to draw none of them: a shelf of fewer than
        // three is never offered, whatever the rail is filtered by.
        it("does not read art for a shelf too small to be offered", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.countRecipesByTag.mockReturnValue([
                {tag: "morning", count: 3}, {tag: "once", count: 2}
            ]);
            db.countRecipesByAuthor.mockReturnValue([
                {author: "Anna", count: 3}, {author: "Bo", count: 1}
            ]);

            await renderHook(() => useRecipeLibrary(db));

            const [asked] = db.shelfMembers.mock.calls[0] as unknown as [string[]];
            expect(asked).toContain("tag:morning");
            expect(asked).toContain("sharedBy:Anna");
            expect(asked).not.toContain("tag:once");
            expect(asked).not.toContain("sharedBy:Bo");
        });

        // The ids are folded to one string so the read can be cached on it.
        // Author names are the one part of an id a stranger wrote, so the fold
        // cannot use a character a name is allowed to contain.
        it("keeps two author shelves apart when a name holds the separator", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.countRecipesByAuthor.mockReturnValue([
                {author: "Anna\nBo", count: 3}, {author: "Cal", count: 3}
            ]);

            await renderHook(() => useRecipeLibrary(db));

            const [asked] = db.shelfMembers.mock.calls[0] as unknown as [string[]];
            expect(asked).toContain("sharedBy:Anna\nBo");
            expect(asked).toContain("sharedBy:Cal");
            expect(asked).not.toContain("sharedBy:Anna");
        });

        it("asks for no more members than the mark will draw", async () => {
            const db = stubDb([named("Ethiopia")]);

            await renderHook(() => useRecipeLibrary(db));

            const call = db.shelfMembers.mock.calls[0] as unknown as [unknown, unknown, number];
            expect(call[2]).toBe(MARK_MEMBERS);
        });

        it("turns the members into the accents the mosaic is drawn from", async () => {
            const member = named("Ethiopia");
            const db = stubDb([member]);
            db.shelfMembers.mockReturnValue({tea: [member]});

            const {result} = await renderHook(() => useRecipeLibrary(db));

            expect(result.current.shelfMarks["tea"].accents).toHaveLength(1);
        });

        it("leaves out a shelf with no members at all", async () => {
            // The tile falls back to its plain field, which is what an empty
            // shelf should look like -- not a mark drawn from nothing.
            const db = stubDb([named("Ethiopia")]);
            db.shelfMembers.mockReturnValue({tea: []});

            const {result} = await renderHook(() => useRecipeLibrary(db));

            expect(result.current.shelfMarks["tea"]).toBeUndefined();
        });

        it("is empty for a store that cannot answer", async () => {
            const db = stubDb([named("Ethiopia")]);
            const {shelfMembers: _unused, ...without} = db;

            const {result} = await renderHook(() => useRecipeLibrary(without));

            expect(result.current.shelfMarks).toEqual({});
        });
    });

    describe("who a recipe arrived from", () => {
        it("hands back the counts the store read", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.countRecipesByAuthor.mockReturnValue([{author: "BrewMind", count: 3}]);

            const {result} = await renderHook(() => useRecipeLibrary(db));

            expect(result.current.authorCounts).toEqual([{author: "BrewMind", count: 3}]);
        });

        it("asks for each author's shelf art too", async () => {
            const db = stubDb([named("Ethiopia")]);
            db.countRecipesByAuthor.mockReturnValue([{author: "BrewMind", count: 3}]);

            await renderHook(() => useRecipeLibrary(db));

            const [asked] = db.shelfMembers.mock.calls[0] as unknown as [string[]];
            expect(asked).toContain("sharedBy:BrewMind");
        });

        it("is empty for a store that cannot answer", async () => {
            const db = stubDb([named("Ethiopia")]);
            const {countRecipesByAuthor: _unused, ...without} = db;

            const {result} = await renderHook(() => useRecipeLibrary(without));

            expect(result.current.authorCounts).toEqual([]);
        });
    });
});