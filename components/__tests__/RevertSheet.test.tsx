import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RevertSheet, {REVERT_SOURCES, type RevertSource} from "@/components/RevertSheet";
import {renderWithProviders} from "@/test-utils/render";

function sources(overrides: Partial<Record<RevertSource["id"], boolean>> = {}): RevertSource[] {
    return REVERT_SOURCES.map((source) => ({
        ...source,
        available: overrides[source.id] ?? true,
        action: jest.fn().mockResolvedValue(undefined)
    }));
}

describe("RevertSheet", () => {
    it("names every source, including the ones it cannot use", async () => {
        await renderWithProviders(
            <RevertSheet open sources={sources({card: false, share: false})}
                         onOpenChange={jest.fn()} onReverted={jest.fn()}/>
        );

        expect(screen.getByText("THE CARD'S OWN BACKUP")).toBeTruthy();
        expect(screen.getByText("THE SAVED COPY")).toBeTruthy();
        expect(screen.getByText("XBLOOM, BY RECIPE ID")).toBeTruthy();
        expect(screen.getByText("XBLOOM, BY SHARE LINK")).toBeTruthy();
    });

    it("says which need the network", async () => {
        await renderWithProviders(
            <RevertSheet open sources={sources()} onOpenChange={jest.fn()}
                         onReverted={jest.fn()}/>
        );

        expect(screen.getAllByText("OFFLINE")).toHaveLength(2);
        expect(screen.getAllByText("ONLINE")).toHaveLength(2);
    });

    it("will not run a source it does not have", async () => {
        const list = sources({card: false});
        await renderWithProviders(
            <RevertSheet open sources={list} onOpenChange={jest.fn()}
                         onReverted={jest.fn()}/>
        );

        const row = screen.getByLabelText("THE CARD'S OWN BACKUP");
        expect(row.props.accessibilityState.disabled).toBe(true);

        await fireEvent.press(row);
        expect(list[0].action).not.toHaveBeenCalled();
    });

    it("runs the source that was picked, then closes", async () => {
        const list = sources();
        const onOpenChange = jest.fn();
        const onReverted = jest.fn();
        await renderWithProviders(
            <RevertSheet open sources={list} onOpenChange={onOpenChange}
                         onReverted={onReverted}/>
        );

        await fireEvent.press(screen.getByLabelText("THE SAVED COPY"));

        expect(list[1].action).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onReverted).toHaveBeenCalled();
    });
});
