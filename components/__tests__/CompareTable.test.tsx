import React from "react";

import CompareTable from "@/components/CompareTable";
import type {CompareRow} from "@/library/brew/compare";
import {renderWithProviders} from "@/test-utils/render";

const ROWS: CompareRow[] = [
    {label: "DOSE", a: "18 g", b: "18 g", shared: true},
    {label: "GRIND", a: "58", b: "62", shared: false},
    {label: "RATING", a: "4 of 5", b: "not recorded", shared: false}
];

async function draw(rows = ROWS) {
    return renderWithProviders(<CompareTable rows={rows} accent="#C86A3B" />);
}

describe("CompareTable", () => {
    it("writes a shared value once, down the middle", async () => {
        const {getByTestId, queryByTestId} = await draw();
        expect(getByTestId("compare-shared-DOSE").props.children).toBe("18 g");
        expect(queryByTestId("compare-a-DOSE")).toBeNull();
        expect(queryByTestId("compare-b-DOSE")).toBeNull();
    });

    it("writes a difference out to both sides", async () => {
        const {getByTestId, queryByTestId} = await draw();
        expect(getByTestId("compare-a-GRIND").props.children).toBe("58");
        expect(getByTestId("compare-b-GRIND").props.children).toBe("62");
        expect(queryByTestId("compare-shared-GRIND")).toBeNull();
    });

    it("shows every row it is given, hiding nothing", async () => {
        const {getByText} = await draw();
        for (const row of ROWS) expect(getByText(row.label)).toBeTruthy();
    });

    it("keeps the order the comparison engine gave it", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("compare-row-0").props.accessibilityLabel)
            .toBe("DOSE. Both brews agree at 18 g.");
        expect(getByTestId("compare-row-1").props.accessibilityLabel)
            .toBe("GRIND. This brew 58. That brew 62.");
        expect(getByTestId("compare-row-2").props.accessibilityLabel)
            .toBe("RATING. This brew 4 of 5. That brew not recorded.");
    });

    it("tells a screen reader whether the brews agree or differ", async () => {
        const {getByLabelText} = await draw();
        expect(getByLabelText("DOSE. Both brews agree at 18 g.")).toBeTruthy();
        expect(getByLabelText("GRIND. This brew 58. That brew 62.")).toBeTruthy();
    });

    it("says nothing at all when there is nothing to say", async () => {
        const {getByTestId} = await draw([]);
        expect(getByTestId("compare-table-empty")).toBeTruthy();
    });
});
