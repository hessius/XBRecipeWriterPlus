import React from "react";
import {screen} from "@testing-library/react-native";

import DotBloom, {litCount} from "@/components/DotBloom";
import {renderWithProviders} from "@/test-utils/render";

describe("litCount", () => {
    it("lights nothing at zero", () => {
        expect(litCount(0, 24)).toBe(0);
    });

    it("lights everything at one", () => {
        expect(litCount(1, 24)).toBe(24);
    });

    it("lights half at one half", () => {
        expect(litCount(0.5, 24)).toBe(12);
    });

    it("clamps progress above one", () => {
        expect(litCount(4, 24)).toBe(24);
    });

    it("clamps progress below zero", () => {
        expect(litCount(-1, 24)).toBe(0);
    });

    it("treats a non-finite progress as zero", () => {
        expect(litCount(Number.NaN, 24)).toBe(0);
    });
});

describe("DotBloom", () => {
    it("renders the full ring of dots regardless of progress", async () => {
        await renderWithProviders(<DotBloom progress={0.25} dotCount={24}/>);
        expect(screen.getAllByTestId("dot-bloom-dot")).toHaveLength(24);
    });

    it("exposes progress as an accessibility value", async () => {
        await renderWithProviders(<DotBloom progress={0.5}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityValue)
            .toEqual({min: 0, max: 100, now: 50});
    });
});
