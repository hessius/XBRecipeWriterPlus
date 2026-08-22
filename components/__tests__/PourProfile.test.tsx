import React from "react";
import {screen} from "@testing-library/react-native";

import PourProfile, {buildProfilePath} from "@/components/PourProfile";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(volumes: number[]): Pour[] {
    // Pour requires its number; volume is the second positional argument.
    return volumes.map((v, i) => new Pour(i, v));
}

describe("buildProfilePath", () => {
    it("starts at the bottom left", () => {
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toMatch(/^M0 40/);
    });

    it("reaches the top by the last pour", () => {
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toContain("100 0");
    });

    it("handles a single pour", () => {
        expect(buildProfilePath(pours([100]), 100, 40)).toContain("100 0");
    });

    it("does not produce NaN for a zero-volume bloom", () => {
        expect(buildProfilePath(pours([0, 100]), 100, 40)).not.toContain("NaN");
    });

    it("does not produce NaN when every pour is zero", () => {
        expect(buildProfilePath(pours([0, 0]), 100, 40)).not.toContain("NaN");
    });

    it("returns an empty path for no pours", () => {
        expect(buildProfilePath([], 100, 40)).toBe("");
    });
});

describe("PourProfile", () => {
    it("renders nothing when there are no pours", async () => {
        await renderWithProviders(
            <PourProfile testID="pp" pours={[]} width={100} height={40}/>
        );
        expect(screen.queryByTestId("pp")).toBeNull();
    });

    it("renders when there are pours", async () => {
        await renderWithProviders(
            <PourProfile testID="pp" pours={pours([50, 50])} width={100} height={40}/>
        );
        expect(screen.getByTestId("pp")).toBeTruthy();
    });
});
