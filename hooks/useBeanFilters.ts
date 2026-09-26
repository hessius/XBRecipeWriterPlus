import {useState} from "react";

import {
    beanFilterId,
    parseBeanFilterId,
    type BeanFilter
} from "@/library/beanFilters";
import type {BeanVocabularyEntry} from "@/library/BrewDatabase";
import {sharedBrewDatabase} from "@/hooks/useBrewHistory";

export type BeanVocabularyStore = {
    beanVocabulary: () => BeanVocabularyEntry[];
};

type Props = {
    filters: readonly string[];
    applyFilters: (update: (current: readonly string[]) => string[]) => void;
    store?: BeanVocabularyStore;
};

function beanFiltersOf(filters: readonly string[]): string[] {
    return filters.filter((id) => parseBeanFilterId(id) !== null);
}

function parsedFilters(filters: readonly string[]): BeanFilter[] {
    return filters.flatMap((id) => {
        const parsed = parseBeanFilterId(id);
        return parsed === null ? [] : [parsed];
    });
}

function agreedRatedOnly(filters: readonly string[]): boolean | null {
    const parsed = parsedFilters(filters);
    if (parsed.length === 0) return null;
    const first = parsed[0].rated;
    return parsed.every((filter) => filter.rated === first) ? first : false;
}

function rewriteRated(filters: readonly string[], rated: boolean): string[] {
    return filters.map((id) => {
        const parsed = parseBeanFilterId(id);
        return parsed === null ? id : beanFilterId({...parsed, rated});
    });
}

function replaceBeanFilters(current: readonly string[], nextBeans: readonly string[]): string[] {
    const firstBean = current.findIndex((id) => parseBeanFilterId(id) !== null);
    const withoutBeans = current.filter((id) => parseBeanFilterId(id) === null);
    if (firstBean < 0) return [...withoutBeans, ...nextBeans];

    const before = current.slice(0, firstBean)
        .filter((id) => parseBeanFilterId(id) === null);
    const after = current.slice(firstBean)
        .filter((id) => parseBeanFilterId(id) === null);
    return [...before, ...nextBeans, ...after];
}

/**
 * The library rail's bean picker state.
 *
 * The vocabulary is read once, in the lazy initialiser, because it is a
 * database read and there is no event on the home screen that changes it while
 * the screen is mounted. The selected rows are derived from the applied
 * filters on every render, so reopening the sheet reports the query as it is
 * rather than the last switch position the sheet happened to hold.
 */
export function useBeanFilters({filters, applyFilters, store}: Props) {
    const [vocabulary] = useState<BeanVocabularyEntry[]>(
        () => (store ?? sharedBrewDatabase()).beanVocabulary()
    );
    const [emptyRatedOnly, setEmptyRatedOnly] = useState(false);

    const selected = beanFiltersOf(filters);
    const agreed = agreedRatedOnly(selected);
    const ratedOnly = agreed === null ? emptyRatedOnly : agreed;

    function setRatedOnly(value: boolean) {
        setEmptyRatedOnly(value);
        applyFilters((current) => rewriteRated(current, value));
    }

    function setValues(ids: string[]) {
        applyFilters((current) => replaceBeanFilters(current, ids));
    }

    return {
        vocabulary,
        selected,
        ratedOnly,
        setRatedOnly,
        setValues,
        active: selected.length > 0
    };
}

export default useBeanFilters;
