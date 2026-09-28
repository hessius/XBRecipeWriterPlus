import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";
import {Linking} from "react-native";

import {LINK_OPEN_FAILED} from "@/components/openLink";
import SupportTile, {SUPPORT_BODY, SUPPORT_TITLE, SUPPORT_URL} from "@/components/SupportTile";
import {renderWithProviders} from "@/test-utils/render";

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    ...jest.requireActual("@/components/XbrwToast"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));

describe("SupportTile", () => {
    beforeEach(() => {
        mockNotify.mockClear();
    });

    it("says who built the app and what the tap is for", async () => {
        await renderWithProviders(<SupportTile/>);

        expect(screen.getByText(SUPPORT_TITLE)).toBeTruthy();
        expect(screen.getByText(SUPPORT_BODY)).toBeTruthy();
    });

    // The URL is the whole feature. Pinned rather than read off the component,
    // so a typo in the handle is a failing test and not a 404 in someone's
    // browser.
    it("opens the tip jar", async () => {
        const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        await renderWithProviders(<SupportTile/>);

        await fireEvent.press(screen.getByTestId("support-tile"));

        expect(openURL).toHaveBeenCalledWith("https://buymeacoffee.com/hsus");
        expect(SUPPORT_URL).toBe("https://buymeacoffee.com/hsus");
        openURL.mockRestore();
    });

    // A managed device with no browser rejects the open. Unhandled that is a
    // red box in development and silence in production, and silence is what a
    // user would read as the tile doing nothing at all.
    it("says so when the system will not take the link", async () => {
        const openURL = jest.spyOn(Linking, "openURL")
            .mockRejectedValue(new Error("no handler"));
        await renderWithProviders(<SupportTile/>);

        await fireEvent.press(screen.getByTestId("support-tile"));
        await Promise.resolve();

        expect(mockNotify).toHaveBeenCalledWith({
            tone: "error", message: LINK_OPEN_FAILED
        });
        openURL.mockRestore();
    });

    // It unlocks nothing, so it has nothing to remember. A tile that grew a
    // "thanks" state would need a setting, and a setting that is not in the
    // backup snapshot is the way `showHints` once went missing.
    it("carries no state of its own", async () => {
        const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        await renderWithProviders(<SupportTile/>);

        await fireEvent.press(screen.getByTestId("support-tile"));

        expect(screen.getByText(SUPPORT_TITLE)).toBeTruthy();
        expect(screen.getByText(SUPPORT_BODY)).toBeTruthy();
        openURL.mockRestore();
    });
});
