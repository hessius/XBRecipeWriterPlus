import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import StageTile from "@/components/StageTile";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {accents, palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function stage(volume = 96, temperature = 93): Pour {
    const pour = new Pour(1);
    pour.volume = volume;
    pour.temperature = temperature;
    pour.flowRate = 32;
    pour.pauseTime = 30;
    pour.pourPattern = POUR_PATTERN.SPIRAL;
    pour.agitation = 0;
    return pour;
}

const NOOP = {
    onToggle: jest.fn(),
    onChange: jest.fn(),
    onDelete: jest.fn()
};

describe("StageTile", () => {
    it("summarises the stage when closed", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );

        expect(screen.getByText("96")).toBeTruthy();
        expect(screen.getByText("93")).toBeTruthy();
    });

    it("says that it opens, and which state it is in", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );

        const tile = screen.getByLabelText("Stage 1 of 3");
        expect(tile.props.accessibilityRole).toBe("button");
        expect(tile.props.accessibilityState.expanded).toBe(false);
    });

    it("reports a tap", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={1} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByLabelText("Stage 2 of 3"));

        expect(onToggle).toHaveBeenCalledWith(1);
    });

    it("offers the controls when open", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );

        expect(screen.getByLabelText("Increase Stage volume")).toBeTruthy();
        expect(screen.getByLabelText("Increase Temperature")).toBeTruthy();
        expect(screen.getByLabelText("Increase Flow rate")).toBeTruthy();
        expect(screen.getByLabelText("Increase Pause")).toBeTruthy();
    });

    it("reports an edit against its own index", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={2} count={3} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(2, "temperature", 94);
    });

    it("steps flow rate in tenths and reports the byte the card takes", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onChange={onChange}/>
        );

        expect(screen.getByLabelText("Flow rate, 3.2")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Increase Flow rate"));

        expect(onChange).toHaveBeenCalledWith(0, "flowRate", 33);
    });

    it("agitates before and after independently", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onChange={onChange}/>
        );

        expect(screen.getByText("Agitation")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Agitate before"));
        expect(onChange).toHaveBeenCalledWith(0, "agitationBefore", 1);

        await fireEvent.press(screen.getByLabelText("Agitate after"));
        expect(onChange).toHaveBeenCalledWith(0, "agitationAfter", 1);
    });

    it("hides agitation for tea, which has none", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent={accents.coffee[1]} isTea {...NOOP}/>
        );

        expect(screen.queryByText("Agitation")).toBeNull();
    });

    it("offers to delete itself, but not when it is the only stage", async () => {
        const onDelete = jest.fn();
        const {rerender} = await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByLabelText("Delete stage 1"));
        expect(onDelete).toHaveBeenCalledWith(0);

        await rerender(
            <StageTile pour={stage()} index={0} count={1} open
                       accent={accents.coffee[1]} isTea={false} {...NOOP} onDelete={onDelete}/>
        );

        expect(screen.queryByLabelText("Delete stage 1")).toBeNull();
    });
});

describe("StageTile help", () => {
    const OPEN = {
        pour: stage(), index: 0, count: 3, open: true,
        accent: accents.coffee[1], isTea: false, ...NOOP
    };

    it("carries no help of its own, at any width", async () => {
        // A stage packs six controls into two columns. A marker beside each
        // caption dotted the tile with unanswered questions, and unfolding the
        // long form under the rows doubled the height of a tile that has to fit
        // on a phone next to the profile it is read against. Both were built and
        // both were removed; the words are in the help sheet.
        await renderWithProviders(<StageTile {...OPEN}/>);

        for (const title of ["Stage volume", "Pause", "Pattern", "Agitation"]) {
            expect(screen.queryByLabelText(`What is ${title}?`)).toBeNull();
        }
        expect(screen.queryByText(/The wait comes after the water/)).toBeNull();
        expect(screen.queryByText(/Centered holds the stream in one place/)).toBeNull();
    });

    it("keeps the full-width control groups out of the column's flex", async () => {
        await renderWithProviders(<StageTile {...OPEN}/>);

        // These two sit directly in the tile's column. In React Native `flex: 1`
        // also sets a flex basis of zero, so a row that asks for it in a column
        // asks to be nothing tall -- which drew the option pills as a sliver
        // that read like a progress bar. Asserted on the prop rather than on a
        // measured height, because the test renderer does no layout.
        for (const topic of ["pattern", "agitation"]) {
            const style = screen.getByTestId(`stage-group-${topic}`).props.style;
            const flat = (Array.isArray(style) ? style.flat() : [style]).filter(Boolean) as
                {flex?: unknown; alignSelf?: unknown}[];
            expect(flat.some((entry) => entry.flex !== undefined)).toBe(false);
            expect(flat.some((entry) => entry.alignSelf === "stretch")).toBe(true);
        }
    });

    it("keeps every control group across a redraw", async () => {
        // The tree has to keep its shape, not merely its contents. These rows
        // once returned a fragment in one branch and a stack in the other, which
        // changed the element type at that position and made React tear the
        // controls down and rebuild them. The branch is gone, so this now guards
        // against it coming back.
        const shape = () => ["volume", "flowRate", "pattern", "agitation"]
            .map((topic) => screen.queryByTestId(`stage-row-${topic}`) !== null);

        const {rerender} = await renderWithProviders(<StageTile {...OPEN}/>);
        expect(shape()).toEqual([true, true, true, true]);

        await rerender(<StageTile {...OPEN} accent={accents.coffee[3]}/>);
        expect(shape()).toEqual([true, true, true, true]);
        expect(screen.getByLabelText("CENTERED")).toBeTruthy();
        expect(screen.getByLabelText("Agitate before")).toBeTruthy();
    });

    it("never draws an always-on hint line", async () => {
        await renderWithProviders(<StageTile {...OPEN}/>);

        // The BREW deck's six-word note under every label. A stage packs six
        // controls into two columns and cannot afford it.
        expect(screen.queryByText(/How long the machine waits/)).toBeNull();
        expect(screen.queryByText(/The path the water takes/)).toBeNull();
    });
});

