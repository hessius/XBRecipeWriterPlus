import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import StageTile from "@/components/StageTile";
import Pour, {POUR_PATTERN} from "@/library/Pour";
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
                       accent="#F0B98E" isTea={false} {...NOOP}/>
        );

        expect(screen.getByText("96")).toBeTruthy();
        expect(screen.getByText("93")).toBeTruthy();
    });

    it("says that it opens, and which state it is in", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open={false}
                       accent="#F0B98E" isTea={false} {...NOOP}/>
        );

        const tile = screen.getByLabelText("Stage 1 of 3");
        expect(tile.props.accessibilityRole).toBe("button");
        expect(tile.props.accessibilityState.expanded).toBe(false);
    });

    it("reports a tap", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={1} count={3} open={false}
                       accent="#F0B98E" isTea={false} {...NOOP} onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByLabelText("Stage 2 of 3"));

        expect(onToggle).toHaveBeenCalledWith(1);
    });

    it("offers the controls when open", async () => {
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent="#F0B98E" isTea={false} {...NOOP}/>
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
                       accent="#F0B98E" isTea={false} {...NOOP} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(2, "temperature", 94);
    });

    it("steps flow rate in tenths and reports the byte the card takes", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent="#F0B98E" isTea={false} {...NOOP} onChange={onChange}/>
        );

        expect(screen.getByLabelText("Flow rate, 3.2")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Increase Flow rate"));

        expect(onChange).toHaveBeenCalledWith(0, "flowRate", 33);
    });

    it("agitates before and after independently", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent="#F0B98E" isTea={false} {...NOOP} onChange={onChange}/>
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
                       accent="#F0B98E" isTea {...NOOP}/>
        );

        expect(screen.queryByText("Agitation")).toBeNull();
    });

    it("offers to delete itself, but not when it is the only stage", async () => {
        const onDelete = jest.fn();
        const {rerender} = await renderWithProviders(
            <StageTile pour={stage()} index={0} count={3} open
                       accent="#F0B98E" isTea={false} {...NOOP} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByLabelText("Delete stage 1"));
        expect(onDelete).toHaveBeenCalledWith(0);

        await rerender(
            <StageTile pour={stage()} index={0} count={1} open
                       accent="#F0B98E" isTea={false} {...NOOP} onDelete={onDelete}/>
        );

        expect(screen.queryByLabelText("Delete stage 1")).toBeNull();
    });
});

describe("StageTile help", () => {
    const OPEN = {
        pour: stage(), index: 0, count: 3, open: true,
        accent: "#F0B98E", isTea: false, ...NOOP
    };

    it("offers no help at all when the tile is closed", async () => {
        await renderWithProviders(
            <StageTile {...OPEN} open={false} helpStyle="markers" onHelp={jest.fn()}/>
        );

        expect(screen.queryByLabelText("What is Pause?")).toBeNull();
    });

    it("hangs a marker off every control that has a long form", async () => {
        const onHelp = jest.fn();
        await renderWithProviders(
            <StageTile {...OPEN} helpStyle="markers" onHelp={onHelp}/>
        );

        for (const title of ["Stage volume", "Pause", "Pattern", "Agitation"]) {
            expect(screen.getByLabelText(`What is ${title}?`)).toBeTruthy();
        }

        await fireEvent.press(screen.getByLabelText("What is Pause?"));
        expect(onHelp).toHaveBeenCalledWith("pause");
    });

    it("leaves the controls that have nothing more to say unmarked", async () => {
        await renderWithProviders(
            <StageTile {...OPEN} helpStyle="markers" onHelp={jest.fn()}/>
        );

        // Temperature and flow rate are a range and nothing else: the caption
        // already is the whole story, so a marker would open a sheet repeating
        // the words beside it.
        expect(screen.queryByLabelText("What is Temperature?")).toBeNull();
        expect(screen.queryByLabelText("What is Flow rate?")).toBeNull();
    });

    it("shows no marker and no prose under markers-off, explain-off", async () => {
        await renderWithProviders(<StageTile {...OPEN} helpStyle="explain" onHelp={jest.fn()}/>);

        expect(screen.queryByLabelText("What is Pause?")).toBeNull();
        expect(screen.queryByText(/The wait comes after the water/)).toBeNull();
    });

    it("unfolds the long form under the row while explaining", async () => {
        await renderWithProviders(
            <StageTile {...OPEN} helpStyle="explain" explaining onHelp={jest.fn()}/>
        );

        expect(screen.getByText(/The wait comes after the water/)).toBeTruthy();
        expect(screen.getByText(/Centered holds the stream in one place/)).toBeTruthy();
        // Explain mode replaces the markers rather than joining them: the words
        // are already on screen, so a button to open them again is noise.
        expect(screen.queryByLabelText("What is Pause?")).toBeNull();
    });

    it("never draws an always-on hint line", async () => {
        await renderWithProviders(
            <StageTile {...OPEN} helpStyle="markers" onHelp={jest.fn()}/>
        );

        // The BREW deck's six-word note under every label. A stage packs six
        // controls into two columns and cannot afford it.
        expect(screen.queryByText(/How long the machine waits/)).toBeNull();
        expect(screen.queryByText(/The path the water takes/)).toBeNull();
    });
});
