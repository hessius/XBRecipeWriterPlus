import {useEffect, useState} from "react";

import {useRailSearch, type RailSearch} from "@/hooks/useRailSearch";
import {useSetting} from "@/hooks/useSetting";
import {loadHubCatalogue} from "@/library/hub/hubCatalogue";
import type {HubApiError} from "@/library/hub/hubApi";
import {
    EMPTY_HUB_QUERY,
    hubFacetCounts,
    matchesHubQuery,
    sortHubRows,
    type HubFacet,
    type HubQuery,
    type HubSort
} from "@/library/hub/hubQuery";
import type {HubRecipe} from "@/library/hub/hubRow";
import {asMachineModel, type MachineModel} from "@/library/machine/machineModel";

export type HubBrowse = {
    /** The rows that match the question, in the chosen order. */
    rows: HubRecipe[];
    /** Every row of this machine's partition that has arrived. */
    all: HubRecipe[];
    query: HubQuery;
    /** True until the last page lands. */
    arriving: boolean;
    /** Pages in and pages expected, for a progress line. */
    page: number;
    totalPage: number;
    /** Set if the load threw. A broken connection, not an empty catalogue. */
    failed: HubApiError | Error | null;
    /**
     * The rail's search field, whole. The hub rail wants the same field the
     * library rail has, so it wants `text` to draw, `expanded` and `onExpand`
     * to open, and `onBlur` to close. Handing out only a setter would leave the
     * field with nothing to show and would make the rail build a second
     * debounce against the same keyword.
     */
    search: RailSearch;
    /** Set the keyword without going through the field, and without the wait. */
    setKeyword(keyword: string): void;
    setSort(sort: HubSort): void;
    /** Replace one facet wholesale, which is what the filter sheet reports. */
    setFacet(facet: HubFacet, values: readonly string[]): void;
    /** Add or remove one value, which is what a rail chip does. */
    toggleFacet(facet: HubFacet, value: string): void;
    setRoasts(roasts: readonly number[]): void;
    clearQuery(): void;
    /** Commonest first, counted over `all`. Never offers a value finding zero. */
    chips(facet: HubFacet): {value: string; count: number}[];
    /** The rows every part of the query except this one agrees with. */
    without(facet: HubFacet | "roasts"): HubRecipe[];
    /** Try the load again after a failure. */
    retry(): void;
};

type Reading = {
    model: MachineModel;
    rows: HubRecipe[];
    page: number;
    totalPage: number;
    failed: HubApiError | Error | null;
    done: boolean;
};

const EMPTY_READING: Omit<Reading, "model"> = {
    rows: [],
    page: 0,
    totalPage: 0,
    failed: null,
    done: false
};

function replaceFacet(query: HubQuery, facet: HubFacet, values: readonly string[]): HubQuery {
    return {...query, [facet]: [...values]};
}

function withoutValue(values: readonly string[], value: string): string[] {
    return values.filter((held) => held !== value);
}

function withToggledValue(values: readonly string[], value: string): string[] {
    return values.includes(value) ? withoutValue(values, value) : [...values, value];
}

export function useHubBrowse(): HubBrowse {
    const [storedModel] = useSetting("machineModel");
    const model = asMachineModel(storedModel);
    const [query, setQuery] = useState<HubQuery>(EMPTY_HUB_QUERY);
    const [reading, setReading] = useState<Reading | null>(null);
    const [attempt, setAttempt] = useState(0);

    const current = reading !== null && reading.model === model ? reading : EMPTY_READING;
    const all = current.rows;
    const rows = sortHubRows(all.filter((row) => matchesHubQuery(row, query)), query.sort);
    const search = useRailSearch((keyword) =>
        setQuery((was) => ({...was, keyword}))
    );

    useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        loadHubCatalogue(model, (progress) => {
            if (!alive) return;
            setReading({
                model,
                rows: progress.rows,
                page: progress.page,
                totalPage: progress.totalPage,
                failed: null,
                done: false
            });
        }, controller.signal)
            .then((loaded) => {
                if (!alive) return;
                setReading((was) => {
                    const latest = was !== null && was.model === model ? was : null;
                    return {
                        model,
                        rows: latest?.rows ?? loaded,
                        page: latest?.page ?? 0,
                        totalPage: latest?.totalPage ?? 0,
                        failed: null,
                        done: true
                    };
                });
            })
            .catch((error: HubApiError | Error) => {
                if (!alive || error.name === "AbortError") return;
                setReading((was) => ({
                    model,
                    rows: was !== null && was.model === model ? was.rows : [],
                    page: was !== null && was.model === model ? was.page : 0,
                    totalPage: was !== null && was.model === model ? was.totalPage : 0,
                    failed: error,
                    done: true
                }));
            });
        return () => {
            alive = false;
            controller.abort();
        };
    }, [model, attempt]);

    function setKeyword(keyword: string): void {
        setQuery((was) => ({...was, keyword}));
    }

    function setSort(sort: HubSort): void {
        setQuery((was) => ({...was, sort}));
    }

    function setFacet(facet: HubFacet, values: readonly string[]): void {
        setQuery((was) => replaceFacet(was, facet, values));
    }

    function toggleFacet(facet: HubFacet, value: string): void {
        setQuery((was) => replaceFacet(was, facet, withToggledValue(was[facet], value)));
    }

    function setRoasts(roasts: readonly number[]): void {
        setQuery((was) => ({...was, roasts: [...roasts]}));
    }

    function clearQuery(): void {
        search.onClear();
        setQuery(EMPTY_HUB_QUERY);
    }

    /**
     * The rows every question except this one already agrees with.
     *
     * A sheet must count over these rather than over the whole catalogue, or
     * it breaks its own promise that a chip can never offer a value that finds
     * nothing: with ORIGIN Ethiopia chosen, a PROCESS list counted over
     * everything would still offer a process only a Kenyan row carries, and
     * tapping it would answer NO MATCHES. A facet never narrows itself,
     * because choosing a second origin widens the answer rather than narrowing
     * it.
     */
    function without(facet: HubFacet | "roasts"): HubRecipe[] {
        const relaxed: HubQuery = facet === "roasts"
            ? {...query, roasts: []}
            : {...query, [facet]: []};
        return all.filter((row) => matchesHubQuery(row, relaxed));
    }

    function chips(facet: HubFacet): {value: string; count: number}[] {
        return hubFacetCounts(without(facet), facet);
    }

    function retry(): void {
        setReading({
            model,
            rows: [],
            page: 0,
            totalPage: 0,
            failed: null,
            done: false
        });
        setAttempt((was) => was + 1);
    }

    return {
        rows,
        all,
        query,
        search,
        arriving: current.failed === null && !current.done,
        page: current.page,
        totalPage: current.totalPage,
        failed: current.failed,
        setKeyword,
        setSort,
        setFacet,
        toggleFacet,
        setRoasts,
        clearQuery,
        chips,
        without,
        retry
    };
}

export default useHubBrowse;
