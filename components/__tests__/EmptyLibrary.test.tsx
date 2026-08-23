import React from "react";
import {screen} from "@testing-library/react-native";

import EmptyLibrary from "@/components/EmptyLibrary";
import {renderWithProviders} from "@/test-utils/render";

describe("EmptyLibrary", () => {
    it("says the library is empty", async () => {
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.getByText("No recipes yet")).toBeTruthy();
    });

    it("points at the tiles rather than repeating them", async () => {
        // The two CTA tiles stay on screen above this, so a third call to
        // action here would be a second affordance for the same job.
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("hides its decoration from screen readers", async () => {
        // DotBloom announces itself as a progressbar, which is true when it is
        // reporting a scan and a lie when it is a mark on an empty screen.
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });
});
