import React from "react";
import {screen} from "@testing-library/react-native";

import NetworkScreen from "@/app/network";
import {OUTBOUND_CALLS, SILENT_CAPABILITIES} from "@/constants/network";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-router", () => ({router: {push: jest.fn(), back: jest.fn()}}));

/**
 * The screen is a rendering of `constants/network.ts` and nothing else, so
 * these assertions are driven from the data rather than from remembered copy.
 * An entry added to the list must appear here without anybody editing a test,
 * which is the only way the screen can stay exhaustive.
 *
 * Each test renders once and then loops, rather than rendering per entry with
 * `it.each`: the screen is one long scroller, and a render apiece put the file
 * over its timeout when the suite runs in parallel, for no extra coverage.
 */
describe("NetworkScreen", () => {
    it("draws every request, with its host and what it carries", async () => {
        await renderWithProviders(<NetworkScreen/>);

        for (const call of OUTBOUND_CALLS) {
            expect(screen.getByTestId(`network-call-${call.id}`)).toBeTruthy();
            expect(screen.getByText(call.title)).toBeTruthy();
            expect(screen.getByText(call.trigger)).toBeTruthy();
            expect(screen.getAllByText(call.host).length).toBeGreaterThan(0);
            for (const line of call.carries) {
                expect(screen.getByText(line)).toBeTruthy();
            }
        }
    });

    it("links every file a request is made of", async () => {
        await renderWithProviders(<NetworkScreen/>);

        for (const file of OUTBOUND_CALLS.flatMap((call) => call.source)) {
            // `getAllBy`, because two entries share a transport file and each
            // links it from its own card.
            expect(screen.getAllByLabelText(file).length).toBeGreaterThan(0);
        }
    });

    it("says plainly where a reader cannot follow the request", async () => {
        // The mint is the one request that finishes on a server. Saying so is
        // the difference between an honest list and a reassuring one.
        const opaque = OUTBOUND_CALLS.filter((call) => call.unverifiable !== undefined);
        expect(opaque.length).toBeGreaterThan(0);

        await renderWithProviders(<NetworkScreen/>);

        for (const call of opaque) {
            expect(screen.getByTestId(`network-unverifiable-${call.id}`)).toBeTruthy();
            expect(screen.getByText(call.unverifiable!)).toBeTruthy();
        }
    });

    it("leads with what sends nothing", async () => {
        await renderWithProviders(<NetworkScreen/>);

        for (const item of SILENT_CAPABILITIES) {
            expect(screen.getByTestId(`network-silent-${item.id}`)).toBeTruthy();
            expect(screen.getByText(item.detail)).toBeTruthy();
        }
    });

    it("offers the policy and the source", async () => {
        await renderWithProviders(<NetworkScreen/>);

        expect(screen.getByLabelText("The full privacy policy")).toBeTruthy();
        expect(screen.getByLabelText("All of the source")).toBeTruthy();
    });
});
