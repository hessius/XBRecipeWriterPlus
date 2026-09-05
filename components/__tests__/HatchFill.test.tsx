import React from "react";

import HatchFill from "@/components/HatchFill";
import {renderWithProviders} from "@/test-utils/render";

describe("HatchFill", () => {
    it("draws faint stripes across the whole width", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0.4} height={20} />
        );

        expect(r.getByTestId("hatch-dim").props.width).toBe("100%");
    });

    it("clips the bright stripes to the fill fraction", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0.4} height={20} />
        );

        expect(r.getByTestId("hatch-bright").props.width).toBe("40%");
    });

    it("draws no bright stripes at all before the wait has begun", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0} height={20} />
        );

        expect(r.queryByTestId("hatch-bright")).toBeNull();
    });

    it("clamps a fill past the end", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={1.8} height={20} />
        );

        expect(r.getByTestId("hatch-bright").props.width).toBe("100%");
    });

    it("two instances on screen at once get different pattern ids", async () => {
        const r = await renderWithProviders(
            <>
                <HatchFill testID="a" dim="#111111" bright="#FF0000"
                           fill={0.5} height={20} />
                <HatchFill testID="b" dim="#222222" bright="#00FF00"
                           fill={0.5} height={20} />
            </>
        );

        // react-native-svg parses `url(#id)` into a brush object, so the ids
        // have to be compared by value: two distinct objects are never `toBe`
        // each other, and an identity comparison here passes even when both
        // lanes point at the same pattern.
        const brushOf = (id: string) =>
            (r.getByTestId(id).props.fill as {brushRef: string}).brushRef;

        // Each instance generates its own useId-based pattern id. If they
        // collided, the second lane would silently paint with the first's
        // colour.
        expect(brushOf("a-bright")).not.toBe(brushOf("b-bright"));
        expect(brushOf("a-dim")).not.toBe(brushOf("b-dim"));
    });
});
