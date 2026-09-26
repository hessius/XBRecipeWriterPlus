import React from "react";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";

import {BeanProfileSheet} from "@/components/BeanProfileSheet";
import {PROFILE_CAP, type BeanProfile, type BeanProfileRow} from "@/library/beanProfile";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#9FC3F0";

function row(partial: Partial<BeanProfileRow> = {}): BeanProfileRow {
    return {
        field:     "process",
        value:     "Natural",
        brews:     9,
        rated:     4,
        avgRating: 4.6,
        ...partial
    };
}

function profile(partial: Partial<BeanProfile> = {}): BeanProfile {
    return {
        rows:     [],
        untagged: {brews: 0, rated: 0, avgRating: 0},
        counted:  0,
        ...partial
    };
}

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

async function settleSheetEntrance(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe("BeanProfileSheet", () => {
    it("renders every row when open, past the deck cap", async () => {
        const rows = Array.from({length: PROFILE_CAP + 3}, (_, index) =>
            row({field: "origin", value: `Origin ${index}`, brews: PROFILE_CAP + 3 - index}));

        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={jest.fn()}
                profile={profile({rows, counted: 20})}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        expect(screen.getAllByTestId("bean-profile-row")).toHaveLength(PROFILE_CAP + 3);
        expect(screen.getByText("Origin 7")).toBeTruthy();
    });

    it("ranks rows the same way as the deck", async () => {
        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={jest.fn()}
                profile={profile({
                    rows: [
                        row({value: "Below floor", brews: 12, rated: 1, avgRating: 5}),
                        row({value: "Washed", brews: 5, rated: 5, avgRating: 4.1}),
                        row({value: "Natural", brews: 4, rated: 4, avgRating: 4.8})
                    ],
                    counted: 12
                })}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        const lines = screen.getAllByTestId("bean-profile-row");
        expect(lines[0]).toHaveTextContent(/Natural/);
        expect(lines[1]).toHaveTextContent(/Washed/);
        expect(lines[2]).toHaveTextContent(/Below floor/);
    });

    it("pins the untagged row last", async () => {
        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={jest.fn()}
                profile={profile({
                    rows: [
                        row({value: "Natural", avgRating: 4.1, brews: 4}),
                        row({field: "roast", value: "Light", avgRating: 4.0, brews: 3})
                    ],
                    untagged: {brews: 9, rated: 9, avgRating: 5},
                    counted:  18
                })}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        const lines = screen.getAllByTestId("bean-profile-row");
        expect(lines[lines.length - 1]).toHaveTextContent(/NOT TAGGED/);
        expect(screen.getByLabelText("Not tagged")).toBe(lines[lines.length - 1]);
    });

    it("renders nothing while closed", async () => {
        await renderWithProviders(
            <BeanProfileSheet
                open={false}
                onOpenChange={jest.fn()}
                profile={profile({rows: [row()], counted: 9})}
                accent={ACCENT}
            />
        );

        expect(screen.queryByText(/BREWS TAGGED/)).toBeNull();
    });

    it("shows the same subtitle as the deck", async () => {
        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={jest.fn()}
                profile={profile({
                    rows:     [row()],
                    untagged: {brews: 9, rated: 3, avgRating: 3.9},
                    counted:  12
                })}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByText("3 OF 12 BREWS TAGGED")).toBeTruthy();
    });

    it("makes no row pressable", async () => {
        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={jest.fn()}
                profile={profile({
                    rows:     [row(), row({field: "roast", value: "Light"})],
                    untagged: {brews: 3, rated: 2, avgRating: 3.8},
                    counted:  12
                })}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        for (const line of screen.getAllByTestId("bean-profile-row")) {
            expect(line.props.accessibilityRole).not.toBe("button");
            expect(line.props.onPress).toBeUndefined();
        }
    });

    it("closes from the sheet chrome", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <BeanProfileSheet
                open
                onOpenChange={onOpenChange}
                profile={profile({rows: [row()], counted: 9})}
                accent={ACCENT}
            />
        );
        await settleSheetEntrance();

        await pressOnSheet("Close", () => onOpenChange.mock.calls.length > 0);

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
