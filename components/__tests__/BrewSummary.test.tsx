import React from "react";
import {StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {screen, within} from "@testing-library/react-native";

import BrewSummary from "@/components/BrewSummary";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

// The real ladder, wrapped so a test can see the band widths the summary hands
// it. RNTL performs no layout, so the thickness is only ever a prop here — but
// it is the prop that regressed: the summary drew #88's thin pre-caps.
let ladderProps: {barHeight?: unknown; rungGap?: unknown} = {};
jest.mock("@/components/BrewStageLadder", () => {
    const actual = jest.requireActual("@/components/BrewStageLadder");
    const Ladder = actual.default;
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            ladderProps = props;
            return Ladder(props);
        }
    };
});

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 60_000, water: 80, cup: 76, pour: 1}
];

async function draw(overrides: Partial<React.ComponentProps<typeof BrewSummary>> = {}) {
    return renderWithProviders(
        <BrewSummary
            recipeName="Ethiopia Guji"
            hasStream={true}
            samples={samples}
            stages={pours(2)}
            accent={palette.brand}
            width={390}
            plannedSeconds={120}
            water={250}
            cup={244}
            seconds={126}
            activeIndex={2}
            stageWater={[40, 40]}
            stalls={[[], []]}
            stagesUnavailable={false}
            {...overrides}
        />
    );
}

describe("BrewSummary", () => {
    it("draws the trace when the brew kept a stream", async () => {
        const {getByLabelText} = await draw({hasStream: true});
        expect(getByLabelText("Brew trace")).toBeTruthy();
    });

    it("shows NO TRACE KEPT when there is no stream", async () => {
        const {getByText, queryByLabelText} = await draw({hasStream: false});
        expect(getByText("NO TRACE KEPT")).toBeTruthy();
        expect(queryByLabelText("Brew trace")).toBeNull();
    });

    it("draws the ladder when stages are available", async () => {
        const {getByTestId} = await draw({stagesUnavailable: false});
        expect(getByTestId("ladder")).toBeTruthy();
    });

    it("shows the deleted-recipe note and no ladder when stages are unavailable", async () => {
        const {getByText, queryByTestId} = await draw({stagesUnavailable: true});
        expect(getByText(/recipe deleted/i)).toBeTruthy();
        expect(queryByTestId("ladder")).toBeNull();
    });

    it("renders the recipe name inside the captured subtree", async () => {
        await draw({recipeName: "Ethiopia Guji"});
        const capture = within(screen.getByTestId("brew-capture"));
        expect(capture.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("pads the captured area so the exported PNG has a margin", async () => {
        const {getByTestId} = await draw();
        const style = StyleSheet.flatten(
            getByTestId("brew-capture").props.style as StyleProp<ViewStyle>
        );
        expect(style?.backgroundColor).toBe(palette.base);
        // Screen padding (18) plus the export margin (12), pinned as a literal
        // so shrinking CAPTURE_MARGIN to 0 fails this test.
        expect(style?.padding).toBe(30);
    });

    it("draws the ladder with the thick, content-sized bands, not the old thin literals", async () => {
        // The bug: the summary drew barHeight 11 / rungGap 8 — the pre-#88
        // values — so a brew watched live with thick bars reopened from history
        // thin. Pinned as integer literals: asserting against SUMMARY_BANDS
        // would still pass if the caps it derives from went to zero.
        await draw({stagesUnavailable: false});
        expect(ladderProps.barHeight).toBe(28);
        expect(ladderProps.rungGap).toBe(20);
    });

    it("says when the machine ended the brew early", async () => {
        const r = await draw({note: "ENDED ON THE MACHINE"});

        expect(r.getByText("ENDED ON THE MACHINE")).toBeTruthy();
    });

    it("says nothing at all when the brew went to plan", async () => {
        const r = await draw({});

        expect(r.queryByTestId("brew-summary-note")).toBeNull();
    });
});
