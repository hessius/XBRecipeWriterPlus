import {screen} from "@testing-library/react-native";
import React from "react";

import ShelfMark, {MARK_SIZE} from "@/components/ShelfMark";
import {renderWithProviders} from "@/test-utils/render";

describe("ShelfMark", () => {
    // The size is the whole contract. Every art candidate the design is testing
    // draws inside this square, so a variant that changed it would reflow the
    // grid the moment a tester switched to it.
    it.each(["auto", "manual"] as const)("draws a 44 point square for a %s shelf",
        async (kind) => {
            await renderWithProviders(<ShelfMark kind={kind}/>);

            expect(screen.getByTestId("shelf-mark")).toHaveStyle({
                width: MARK_SIZE, height: MARK_SIZE
            });
        });

    it("fixes the square at the size the design commits to", () => {
        expect(MARK_SIZE).toBe(44);
    });
});
