import {screen} from "@testing-library/react-native";
import React from "react";

import ShelfOverflowSheet from "@/components/ShelfOverflowSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("ShelfOverflowSheet", () => {
    function renderSheet(mine: boolean) {
        return renderWithProviders(
            <ShelfOverflowSheet open shelf="Mornings" count={3}
                                mine={mine}
                                onOpenChange={jest.fn()}
                                onEdit={jest.fn()}
                                onRename={jest.fn()}
                                onDuplicate={jest.fn()}
                                onDelete={jest.fn()}
                                onPromote={jest.fn()}
                                onDemote={jest.fn()}/>
        );
    }

    it("offers to make a tag into a shelf", async () => {
        await renderSheet(false);

        expect(screen.getByLabelText("Make this a shelf")).toBeTruthy();
        expect(screen.queryByLabelText("Make this a tag")).toBeNull();
    });

    it("offers to put a shelf back to being a tag", async () => {
        await renderSheet(true);

        expect(screen.getByLabelText("Make this a tag")).toBeTruthy();
        expect(screen.queryByLabelText("Make this a shelf")).toBeNull();
    });
});
