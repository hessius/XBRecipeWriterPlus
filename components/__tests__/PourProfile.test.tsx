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
    it("draws an even recipe as an even staircase", () => {
        // Rise to the halfway point, plateau, rise to the top, plateau. Compare
        // the interior of this with the bloom-first case below: the endpoints of
        // the two are identical, so only the middle carries any information.
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toBe(
            "M0 40 L31 20 L50 20 L81 0 L100 0"
        );
    });

    it("draws a bloom as a low first step", () => {
        // The 38 is the assertion that earns its keep. It pins the first pour to
        // 5% of the height, which requires per-pour volumes to drive the shape,
        // the plateau point to exist, and the pours to be walked in order — an
        // even staircase, a missing plateau or a reversed schedule all move it.
        expect(buildProfilePath(pours([5, 95]), 100, 40)).toBe(
            "M0 40 L31 38 L50 38 L81 0 L100 0"
        );
    });

    it("starts at the bottom left", () => {
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toMatch(/^M0 40/);
    });

    it("reaches the top by the last pour", () => {
        // endsWith, not toContain: "100 0" is a substring of "L100 0.5", so a
        // shape stopping a hair short of the top would satisfy a containment
        // check, as would a stray (100, 0) anywhere in the middle.
        expect(buildProfilePath(pours([50, 50]), 100, 40).endsWith("L100 0")).toBe(true);
    });

    it("handles a single pour", () => {
        expect(buildProfilePath(pours([100]), 100, 40)).toBe("M0 40 L62 0 L100 0");
    });

    it("treats an unset volume as zero", () => {
        // Pour defaults volume to -1. Unclamped, a negative contribution drags
        // the curve below its own baseline and outside the viewBox.
        expect(buildProfilePath(pours([-1, 100]), 100, 40)).toBe(
            buildProfilePath(pours([0, 100]), 100, 40)
        );
    });

    it("does not produce NaN for a zero-volume bloom", () => {
        expect(buildProfilePath(pours([0, 100]), 100, 40)).not.toContain("NaN");
    });

    it("does not produce NaN when every pour is zero", () => {
        expect(buildProfilePath(pours([0, 0]), 100, 40)).not.toContain("NaN");
    });

    it("draws an all-zero recipe flat along the baseline", () => {
        expect(buildProfilePath(pours([0, 0]), 100, 40)).toBe(
            "M0 40 L31 40 L50 40 L81 40 L100 40"
        );
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

    it("pads the viewBox so the stroke is not clipped at the edges", async () => {
        // The path touches y = 0 and y = height exactly, so a viewBox flush to
        // the geometry renders the opening baseline and closing plateau at half
        // the weight of the diagonals.
        await renderWithProviders(
            <PourProfile testID="pp" pours={pours([50, 50])} width={100} height={40}
                         strokeWidth={2}/>
        );
        // react-native-svg parses viewBox into these four host props rather
        // than passing the string through.
        const {minX, minY, vbWidth, vbHeight} = screen.getByTestId("pp").props;
        expect([minX, minY, vbWidth, vbHeight]).toEqual([-1, -1, 102, 42]);
    });

    it("sizes itself to that padded viewBox, so nothing is letterboxed", async () => {
        // An SVG whose element aspect differs from its viewBox aspect is fitted
        // inside it and centred. Padding only the viewBox made the two differ,
        // and the drawing was inset by a couple of points on the left and right
        // while filling the height exactly -- which read as asymmetric padding.
        await renderWithProviders(
            <PourProfile testID="pp" pours={pours([50, 50])} width={100} height={40}
                         strokeWidth={2}/>
        );
        const svg = screen.getByTestId("pp");
        expect([svg.props.width, svg.props.height]).toEqual([102, 42]);
    });
});
