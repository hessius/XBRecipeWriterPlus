import React from "react";
import {screen} from "@testing-library/react-native";

import WriteSweep, {blockState} from "@/components/WriteSweep";
import {renderWithProviders} from "@/test-utils/render";

describe("blockState", () => {
    it("marks earlier blocks as written", () => {
        expect(blockState(0, 3)).toBe("written");
    });

    it("marks the current block as active", () => {
        expect(blockState(3, 3)).toBe("active");
    });

    it("marks later blocks as pending", () => {
        expect(blockState(4, 3)).toBe("pending");
    });

    it("marks everything written once the count passes the last block", () => {
        expect(blockState(9, 10)).toBe("written");
    });
});

describe("WriteSweep", () => {
    it("renders one cell per block", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={12}/>);
        expect(screen.getAllByTestId("write-sweep-block")).toHaveLength(12);
    });

    it("reports progress as blocks, not a percentage of time", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={6} totalBlocks={12}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue)
            .toEqual({min: 0, max: 12, now: 6});
    });

    it("renders nothing when there are no blocks to write", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={0}/>);
        expect(screen.queryByTestId("write-sweep")).toBeNull();
    });
});
