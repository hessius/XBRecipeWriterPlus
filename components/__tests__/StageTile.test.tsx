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
