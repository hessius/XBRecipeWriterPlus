import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {planFromPours} from "@/library/brew/BrewRecord";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

export type BrewRecordOpenResult =
    {record: StoredBrew; samples: BrewSample[]; frames?: string} | null;

const fixturePours = [
    new Pour(1, 125, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10),
    new Pour(2, 125, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10)
];

export const brewRecordFixture: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    plan: planFromPours(fixturePours),
    hasStream: true
};

export function makeBrewRecordFixture(over: Partial<StoredBrew> = {}): StoredBrew {
    return {...brewRecordFixture, ...over};
}

export const brewRecordSamples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 228_000, water: 250, cup: 244, pour: 2}
];

export function makeBrewRecordSamples(over?: BrewSample[]): BrewSample[] {
    return [...(over ?? brewRecordSamples)];
}

type ExpoRouterParams = {id?: string; latest?: string; a?: string; b?: string};

let defaultParams: ExpoRouterParams = {};

export function createExpoRouterMock(config?: {
    push: (...args: unknown[]) => unknown;
    back: () => unknown;
    setOptions: (...args: unknown[]) => unknown;
    params: () => ExpoRouterParams;
}) {
    let currentParams: ExpoRouterParams = defaultParams;
    const push = config?.push ?? jest.fn();
    const back = config?.back ?? jest.fn();
    const setOptions = config?.setOptions ?? jest.fn();
    const params = config?.params ?? (() => defaultParams);
    return {
        router: {push, back},
        useLocalSearchParams: params,
        useNavigation: () => ({setOptions}),
        setParams: (next: ExpoRouterParams) => {
            currentParams = next;
            if (config === undefined) defaultParams = next;
        },
        push,
        back,
        setOptions
    };
}

let defaultRecords: Record<string, Exclude<BrewRecordOpenResult, null>> = {};
let defaultJudgementStore: unknown;

export function createBrewHistoryMock(config?: {
    brews: () => StoredBrew[];
    opened: () => BrewRecordOpenResult;
    /**
     * What `sharedBrewDatabase()` hands back. Supplied by a test that wants to
     * see the writes; left out by one that only needs the screen to render.
     */
    judgementStore?: () => unknown;
}) {
    let records: Record<string, Exclude<BrewRecordOpenResult, null>> = defaultRecords;
    const brews = config?.brews ?? (() => Object.values(defaultRecords).map(({record}) => record));
    const opened = config?.opened ?? (() => null);
    const judgementStore = config?.judgementStore ?? (() => defaultJudgementStore);
    return {
        useBrewHistory: () => ({
            brews: brews(),
            remove: () => undefined,
            open: (id: string) => (config === undefined ? defaultRecords : records)[id]
                ?? opened(),
            refresh: () => undefined,
            clear: () => undefined
        }),
        // The real judgement hook over whatever store the test supplies. The
        // screen's seeding, its local state and the write-through are the
        // things under test, and reimplementing them here would be testing the
        // mock. Every consumer gets it, because the screen calls it whether or
        // not a given test is looking at it.
        useBrewJudgement: jest.requireActual<typeof import("@/hooks/useBrewHistory")>(
            "@/hooks/useBrewHistory"
        ).useBrewJudgement,
        sharedBrewDatabase: () => (judgementStore === undefined ? {} : judgementStore()),
        setRecords: (next: Record<string, Exclude<BrewRecordOpenResult, null>>) => {
            records = next;
            if (config === undefined) defaultRecords = next;
        },
        setJudgementStore: (next: unknown) => {
            if (config === undefined) defaultJudgementStore = next;
        }
    };
}
