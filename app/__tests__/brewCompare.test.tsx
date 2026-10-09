import React from "react";
import {fireEvent, within} from "@testing-library/react-native";
import {processColor} from "react-native";

import BrewCompareScreen from "@/app/brewCompare";
import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import {cupLineFor} from "@/constants/colors";
import {
    makeBrewRecordFixture,
    makeBrewRecordSamples,
    createBrewHistoryMock,
    createExpoRouterMock
} from "@/test-utils/brewRecordMocks";
import {renderWithProviders} from "@/test-utils/render";
import {planFromPours} from "@/library/brew/BrewRecord";
import {toPath} from "@/library/brew/brewShape";
import {compareTracePlotHeight} from "@/components/CompareTrace";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {referenceCupColour} from "@/library/brew/traceStyle";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

const {setParams} = createExpoRouterMock();
const {setRecords, setJudgementStore} = createBrewHistoryMock();

jest.mock("expo-router", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createExpoRouterMock();
});

jest.mock("@/hooks/useBrewHistory", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createBrewHistoryMock();
});

jest.mock("@/hooks/steadyRouter", () => ({
    back: jest.fn(),
    push: jest.fn()
}));

const comparisonPours = [
    new Pour(1, 125, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10),
    new Pour(2, 125, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10)
];
const comparisonPlan = planFromPours(comparisonPours);
const comparisonSamples = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 228_000, water: 250, cup: 244, pour: 2}
];

function rateSamples(rate: number) {
    return Array.from({length: 21}, (_, i) => {
        const seconds = i / 10;
        return {
            at: i * 100,
            water: rate * seconds,
            cup: rate * seconds,
            pour: 1
        };
    });
}

function shortRateSamples(rate: number) {
    return Array.from({length: 3}, (_, i) => {
        const seconds = i / 10;
        return {
            at: i * 100,
            water: rate * seconds,
            cup: rate * seconds,
            pour: 1
        };
    });
}

function isolatedRateSamples(rate: number) {
    return [0, 1_000, 60_000, 61_000].map((at) => {
        const seconds = at / 1000;
        return {
            at,
            water: rate * seconds,
            cup: rate * seconds,
            pour: 1
        };
    });
}

function pair(over: Parameters<typeof makeBrewRecordFixture>[0] = {}) {
    const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
    const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan, ...over});
    setRecords({
        a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
        b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
    });
    setParams({a: "a", b: "b"});
    return {a, b};
}

