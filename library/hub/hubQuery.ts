/**
 * The rail's question, answered locally over rows the catalogue already sent.
 *
 * Server-side facet filters are deliberately not used here: they were measured
 * to return zero rows for Original owners and a small fraction of matching
 * Studio rows. The row normaliser has better facts than the server index.
 */
import type {MachineModel} from "@/library/machine/machineModel";

import type {HubPageRequest} from "./hubApi";
import type {HubRecipe} from "./hubRow";

/** How many rows a page holds. The server honours 100. */
export const HUB_PAGE_SIZE = 100;

export const HUB_SORTS = {
    newest: {label: "NEWEST"},
    name: {label: "A TO Z"},
    ratio: {label: "STRONGEST"}
} as const;

export type HubSort = keyof typeof HUB_SORTS;

export type HubQuery = {
    keyword: string;
    /** Values, not ids: `"Colombia"`, not `"4"`. Matched case-insensitively. */
    origins: readonly string[];
    processes: readonly string[];
    varietals: readonly string[];
    flavours: readonly string[];
    /** Roast is still the server's five words, so this stays numeric. */
    roasts: readonly number[];
    sort: HubSort;
};

export const EMPTY_HUB_QUERY: HubQuery = {
    keyword: "",
    origins: [],
    processes: [],
    varietals: [],
    flavours: [],
    roasts: [],
    sort: "newest"
};

/** Whether the rail is asking for anything narrower than the whole catalogue. */
export function hubQueryIsNarrowed(query: HubQuery): boolean {
    return query.keyword.trim() !== ""
        || query.origins.length > 0
        || query.processes.length > 0
        || query.varietals.length > 0
        || query.flavours.length > 0
        || query.roasts.length > 0;
}

/** The catalogue's code for a machine. */
export function machineCode(model: MachineModel): string {
    return model === "original" ? "J20" : "J15";
}

function key(value: string): string {
    return value.trim().toLowerCase();
}

function selected(values: readonly string[]): Set<string> {
    return new Set(values.map(key).filter((value) => value !== ""));
}

function facetMatches(rowValues: readonly string[], chosenValues: readonly string[]): boolean {
    const chosen = selected(chosenValues);
    if (chosen.size === 0) return true;
    return rowValues.some((value) => chosen.has(key(value)));
}

function roastMatches(roast: number | null, chosenRoasts: readonly number[]): boolean {
    return chosenRoasts.length === 0 || (roast !== null && chosenRoasts.includes(roast));
}

function keywordValues(row: HubRecipe): string[] {
    return [
        row.name,
        row.author,
        row.coffeeType,
        ...row.origin,
        ...row.varietal,
        ...row.process,
        ...row.flavour
    ];
}

function ratioSortValue(ratio: number): number {
    return Number.isFinite(ratio) ? ratio : Number.POSITIVE_INFINITY;
}

/**
 * Whether one row answers the rail's question.
 *
 * Local because the server's own filters do not work: see the amendment above.
 * Every facet is an AND across facets and an OR within one, which is what the
 * library's filter rail already means by a chip.
 */
export function matchesHubQuery(row: HubRecipe, query: HubQuery): boolean {
    const keyword = key(query.keyword);
    const keywordMatches = keyword === ""
        || keywordValues(row).some((value) => key(value).includes(keyword));

    return keywordMatches
        && facetMatches(row.origin, query.origins)
        && facetMatches(row.process, query.processes)
        && facetMatches(row.varietal, query.varietals)
        && facetMatches(row.flavour, query.flavours)
        && roastMatches(row.roast, query.roasts);
}

/** The catalogue in the order the rail asked for. Never mutates its input. */
export function sortHubRows(rows: readonly HubRecipe[], sort: HubSort): HubRecipe[] {
    const indexed = rows.map((row, index) => ({row, index}));

    if (sort === "newest") return indexed.map(({row}) => row);

    indexed.sort((left, right) => {
        let comparison = 0;
        if (sort === "name") {
            comparison = left.row.name.localeCompare(right.row.name);
        } else {
            const leftRatio = ratioSortValue(left.row.ratio);
            const rightRatio = ratioSortValue(right.row.ratio);
            comparison = leftRatio - rightRatio;
        }
        return comparison === 0 ? left.index - right.index : comparison;
    });

    return indexed.map(({row}) => row);
}

type CountedSpelling = {
    value: string;
    count: number;
};

type CountedValue = {
    count: number;
    firstIndex: number;
    spellings: Map<string, CountedSpelling>;
};

export type HubFacet = "origins" | "processes" | "varietals" | "flavours";

const FACET_FIELD = {
    origins: "origin",
    processes: "process",
    varietals: "varietal",
    flavours: "flavour"
} as const satisfies Record<HubFacet, keyof HubRecipe>;

/**
 * How many of these rows carry each value of one facet, commonest first.
 *
 * This is what builds the rail's chips, so a chip can never offer a value that
 * finds nothing. Counted over the rows that have arrived, not over the
 * server's vocabulary, which lists 93 flavours and indexes almost none of them.
 */
export function hubFacetCounts(
    rows: readonly HubRecipe[],
    facet: HubFacet
): {value: string; count: number}[] {
    const counts = new Map<string, CountedValue>();
    let seen = 0;

    for (const row of rows) {
        const values = row[FACET_FIELD[facet]];
        for (const value of values as string[]) {
            const normalised = key(value);
            if (normalised === "") continue;

            let counted = counts.get(normalised);
            if (!counted) {
                counted = {count: 0, firstIndex: seen, spellings: new Map()};
                counts.set(normalised, counted);
            }

            counted.count += 1;
            const spellingKey = value.trim();
            const spelling = counted.spellings.get(spellingKey)
                ?? {value: spellingKey, count: 0};
            spelling.count += 1;
            counted.spellings.set(spellingKey, spelling);
            seen += 1;
        }
    }

    return [...counts.values()]
        .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex)
        .map((counted) => ({
            value: [...counted.spellings.values()]
                .sort((left, right) => right.count - left.count)[0].value,
            count: counted.count
        }));
}

/**
 * One page of one machine's partition.
 *
 * Carries no filters at all any more. The server's are measured not to work
 * (see the amendment), and every field sent to an undocumented endpoint is a
 * guess, so the only ones here are the four that are load bearing.
 */
export function buildHubRequest(model: MachineModel, pageIndex: number): HubPageRequest {
    return {
        pageIndex,
        pageSize: HUB_PAGE_SIZE,
        recipeType: 1,
        machineList: [machineCode(model)],
        sort: 1,
        sortType: 2
    };
}
