import React from "react";
import {StyleSheet} from "react-native";
import {screen} from "@testing-library/react-native";

import {DOTO_FAMILIES} from "@/components/DotMatrixText";
import EmptyLibrary from "@/components/EmptyLibrary";
import {renderWithProviders} from "@/test-utils/render";

describe("EmptyLibrary", () => {
    it("says the library is empty", async () => {
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.getByText("NO RECIPES YET")).toBeTruthy();
    });

    it("says it in the dot-matrix register its sibling empty states use", async () => {
        // The capitals alone do not prove this: an Inter string can be typed
        // in capitals and would read as shouting rather than as a readout.
        // What makes it match NO BREWS YET and NO TRACE KEPT is the font, so
        // that is what is asserted.
        await renderWithProviders(<EmptyLibrary/>);
        const style = StyleSheet.flatten(screen.getByText("NO RECIPES YET").props.style);
        expect(Object.values(DOTO_FAMILIES)).toContain(style.fontFamily);
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
