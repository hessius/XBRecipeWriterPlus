import React from "react";
import {fireEvent} from "@testing-library/react-native";

import BrewCompareScreen from "@/app/brewCompare";
import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import {
    makeBrewRecordFixture,
    makeBrewRecordSamples,
    createBrewHistoryMock,
    createExpoRouterMock
} from "@/test-utils/brewRecordMocks";
import {renderWithProviders} from "@/test-utils/render";

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

function pair(over: Parameters<typeof makeBrewRecordFixture>[0] = {}) {
    const a = makeBrewRecordFixture({id: "a"});
    const b = makeBrewRecordFixture({id: "b", ...over});
    setRecords({
        a: {record: a, samples: makeBrewRecordSamples(), frames: ""},
        b: {record: b, samples: makeBrewRecordSamples(), frames: ""}
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

    it("splits into two lanes on the same axis", async () => {
        pair();
        const {getByTestId, getByLabelText} =
            await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        expect(getByTestId("compare-lane-a")).toBeTruthy();
        expect(getByTestId("compare-lane-b")).toBeTruthy();
    });

    it("swaps which brew leads", async () => {
        pair({waterTotal: 400});
        const {getByLabelText, getByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        const before = getByTestId("compare-a-WATER").props.children;
        await fireEvent.press(getByLabelText("Swap the two brews"));
        expect(getByTestId("compare-a-WATER").props.children).not.toBe(before);
    });

    it("draws the survivor alone when one trace has been swept", async () => {
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(), frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("trace-cup-reference")).toBeNull();
    });

    it("can pin the surviving trace when the other one has been swept", async () => {
        const setPinned = jest.fn();
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({id: "b", hasStream: false});
        setJudgementStore({setPinned});
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(), frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Keep this trace"));
        expect(setPinned).toHaveBeenCalledWith("a", true);
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
        const a = makeBrewRecordFixture({id: "a"});
        const b = makeBrewRecordFixture({
            id: "b",
            plan: (a.plan ?? []).map((stage) => ({...stage, volume: stage.volume + 40}))
        });
        setRecords({
            a: {record: a, samples: makeBrewRecordSamples(), frames: ""},
            b: {record: b, samples: makeBrewRecordSamples(), frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-drift")).toBeTruthy();
    });
});
