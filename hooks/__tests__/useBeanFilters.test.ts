import {useState} from "react";
import {act, renderHook} from "@testing-library/react-native";

import {useBeanFilters, type BeanVocabularyStore} from "@/hooks/useBeanFilters";
import {beanFilterId} from "@/library/beanFilters";
import type {ProfileField} from "@/library/beanProfile";
import type {BeanVocabularyEntry} from "@/library/BrewDatabase";

function id(field: ProfileField, value: string, rated = false): string {
    return beanFilterId({field, value, rated});
}

function entry(field: ProfileField, value: string, recipes = 1): BeanVocabularyEntry {
    return {field, value, recipes};
}

function store(entries: BeanVocabularyEntry[] = []): BeanVocabularyStore {
    return {beanVocabulary: jest.fn(() => entries)};
}

function useHarness(initial: string[], database: BeanVocabularyStore = store()) {
    const [filters, setFilters] = useState(initial);
    const bean = useBeanFilters({
        filters,
        applyFilters: (update) => setFilters((current) => update(current)),
        store:        database
    });
    return {...bean, filters};
}

describe("useBeanFilters", () => {
    it("reads the vocabulary once from a lazy initialiser", async () => {
        const database = store([entry("process", "Natural", 2)]);
        let filters: string[] = [];
        const {result, rerender} = await renderHook(
            () => useBeanFilters({
                filters,
                applyFilters: jest.fn(),
                store:        database
            })
        );

        expect(result.current.vocabulary).toEqual([entry("process", "Natural", 2)]);

        filters = [id("process", "Natural")];
        await rerender({});

        expect(database.beanVocabulary).toHaveBeenCalledTimes(1);
    });

    it("derives ratedOnly from the applied ids", async () => {
        const {result} = await renderHook(() =>
            useHarness([id("process", "Natural", true)])
        );

        expect(result.current.ratedOnly).toBe(true);
    });

    it("derives ratedOnly as false when the applied ids disagree", async () => {
        const {result} = await renderHook(() =>
            useHarness([id("process", "Natural", true), id("roast", "Light")])
        );

        expect(result.current.ratedOnly).toBe(false);
    });

    it("rewrites every applied bean id and leaves non-bean filters untouched", async () => {
        const {result} = await renderHook(() =>
            useHarness([id("process", "Natural"), "tea", "tag:mornings"])
        );

        await act(async () => result.current.setRatedOnly(true));

        expect(result.current.filters).toEqual([
            id("process", "Natural", true),
            "tea",
            "tag:mornings"
        ]);
    });

    it("replaces bean ids and leaves non-bean filters in place and in order", async () => {
        const {result} = await renderHook(() =>
            useHarness(["tea", id("process", "Natural"), "tag:mornings"])
        );

        await act(async () => result.current.setValues([id("roast", "Light")]));

        expect(result.current.filters).toEqual([
            "tea",
            id("roast", "Light"),
            "tag:mornings"
        ]);
    });
});

describe("useBeanFilters refresh", () => {
    it("re-reads the vocabulary from the store", async () => {
        const entries = [entry("process", "Natural", 1)];
        const database: BeanVocabularyStore = {
            beanVocabulary: jest.fn(() => [...entries])
        };
        const {result} = await renderHook(() => useBeanFilters({
            filters:      [],
            applyFilters: jest.fn(),
            store:        database
        }));

        expect(result.current.vocabulary).toEqual([entry("process", "Natural", 1)]);

        entries.push(entry("roast", "Light", 2));
        await act(async () => {
            result.current.refresh();
        });

        expect(result.current.vocabulary).toEqual([
            entry("process", "Natural", 1),
            entry("roast", "Light", 2)
        ]);
    });

    it("does not read it again on a plain re-render", async () => {
        const database = store([entry("process", "Natural")]);
        const {rerender} = await renderHook(() => useBeanFilters({
            filters:      [],
            applyFilters: jest.fn(),
            store:        database
        }));

        await act(async () => {
            rerender({});
        });

        expect(database.beanVocabulary).toHaveBeenCalledTimes(1);
    });
});
