import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";

export type BrewRecordOpenResult =
    {record: StoredBrew; samples: BrewSample[]; frames?: string} | null;

export const brewRecordFixture: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

export const brewRecordSamples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1}
];

export function createExpoRouterMock({
    push,
    back,
    setOptions,
    params
}: {
    push: (...args: unknown[]) => unknown;
    back: () => unknown;
    setOptions: (...args: unknown[]) => unknown;
    params: () => {id?: string; latest?: string};
}) {
    return {
        router: {push, back},
        useLocalSearchParams: params,
        useNavigation: () => ({setOptions})
    };
}

export function createBrewHistoryMock({
    brews,
    opened,
    judgementStore
}: {
    brews: () => StoredBrew[];
    opened: () => BrewRecordOpenResult;
    /**
     * What `sharedBrewDatabase()` hands back. Supplied by a test that wants to
     * see the writes; left out by one that only needs the screen to render.
     */
    judgementStore?: () => unknown;
}) {
    return {
        useBrewHistory: () => ({
            brews: brews(),
            remove: () => undefined,
            open: () => opened()
        }),
        // The real judgement hook over whatever store the test supplies. The
        // screen's seeding, its local state and the write-through are the
        // things under test, and reimplementing them here would be testing the
        // mock. Every consumer gets it, because the screen calls it whether or
        // not a given test is looking at it.
        useBrewJudgement: jest.requireActual<typeof import("@/hooks/useBrewHistory")>(
            "@/hooks/useBrewHistory"
        ).useBrewJudgement,
        sharedBrewDatabase: () => (judgementStore === undefined ? {} : judgementStore())
    };
}