describe("StageTile in Fahrenheit", () => {
    it("shows the stage temperature in Fahrenheit", async () => {
        const pour = new Pour(1);
        pour.setTemperature(93);

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open={false} accent={palette.text}
                       isTea={false} temperatureUnit="F"
                       onToggle={() => {}} onChange={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText("199")).toBeTruthy();
        expect(screen.getByText("°F")).toBeTruthy();
        expect(screen.queryByText("93")).toBeNull();
    });

    it("shows the stage temperature in Celsius by default", async () => {
        const pour = new Pour(1);
        pour.setTemperature(93);

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open={false} accent={palette.text}
                       isTea={false}
                       onToggle={() => {}} onChange={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText("93")).toBeTruthy();
        expect(screen.getByText("°C")).toBeTruthy();
    });

    it("reports a Fahrenheit step back to the model in Celsius", async () => {
        const pour = new Pour(1);
        pour.setTemperature(93);
        const onChange = jest.fn();

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open accent={palette.text}
                       isTea={false} temperatureUnit="F"
                       onToggle={() => {}} onChange={onChange} onDelete={() => {}}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        // 93 °C is 199 °F; the next value on the ladder is 201 °F, which is 94 °C.
        expect(onChange).toHaveBeenCalledWith(0, "temperature", 94);
    });
});

describe("StageTile timing lane and glyphs", () => {
    it("shows the pattern glyph on the collapsed header", async () => {
        // Three numbers cannot convey rhythm. The glyph and the lane can.
        const pour = stage();
        pour.pourPattern = POUR_PATTERN.SPIRAL;
        const {getByLabelText} = await renderWithProviders(
            <StageTile pour={pour} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("draws the timing lane to real seconds", async () => {
        // 96 ml at 3.2 ml/s is 30 s of pouring against a 30 s pause: half the
        // lane each. A lane that drew nothing would pass a bare existence check.
        const {getByTestId} = await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );
        const lane = getByTestId("stage-lane");
        const widths = lane.children
            .flatMap((child) => typeof child === "string" ? [] : child.children)
            .flatMap((bar) => typeof bar === "string" ? [] : [bar.props.style?.width])
            .filter((w): w is number => typeof w === "number");
        expect(widths).toHaveLength(2);
        widths.forEach((w) => expect(w).toBeCloseTo(28, 1));
    });

    it("leaves a stage that has never been agitated unmarked", async () => {
        // A fresh Pour carries -1, and every bit of -1 is set: masking it
        // straight would mark both edges of a stage nobody has touched.
        const pour = stage();
        pour.agitation = -1;
        const {queryByTestId} = await renderWithProviders(
            <StageTile pour={pour} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );
        expect(queryByTestId("stage-agitation-before")).toBeNull();
        expect(queryByTestId("stage-agitation-after")).toBeNull();
    });

    it("shows a caret where the brew rung shows progress", async () => {
        // The one difference between the two, and it is what says this tile opens.
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );
        expect(getByTestId("stage-caret")).toBeTruthy();
        expect(queryByTestId("rung-fill")).toBeNull();
    });

    it("marks agitation on the edge where it happens", async () => {
        const pour = stage();
        pour.agitation = AGITATION.BEFORE_ON_AFTER_ON;
        const {getByTestId} = await renderWithProviders(
            <StageTile pour={pour} index={0} count={3} open={false}
                       accent={accents.coffee[1]} isTea={false} {...NOOP}/>
        );
        expect(getByTestId("stage-agitation-before")).toBeTruthy();
        expect(getByTestId("stage-agitation-after")).toBeTruthy();
    });
});
