import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import AboutScreen from "@/app/about";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-application", () => ({
    nativeApplicationVersion: "2.6.0",
    nativeBuildVersion: "42"
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({router: {push: (path: string) => mockPush(path), back: jest.fn()}}));

beforeEach(() => {
    mockPush.mockClear();
});

describe("AboutScreen", () => {
    it("says which version this is, because a bug report without one is useless", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/2\.6\.0/)).toBeTruthy();
        expect(screen.getByText(/42/)).toBeTruthy();
    });

    it("states that it is unofficial, in plain sight", async () => {
        // Not behind a tap, an accordion or a scroll-to-reveal. The app uses
        // xBloom's marks, reads their cards and calls their undocumented API,
        // and has never said so anywhere.
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/not affiliated with/i)).toBeTruthy();
        expect(screen.getAllByText(/xBloom/).length).toBeGreaterThan(0);
    });

    it("says what leaves the phone", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/stay on this phone/i)).toBeTruthy();
    });

    it("explains why only genuine cards work", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/signature/i)).toBeTruthy();
    });

    it("offers somewhere to report a fault", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByRole("link", {name: /report an issue/i})).toBeTruthy();
        expect(screen.getByRole("link", {name: /source code/i})).toBeTruthy();
    });

    it("offers the licences without mounting all of them here", async () => {
        // The list runs to hundreds of entries. It lives on its own route so
        // that opening About does not build them, and so that the route that
        // does show them can virtualise.
        await renderWithProviders(<AboutScreen/>);

        const link = screen.getByRole("link", {name: /read the licences/i});
        expect(link).toBeTruthy();
        expect(screen.queryByText(/^react-native /)).toBeNull();

        await fireEvent.press(link);

        expect(mockPush).toHaveBeenCalledWith("/licences");
    });

    it("draws the mark, out of the screen reader's way", async () => {
        // Present on screen, absent from the accessibility tree -- the default
        // RNTL query is the accessibility tree, so needing the escape hatch
        // here is the assertion that it is properly hidden.
        await renderWithProviders(<AboutScreen/>);
        expect(screen.queryAllByTestId("living-mark-dot")).toHaveLength(0);
        expect(screen.getAllByTestId("living-mark-dot", {includeHiddenElements: true}).length)
            .toBeGreaterThan(0);
    });

    it("says the app's name once, not twice, to a screen reader", async () => {
        // The mark and the wordmark are the same three characters. Announcing
        // both gives a reader the fact twice and the useful one second.
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getAllByLabelText("XBRW++")).toHaveLength(1);
    });

    it("calls the app XBRW++, which is what it is called", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.queryByText(/XBRecipeWriter\+\+/)).toBeNull();
    });

    it("credits the app it came from and the fork it grew out of", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByLabelText("XBRecipeWriter, by terminaldisclaimer")).toBeTruthy();
        expect(screen.getByLabelText("XBRecipeWriterPlus, by Serge Baranov")).toBeTruthy();
    });

    it("says the signature is never written, because it never is", async () => {
        // library/NFC.ts starts writing at block 8, i.e. byte 32. The app does
        // not write those bytes back -- it does not write them at all -- and
        // this screen is the only place that claim is made to a user.
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/never writes those bytes at all/)).toBeTruthy();
    });
});