describe("the comparison screen", () => {
    beforeEach(() => {
        setRecords({});
        setJudgementStore(undefined);
        setParams({});
    });

    it("says the pours matched", async () => {
        pair();
        const {getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_COPY.same.chip)).toBeTruthy();
    });

    it("says they differed when they did", async () => {
        pair({waterTotal: 400});
        const {getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_COPY.differed.chip)).toBeTruthy();
    });

    it("opens overlaid", async () => {
        pair();
        const {getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("compare-lane-a")).toBeNull();
    });

    it("carries lane pauses, seconds and disconnected cup regions through both modes and swap",
        async () => {
            const a = makeBrewRecordFixture({
                id: "a", plan: [], waterTotal: 100,
                pauseIntervals: [{from: 2000, to: 8000, pour: 1, reason: "overflow"}]
            });
            const b = makeBrewRecordFixture({
                id: "b", plan: [], waterTotal: 100,
                pauseIntervals: [{from: 4000, to: 12000, pour: 1, reason: "manual"}]
            });
            const samples = [0, 2, 8, 10].map((t) =>
                ({at: t * 1000, water: t * 10, cup: t * 10, pour: 1}));
            setRecords({
                a: {record: a, samples},
                b: {record: b, samples: [
                    {at: 0, water: 0, cup: 0, pour: 1},
                    {at: 10000, water: 100, cup: 50, pour: 1}
                ]}
            });
            setParams({a: "a", b: "b"});
            const {getByTestId, getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
            const width = getByTestId("compare-trace-plot").props.width;
            const band = getByTestId("trace-pause-subject-overflow-0");
            expect(band.props.x).toBeCloseTo(width * 2 / 12);
            expect(band.props.width).toBeCloseTo(width * 6 / 12);
            const box = {width, height: compareTracePlotHeight(220), maxT: 12, maxV: 100};
            const polygons = [
                [{t: 0, v: 0}, {t: 2, v: 20}, {t: 2, v: 10}, {t: 0, v: 0}],
                [{t: 8, v: 80}, {t: 10, v: 100}, {t: 10, v: 50}, {t: 8, v: 40}]
            ];
            expect(getByTestId("trace-cup-gap").props.d)
                .toBe(polygons.map((run) => `${toPath(run, box)} Z`).join(" "));
            await fireEvent.press(getByLabelText("Show the brews separately"));
            const runs = [[0, 1, 2], [8, 9, 10]];
            function separatePath(sign: number): string {
                return runs.map((times) => {
                    const top = times.map((t) => ({t, v: 50 + sign * t * 5}));
                    const bottom = [...times].reverse().map((t) => ({t, v: 50}));
                    return `${toPath([...top, ...bottom], {...box, height: 34})} Z`;
                }).join(" ");
            }
            expect(getByTestId("compare-cup-gap-separate").props.d).toBe(separatePath(1));
            expect(within(getByTestId("compare-lane-a")).getByTestId("trace-pause-overflow-0"))
                .toBeTruthy();
            await fireEvent.press(getByLabelText("Swap which brew leads"));
            expect(getByTestId("compare-cup-gap-separate").props.d).toBe(separatePath(-1));
            expect(within(getByTestId("compare-lane-b")).getByTestId("trace-pause-overflow-0"))
                .toBeTruthy();
            await fireEvent.press(getByLabelText("Show the brews overlaid"));
            expect(getByLabelText("That brew: paused for overflow 6 seconds")).toBeTruthy();
            expect(getByLabelText("This brew: paused by you 8 seconds")).toBeTruthy();
            expect(getByTestId("trace-cup-gap").props.d).toBe(polygons.map((run) =>
                `${toPath([...run].reverse(), box)} Z`).join(" "));
        }
    );

    it("does not draw or extend a swept lane's pause in either mode", async () => {
        pair({
            hasStream: false,
            pauseIntervals: [{from: 2000, to: 500000, pour: 1, reason: "overflow"}]
        });
        const {getByTestId, queryByTestId, getByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(queryByTestId("trace-pause-reference-overflow-0")).toBeNull();
        expect(queryByTestId("trace-cup-gap")).toBeNull();
        const width = getByTestId("compare-trace-plot").props.width;
        expect(getByTestId("trace-cup-subject").props.d).toContain(`L${width} `);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(queryByTestId("compare-lane-b")).toBeNull();
        expect(queryByTestId("compare-cup-gap-separate")).toBeNull();
    });

    it("intersects overlapping automatic gaps in the rendered regions before and after swap",
        async () => {
            const a = makeBrewRecordFixture({
                id: "a", plan: [], waterTotal: 100,
                pauseIntervals: [{from: 2000, to: 8000, pour: 1, reason: "overflow"}]
            });
            const b = makeBrewRecordFixture({
                id: "b", plan: [], waterTotal: 100,
                pauseIntervals: [{from: 1000, to: 9000, pour: 1, reason: "overflow"}]
            });
            setRecords({
                a: {record: a, samples: [0, 2, 8, 10].map((t) =>
                    ({at: t * 1000, water: t * 10, cup: t * 10, pour: 1}))},
                b: {record: b, samples: [0, 1, 9, 10].map((t) =>
                    ({at: t * 1000, water: t * 10, cup: t * 5, pour: 1}))}
            });
            setParams({a: "a", b: "b"});
            const {getByTestId, getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
            const width = getByTestId("compare-trace-plot").props.width;
            const box = {width, height: compareTracePlotHeight(220), maxT: 10, maxV: 100};
            const polygons = [
                [{t: 0, v: 0}, {t: 1, v: 10}, {t: 1, v: 5}, {t: 0, v: 0}],
                [{t: 9, v: 90}, {t: 10, v: 100}, {t: 10, v: 50}, {t: 9, v: 45}]
            ];
            const separatePolygons = [
                [{t: 0, v: 50}, {t: 1, v: 55}, {t: 1, v: 50}, {t: 0, v: 50}],
                [{t: 9, v: 95}, {t: 10, v: 100}, {t: 10, v: 50}, {t: 9, v: 50}]
            ];
            expect(getByTestId("trace-cup-gap").props.d)
                .toBe(polygons.map((run) => `${toPath(run, box)} Z`).join(" "));
            await fireEvent.press(getByLabelText("Show the brews separately"));
            expect(getByTestId("compare-cup-gap-separate").props.d).toBe(
                separatePolygons.map((run) => `${toPath(run, {...box, height: 34})} Z`).join(" ")
            );
            await fireEvent.press(getByLabelText("Swap which brew leads"));
            expect(getByTestId("compare-cup-gap-separate").props.d).toBe(
                separatePolygons.map((run) => `${toPath(
                    run.map(({t, v}) => ({t, v: 100 - v})), {...box, height: 34}
                )} Z`).join(" ")
            );
            await fireEvent.press(getByLabelText("Show the brews overlaid"));
            expect(getByTestId("trace-cup-gap").props.d)
                .toBe(polygons.map((run) => `${toPath([...run].reverse(), box)} Z`).join(" "));
            expect(getByTestId("trace-pause-subject-overflow-0").props.width)
                .toBeCloseTo(width * 8 / 10);
            expect(getByTestId("trace-pause-reference-overflow-0").props.width)
                .toBeCloseTo(width * 6 / 10);
        }
    );

    it("announces the selected view mode", async () => {
        pair();
        const {getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByLabelText("Show the brews overlaid").props.accessibilityState)
            .toEqual({selected: true});
        expect(getByLabelText("Show the brews separately").props.accessibilityState)
            .toEqual({selected: false});

        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(getByLabelText("Show the brews overlaid").props.accessibilityState)
            .toEqual({selected: false});
        expect(getByLabelText("Show the brews separately").props.accessibilityState)
            .toEqual({selected: true});
    });

    it("splits into two lanes on the same axis", async () => {
        pair();
        const {getByTestId, getByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(getByTestId("compare-lane-a")).toBeTruthy();
        expect(getByTestId("compare-lane-b")).toBeTruthy();
        expect(getByTestId("compare-cup-gap-separate")).toBeTruthy();
    });

    it("draws a rate lane for each brew on one axis", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
        const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(rateSamples(2))},
            b: {record: b, samples: makeBrewRecordSamples(rateSamples(5))}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId, getByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);

        await fireEvent.press(getByLabelText("Show the brews separately"));

        const subjectCup = within(getByTestId("compare-rate-subject"))
            .getByTestId("rate-chart-cup");
        const referenceCup = within(getByTestId("compare-rate-reference"))
            .getByTestId("rate-chart-cup");
        // The subject's 2 G/S line sits 36.3 px down from the shared 5 G/S axis top.
        expect(subjectCup.props.d).toContain(" 36.3");
        expect(subjectCup.props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(cupLineFor(a.accent))}));
        expect(referenceCup.props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(referenceCupColour)}));
    });

    it("draws no rate lanes when one retained stream is too short to derive rate", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
        const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(rateSamples(2))},
            b: {record: b, samples: makeBrewRecordSamples(shortRateSamples(5))}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);

        await fireEvent.press(getByLabelText("Show the brews separately"));

        expect(getByTestId("compare-lane-a")).toBeTruthy();
        expect(getByTestId("compare-lane-b")).toBeTruthy();
        expect(queryByTestId("compare-rate-subject")).toBeNull();
        expect(queryByTestId("compare-rate-reference")).toBeNull();
    });

    it("draws no rate lanes when one retained rate series has no drawable run", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan, startedAt: 0});
        const b = makeBrewRecordFixture({
            id: "b",
            plan: comparisonPlan,
            startedAt: 3_600_000
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(isolatedRateSamples(2))},
            b: {record: b, samples: makeBrewRecordSamples(rateSamples(5))}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);

        await fireEvent.press(getByLabelText("Show the brews separately"));

        expect(getByTestId("compare-lane-a")).toBeTruthy();
        expect(getByTestId("compare-lane-b")).toBeTruthy();
        expect(queryByTestId("compare-rate-subject")).toBeNull();
        expect(queryByTestId("compare-rate-reference")).toBeNull();
        expect(getByLabelText(
            `This brew trace, ${formatBrewDate(0)} ${formatBrewTime(0)}`
        )).toBeTruthy();
        expect(getByLabelText(
            `That brew trace, ${formatBrewDate(3_600_000)} ${formatBrewTime(3_600_000)}`
        )).toBeTruthy();
    });

    it("returns to overlay after switching to separate", async () => {
        pair();
        const {getByTestId, queryByTestId, getByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(getByTestId("compare-lane-a")).toBeTruthy();
        await fireEvent.press(getByLabelText("Show the brews overlaid"));
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("compare-lane-a")).toBeNull();
    });

    it("draws one water line and says both when the pours matched", async () => {
        pair();
        const {getByTestId, queryByTestId, getByText} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_COPY.same.chip)).toBeTruthy();
        expect(getByTestId("trace-water-subject")).toBeTruthy();
        expect(queryByTestId("trace-water-reference")).toBeNull();
        expect(getByText("WATER, BOTH")).toBeTruthy();
    });

    it("swaps which brew leads", async () => {
        pair({waterTotal: 400});
        const {getByLabelText, getByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        const before = getByTestId("compare-a-WATER").props.children;
        await fireEvent.press(getByLabelText("Swap which brew leads"));
        expect(getByTestId("compare-a-WATER").props.children).not.toBe(before);
    });

    it("swaps the chart colours and lane labels", async () => {
        const a = makeBrewRecordFixture({
            id: "a",
            accent: "#C86A3B",
            startedAt: 0,
            plan: comparisonPlan
        });
        const b = makeBrewRecordFixture({
            id: "b",
            accent: "#3377AA",
            startedAt: 3_600_000,
            plan: comparisonPlan,
            waterTotal: 400
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(rateSamples(2))},
            b: {record: b, samples: makeBrewRecordSamples(rateSamples(3))}
        });
        setParams({a: "a", b: "b"});

        const {getByLabelText, getByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(within(getByTestId("compare-lane-a")).getByTestId("trace-cup").props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(cupLineFor("#C86A3B"))}));
        expect(getByLabelText(
            `This brew trace with flow rate, ${formatBrewDate(0)} ${formatBrewTime(0)}`
        )).toBeTruthy();
        expect(getByLabelText(
            `That brew trace with flow rate, ${formatBrewDate(3_600_000)} ${
                formatBrewTime(3_600_000)
            }`
        )).toBeTruthy();

        await fireEvent.press(getByLabelText("Swap which brew leads"));
        expect(within(getByTestId("compare-lane-a")).getByTestId("trace-cup").props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(cupLineFor("#3377AA"))}));
        expect(getByLabelText(
            `This brew trace with flow rate, ${formatBrewDate(3_600_000)} ${
                formatBrewTime(3_600_000)
            }`
        )).toBeTruthy();
        expect(getByLabelText(
            `That brew trace with flow rate, ${formatBrewDate(0)} ${formatBrewTime(0)}`
        )).toBeTruthy();
    });

    it("draws the survivor alone when one trace has been swept", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("trace-cup-reference")).toBeNull();
    });

    it("draws no rate lanes when only one brew kept its stream", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(rateSamples(2))},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);

        await fireEvent.press(getByLabelText("Show the brews separately"));

        expect(getByTestId("compare-lane-a")).toBeTruthy();
        expect(queryByTestId("compare-lane-b")).toBeNull();
        expect(queryByTestId("compare-rate-subject")).toBeNull();
        expect(queryByTestId("compare-rate-reference")).toBeNull();
    });

    it("draws the reference survivor when the subject trace has been swept", async () => {
        const a = makeBrewRecordFixture({id: "a", hasStream: false});
        const b = makeBrewRecordFixture({id: "b"});
        setRecords({
            a: {record: a, samples: []},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(queryByTestId("trace-cup-subject")).toBeNull();
        expect(getByTestId("trace-cup-reference")).toBeTruthy();
        expect(getByText("WATER, BOTH")).toBeTruthy();
    });

    it("can pin the surviving trace when the other one has been swept", async () => {
        const setPinned = jest.fn();
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setJudgementStore({setPinned});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Keep this trace"));
        expect(setPinned).toHaveBeenCalledWith("a", true);
    });

    it("keeps a trace without requiring the injected store to pin", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setJudgementStore({});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText, queryByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Keep this trace"));
        expect(queryByLabelText("Keep this trace")).toBeNull();
    });

    it("does not offer to keep a trace that is already pinned", async () => {
        const a = makeBrewRecordFixture({id: "a", pinned: true});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByText, queryByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(queryByLabelText("Keep this trace")).toBeNull();
    });

    it("falls back to the table when neither trace survived", async () => {
        const a = makeBrewRecordFixture({id: "a", hasStream: false});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: []},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.both)).toBeTruthy();
        expect(queryByTestId("compare-chart")).toBeNull();
        expect(getByTestId("compare-table")).toBeTruthy();
    });

    it("draws no rate lanes when neither brew kept its stream", async () => {
        const a = makeBrewRecordFixture({id: "a", hasStream: false});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: []},
            b: {record: b, samples: []}
        });
        setParams({a: "a", b: "b"});

        const {getByLabelText, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);

        await fireEvent.press(getByLabelText("Show the brews separately"));

        expect(queryByTestId("compare-rate-subject")).toBeNull();
        expect(queryByTestId("compare-rate-reference")).toBeNull();
    });

    it("says so rather than crashing when a brew has been deleted", async () => {
        setRecords({
            a: {
                record: makeBrewRecordFixture({id: "a"}),
                samples: makeBrewRecordSamples()
            }
        });
        setParams({a: "a", b: "gone"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-missing")).toBeTruthy();
    });

    it("warns when the two brews ran different plans", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
        const b = makeBrewRecordFixture({
            id: "b",
            plan: comparisonPlan.map((stage) => ({...stage, volume: stage.volume + 40}))
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples()},
            b: {record: b, samples: makeBrewRecordSamples()}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-drift")).toBeTruthy();
    });

    it("draws a shared plan from the reference when this brew has no stored plan", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId, queryByTestId, queryByText} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(queryByTestId("trace-plan-subject")).toBeNull();
        expect(getByTestId("trace-plan-reference")).toBeTruthy();
        expect(queryByText("PLAN, THAT")).toBeNull();
    });

    it("words plan drift without leaking field names", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
        const b = makeBrewRecordFixture({
            id: "b",
            plan: [
                ...comparisonPlan,
                {...comparisonPlan[0], pourNumber: 3}
            ]
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "b"});
        const {getByText, queryByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByText("The plans have different numbers of stages. Read the chart with care."))
            .toBeTruthy();
        expect(queryByText(/flowRate|pauseTime/)).toBeNull();
    });

    it("refuses to compare a brew with itself", async () => {
        const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "a"});
        const {getByTestId, getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-same-brew")).toBeTruthy();
        expect(getByText("Choose two different brews to compare. One brew can only repeat itself."))
            .toBeTruthy();
    });

    it("refuses to compare brews from different recipes", async () => {
        const a = makeBrewRecordFixture({id: "a", recipeUuid: "recipe-a", plan: comparisonPlan});
        const b = makeBrewRecordFixture({id: "b", recipeUuid: "recipe-b", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId, getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-different-recipes")).toBeTruthy();
        expect(getByText(
            "Choose two brews of the same recipe. Cross recipe comparison has no shared plan."
        )).toBeTruthy();
    });

    it("keeps each lane's pauses on that lane and shares one axis in seconds", async () => {
        const a = makeBrewRecordFixture({
            id: "a", plan: comparisonPlan,
            pauseIntervals: [{from: 20_000, to: 40_000, pour: 1, reason: "overflow"}]
        });
        const b = makeBrewRecordFixture({
            id: "b", plan: comparisonPlan,
            pauseIntervals: [{from: 100_000, to: 300_000, pour: 2, reason: "manual"}]
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples)},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples)}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText, getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));

        const laneA = within(getByTestId("compare-lane-a"));
        const laneB = within(getByTestId("compare-lane-b"));
        expect(laneA.getByTestId("trace-pause-overflow-0")).toBeTruthy();
        expect(laneA.queryByTestId("trace-pause-manual-0")).toBeNull();
        expect(laneB.getByTestId("trace-pause-manual-0")).toBeTruthy();
        expect(laneB.queryByTestId("trace-pause-overflow-0")).toBeNull();

        // B's pause ends at 300 s, past both streams, so the shared axis ends there.
        const widthA = Number(laneA.getByTestId("trace-pause-overflow-0").props.width);
        const bandB = laneB.getByTestId("trace-pause-manual-0");
        expect(widthA / 20).toBeCloseTo(Number(bandB.props.width) / 200, 4);
        expect(Number(bandB.props.x) + Number(bandB.props.width))
            .toBeCloseTo(300 * widthA / 20, 4);
    });
});
