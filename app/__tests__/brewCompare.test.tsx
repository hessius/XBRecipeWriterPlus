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
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
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

function pair(over: Parameters<typeof makeBrewRecordFixture>[0] = {}) {
    const a = makeBrewRecordFixture({id: "a", plan: comparisonPlan});
    const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan, ...over});
    setRecords({
        a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
        b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
        });
        setParams({a: "a", b: "b"});

        const {getByLabelText, getByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(within(getByTestId("compare-lane-a")).getByTestId("trace-cup").props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(cupLineFor("#C86A3B"))}));
        expect(getByLabelText(
            `This brew trace, ${formatBrewDate(0)} ${formatBrewTime(0)}`
        )).toBeTruthy();

        await fireEvent.press(getByLabelText("Swap which brew leads"));
        expect(within(getByTestId("compare-lane-a")).getByTestId("trace-cup").props.stroke)
            .toEqual(expect.objectContaining({payload: processColor(cupLineFor("#3377AA"))}));
        expect(getByLabelText(
            `This brew trace, ${formatBrewDate(3_600_000)} ${formatBrewTime(3_600_000)}`
        )).toBeTruthy();
    });

    it("draws the survivor alone when one trace has been swept", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("trace-cup-reference")).toBeNull();
    });

    it("draws the reference survivor when the subject trace has been swept", async () => {
        const a = makeBrewRecordFixture({id: "a", hasStream: false});
        const b = makeBrewRecordFixture({id: "b"});
        setRecords({
            a: {record: a, samples: [], frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: [], frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: [], frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: [], frames: ""}
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
            a: {record: a, samples: [], frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.both)).toBeTruthy();
        expect(queryByTestId("compare-chart")).toBeNull();
        expect(getByTestId("compare-table")).toBeTruthy();
    });

    it("says so rather than crashing when a brew has been deleted", async () => {
        setRecords({
            a: {
                record: makeBrewRecordFixture({id: "a"}),
                samples: makeBrewRecordSamples(),
                frames: ""
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
            a: {record: a, samples: makeBrewRecordSamples(), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(), frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-drift")).toBeTruthy();
    });

    it("draws a shared plan from the reference when this brew has no stored plan", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", plan: comparisonPlan});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
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
            a: {record: a, samples: makeBrewRecordSamples(comparisonSamples), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(comparisonSamples), frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId, getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-different-recipes")).toBeTruthy();
        expect(getByText(
            "Choose two brews of the same recipe. Cross recipe comparison has no shared plan."
        )).toBeTruthy();
    });
});
