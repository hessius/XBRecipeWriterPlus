import {render} from "@testing-library/react-native";
import React from "react";

import RouteWatcher from "@/components/RouteWatcher";
import {renderWithProviders} from "@/test-utils/render";

const mockNoteRoute = jest.fn();
let mockPathname = "/";

jest.mock("expo-router", () => ({usePathname: () => mockPathname}));
jest.mock("@/hooks/steadyRouter", () => ({
    noteRoute: (path: string) => mockNoteRoute(path)
}));

beforeEach(() => {
    mockPathname = "/";
    mockNoteRoute.mockClear();
});

describe("RouteWatcher", () => {
    it("tells the guard where the app is", async () => {
        mockPathname = "/brewHistory";

        await renderWithProviders(<RouteWatcher/>);

        expect(mockNoteRoute).toHaveBeenCalledWith("/brewHistory");
    });

    it("tells it again when the route changes", async () => {
        const {rerender} = await renderWithProviders(<RouteWatcher/>);
        mockNoteRoute.mockClear();

        mockPathname = "/settings";
        await rerender(<RouteWatcher/>);

        expect(mockNoteRoute).toHaveBeenCalledWith("/settings");
    });

    it("draws nothing", async () => {
        // It sits beside the navigator, where anything it drew would be over
        // every screen in the app. Rendered bare rather than through the
        // providers, which are themselves a tree.
        const {toJSON} = await render(<RouteWatcher/>);
        expect(toJSON()).toBeNull();
    });
});
