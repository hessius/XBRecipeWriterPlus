import React from "react";
import {processColor, StyleSheet} from "react-native";

import BrewStageRung, {SEGMENT_GAP} from "@/components/BrewStageRung";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = palette.brand;

function stage(volume = 70, pause = 20): Pour {
    return new Pour(1, volume, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, pause);
}

async function draw(overrides: Partial<React.ComponentProps<typeof BrewStageRung>> = {}) {
    return renderWithProviders(
        <BrewStageRung
            pour={stage()}
            index={0}
            state="pending"
            accent={ACCENT}
            laneSeconds={40}
            barHeight={11}
            delivered={0}
            pauseElapsed={0}
            stalls={[]}
            {...overrides}
        />
    );
}

describe("BrewStageRung", () => {
    it("numbers the stage from one, padded", async () => {
        const {getByText} = await draw({index: 8});

        expect(getByText("09")).toBeTruthy();
    });

    it("shows the stage temperature", async () => {
        const {getByText} = await draw({pour: new Pour(
            1, 70, 92, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20
        )});

        expect(getByText("92°")).toBeTruthy();
    });

    it("shows the pattern glyph", async () => {
        const {getByLabelText} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.SPIRAL, 20
        )});

        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("gives the lane the whole row rather than a fixed width", async () => {
        const {getByTestId} = await draw();

        expect(getByTestId("rung-lane").props.style).toEqual(
            expect.objectContaining({flex: 1})
        );
    });

    it("is dimmed before the stage happens", async () => {
        const {getByTestId} = await draw({testID: "rung"});

        expect(getByTestId("rung").props.style).toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });

    it("fills the water segment by millilitres, not by time", async () => {
        const {getByTestId} = await draw({state: "active", delivered: 35});

        // The lane is 40 s wide; a clean 70 ml stage pours for 17.5 s of it.
        // Half delivered is half of that segment lit.
        expect(getByTestId("segment-fill-0").props.style.flex).toBeCloseTo(0.5);
    });

    it("counts millilitres while pouring", async () => {
        const {getByText} = await draw({state: "active", delivered: 41});

        expect(getByText("41/70 ml")).toBeTruthy();
    });

    it("counts down seconds while resting, because millilitres have stopped moving", async () => {
        const {getByText} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        expect(getByText("14 s left")).toBeTruthy();
    });

    it("shows what it poured, not a countdown, once the stage is done", async () => {
        // The resting branch used to be chosen on delivered-versus-target
        // alone, with no reference to the state. A finished stage is handed
        // pauseElapsed 0, so every completed rung of every brew in history
        // read "20 s left" — a stage that ended last week, still counting.
        const {getByText} = await draw({state: "done", delivered: 70});

        expect(getByText("70/70 ml")).toBeTruthy();
    });

    it("changes texture, not colour, for a planned rest", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        // The pause segment uses hatch stripes, not a solid fill.
        expect(getByTestId("segment-1").props.style.borderStyle).toBe("dashed");
        expect(getByTestId("segment-hatch-1-dim")).toBeTruthy();
    });

    it("changes colour, not texture, where it held", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("keeps the stall bands after the stage is done", async () => {
        const {getByTestId} = await draw({
            state: "done", delivered: 70, pauseElapsed: 20,
            stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("puts the agitation mark on the leading edge for agitation before", async () => {
        const {getByTestId, queryByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_ON_AFTER_OFF, POUR_PATTERN.CENTERED, 20
        )});

        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(queryByTestId("rung-agitation-after")).toBeNull();
    });

    it("cuts the before mark through the bar, exactly as the after mark", async () => {
        // It used to be a bare glyph in a zero-width box, vertically centred
        // inside the first segment: accent on accent fill, so a stage that had
        // begun pouring hid it entirely and a recipe agitating before and after
        // appeared to agitate only after.
        const {getByTestId} = await draw({
            state: "active", delivered: 70,
            pour: new Pour(
                1, 70, 93, 40, AGITATION.BEFORE_ON_AFTER_OFF, POUR_PATTERN.CENTERED, 20
            )
        });

        const style = StyleSheet.flatten(
            getByTestId("rung-agitation-before-notch").props.style
        );
        expect(style.backgroundColor).toBe("#FF007F");
        expect(style.width).toBe(2);
    });

    it("draws the two marks identically", async () => {
        const {getByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        expect(StyleSheet.flatten(getByTestId("rung-agitation-before").props.style))
            .toEqual(StyleSheet.flatten(getByTestId("rung-agitation-after").props.style));
    });

    it("centres the after mark in the gap between the water and the wait", async () => {
        // Not a percentage of the lane. The gaps are fixed points taken out of
        // the lane, so a fraction of the whole width lands beside the seam
        // rather than on it, by however many gaps precede it.
        const {getByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        const style = StyleSheet.flatten(
            getByTestId("rung-agitation-after").props.style
        );
        expect(style.position).toBe("absolute");
        // A two-point notch centred in the three-point gap.
        expect(style.left).toBe(0.5);
        expect(style.width).toBe(2);
    });

    it("cuts the notch through the bar in the accent colour", async () => {
        const {getByTestId} = await draw({
            state: "active",
            pour: new Pour(
                1, 70, 93, 40, AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
            )
        });

        const style = StyleSheet.flatten(
            getByTestId("rung-agitation-after-notch").props.style
        );
        expect(style.backgroundColor).toBe("#FF007F");
        expect(style.width).toBe(2);
    });

    it("stands the notch three points proud of the bar", async () => {
        const {getByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        const style = StyleSheet.flatten(
            getByTestId("rung-agitation-after").props.style
        );
        expect(style.bottom).toBe(-3);
        // The glyph sits on top of the notch, so the mark reaches further up.
        expect(style.top).toBe(-14);
    });

    it("draws the notch before the slack, not past it", async () => {
        const {getByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        // Walk the rendered lane rather than the element's children: the
        // segments and their gaps are wrapped, so reading `props.children`
        // finds neither and the ordering would hold vacuously.
        const ids: string[] = [];
        const walk = (node: {props?: {testID?: string}; children?: unknown[]}) => {
            if (node.props?.testID !== undefined) ids.push(node.props.testID);
            (node.children ?? []).forEach((child) => {
                if (typeof child === "object" && child !== null) {
                    walk(child as {props?: {testID?: string}; children?: unknown[]});
                }
            });
        };
        walk(getByTestId("rung-lane") as unknown as {children?: unknown[]});
        expect(ids).toContain("rung-agitation-after");
        expect(ids.indexOf("rung-agitation-after"))
            .toBeLessThan(ids.indexOf("rung-slack"));
    });

    it("puts the agitation mark on the trailing edge for agitation after", async () => {
        const {getByTestId, queryByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        expect(getByTestId("rung-agitation-after")).toBeTruthy();
        expect(queryByTestId("rung-agitation-before")).toBeNull();
    });

    it("puts agitation marks on both edges when both are on", async () => {
        const {getByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )});

        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(getByTestId("rung-agitation-after")).toBeTruthy();
    });

    it("does not draw agitation marks when agitation is off", async () => {
        const {queryByTestId} = await draw({pour: new Pour(
            1, 70, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20
        )});

        expect(queryByTestId("rung-agitation-before")).toBeNull();
        expect(queryByTestId("rung-agitation-after")).toBeNull();
    });

    it("says the whole stage in one sentence for VoiceOver", async () => {
        const {getByLabelText} = await draw();

        expect(getByLabelText(/Stage 01, centred pour, 93 degrees, 70 millilitres/))
            .toBeTruthy();
    });

    it("says where it held, for VoiceOver", async () => {
        const {getByLabelText} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByLabelText(/held once, 9 seconds/)).toBeTruthy();
    });

    /**
     * The lane is `flex: 1` and the readout beside it is sized by its text. The
     * text changes on almost every frame -- `70 ml`, `0/70 ml`, `41/70 ml`,
     * `14 s left` -- so the lane's right edge moved with it, and the whole
     * ladder wiggled a few pixels as stages began and filled.
     *
     * The cure is to reserve the widest reading and draw the current one over
     * it, which costs nothing and does not depend on the font's metrics.
     */
    it("reserves the same width whatever the readout currently says", async () => {
        const widths: string[] = [];
        for (const props of [
            {state: "pending" as const, delivered: 0, pauseElapsed: 0},
            {state: "active" as const, delivered: 0, pauseElapsed: 0},
            {state: "active" as const, delivered: 41, pauseElapsed: 0},
            {state: "active" as const, delivered: 70, pauseElapsed: 6},
            {state: "done" as const, delivered: 70, pauseElapsed: 0}
        ]) {
            const r = await draw(props);
            // Hidden twice over: the reserve is transparent, and the rung is a
            // single accessible element -- so the query has to be told to look.
            widths.push(String(r.getByTestId(
                "rung-readout-reserve", {includeHiddenElements: true}
            ).props.children));
        }

        expect(new Set(widths).size).toBe(1);
        // And it is at least as wide as the widest thing it has to hold.
        expect(widths[0].length).toBeGreaterThanOrEqual("70/70 ml".length);
    });

    it("never paints a wait the same as the water beside it", async () => {
        // The original fault: `rungGeometry` distinguished the two and the paint
        // threw the distinction away, so an active stage read as one long bar.
        const {getByTestId, queryByTestId} =
            await draw({state: "active", delivered: 40, pauseElapsed: 0});

        expect(getByTestId("segment-fill-0")).toBeTruthy();
        expect(queryByTestId("segment-fill-1")).toBeNull();
        expect(getByTestId("segment-hatch-1-dim")).toBeTruthy();
    });

    it("shows a wait faintly before it has begun", async () => {
        const {getByTestId, queryByTestId} =
            await draw({state: "pending", delivered: 0, pauseElapsed: 0});

        expect(getByTestId("segment-hatch-1-dim")).toBeTruthy();
        expect(queryByTestId("segment-hatch-1-bright")).toBeNull();
    });

    it("brightens the stripes as the wait elapses", async () => {
        const {getByTestId} =
            await draw({state: "active", delivered: 70, pauseElapsed: 10});

        expect(getByTestId("segment-hatch-1-bright")).toBeTruthy();
    });

    it("paints the faint stripes differently from the bright ones", async () => {
        const {getByTestId} =
            await draw({state: "active", delivered: 70, pauseElapsed: 10});

        // Read the colours off the pattern strokes, not off the rects: a rect's
        // `fill` is a brush that only names its pattern, so comparing two rects
        // compares two names that always differ.
        const strokeOf = (id: string) =>
            (getByTestId(id).props.stroke as {payload: number}).payload;

        expect(strokeOf("segment-hatch-1-dim-stroke"))
            .not.toBe(strokeOf("segment-hatch-1-bright-stroke"));
        expect(strokeOf("segment-hatch-1-bright-stroke"))
            .toBe(processColor(ACCENT));
    });

    it("leaves a gap between one segment and the next", async () => {
        const {getByTestId} =
            await draw({state: "active", delivered: 40, pauseElapsed: 0});

        // Pinned to the literal rather than to SEGMENT_GAP: comparing the
        // margin against the very constant that sets it passes whatever that
        // constant is, including zero, which is the case worth catching.
        expect(SEGMENT_GAP).toBe(3);
        // The gap is its own item now, not a margin: an agitation mark takes
        // that slot when there is one, so the mark lands in the gap by
        // construction rather than by arithmetic over the lane's width.
        const gap = StyleSheet.flatten(getByTestId("gap-1").props.style) as {width?: number};
        expect(gap.width).toBe(SEGMENT_GAP);
        expect(SEGMENT_GAP).toBe(3);
    });
});
