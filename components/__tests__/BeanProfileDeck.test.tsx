import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import {BeanProfileDeck} from "@/components/BeanProfileDeck";
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

describe("BeanProfileDeck", () => {
    it("renders nothing when the recipe has no counted brews", async () => {
        await renderWithProviders(
            <BeanProfileDeck profile={profile()} accent={ACCENT} onShowAll={jest.fn()}/>
        );

        expect(screen.queryByText(/BREWS TAGGED/)).toBeNull();
    });

    it("counts tagged brews against all counted brews in the subtitle", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:     [row()],
                    untagged: {brews: 9, rated: 3, avgRating: 3.9},
                    counted:  12
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByText("3 OF 12 BREWS TAGGED")).toBeTruthy();
    });

    it("omits the untagged row when every counted brew is tagged", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({rows: [row()], counted: 12})}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByText("12 OF 12 BREWS TAGGED")).toBeTruthy();
        expect(screen.queryByLabelText("Not tagged")).toBeNull();
    });

    it("renders a row's field label, value and rating figures", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({rows: [row()], counted: 9})}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        const line = screen.getByTestId("bean-profile-row");
        expect(line).toHaveTextContent(/PROCESS/);
        expect(line).toHaveTextContent(/Natural/);
        expect(line).toHaveTextContent(/4\.6 · 9/);
    });

    it("renders rows in profile rank order", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows: [
                        row({value: "Below floor", brews: 12, rated: 1, avgRating: 5}),
                        row({value: "Washed", brews: 5, rated: 5, avgRating: 4.1}),
                        row({value: "Natural", brews: 4, rated: 4, avgRating: 4.8})
                    ],
                    counted: 12
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        const lines = screen.getAllByTestId("bean-profile-row");
        expect(lines[0]).toHaveTextContent(/Natural/);
        expect(lines[1]).toHaveTextContent(/Washed/);
        expect(lines[2]).toHaveTextContent(/Below floor/);
    });

    it("names fields from the profile field labels", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows: [
                        row({field: "fermentation", value: "Co-ferment"}),
                        row({field: "custom", value: "Dad's bag"})
                    ],
                    counted: 9
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByText("FERMENT")).toBeTruthy();
        expect(screen.getByText("TAG")).toBeTruthy();
    });

    it("shows the count alone when a row has no rated brews", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:    [row({rated: 0, avgRating: 0, brews: 5})],
                    counted: 5
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        const line = screen.getByTestId("bean-profile-row");
        expect(line).toHaveTextContent(/5/);
        expect(line).not.toHaveTextContent(/0\.0/);
    });

    it("caps tagged rows and shows the total row count in SHOW ALL", async () => {
        const rows = Array.from({length: 9}, (_, index) =>
            row({field: "origin", value: `Origin ${index}`, brews: 9 - index}));

        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows,
                    untagged: {brews: 2, rated: 1, avgRating: 3.8},
                    counted:  11
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getAllByTestId("bean-profile-row")).toHaveLength(PROFILE_CAP + 1);
        expect(screen.getByText("SHOW ALL 9 ›")).toBeTruthy();
    });

    it("draws no SHOW ALL control when every row fits", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({rows: [row(), row({value: "Washed"})], counted: 9})}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.queryByText(/SHOW ALL/)).toBeNull();
    });

    it("pins the untagged row last and labels it for accessibility", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows: [
                        row({value: "Natural", avgRating: 4.1, brews: 4}),
                        row({value: "Light", field: "roast", avgRating: 4.0, brews: 3})
                    ],
                    untagged: {brews: 9, rated: 9, avgRating: 5},
                    counted:  18
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        const lines = screen.getAllByTestId("bean-profile-row");
        expect(lines[lines.length - 1]).toHaveTextContent(/NOT TAGGED/);
        expect(screen.getByLabelText("Not tagged")).toBe(lines[lines.length - 1]);
    });

    it("writes a plural untagged count in the value column", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:     [row()],
                    untagged: {brews: 9, rated: 2, avgRating: 3.9},
                    counted:  18
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByLabelText("Not tagged")).toHaveTextContent(/9 brews/);
    });

    it("writes the untagged count once, not again in the figures", async () => {
        // The untagged row has no field of its own, so its count sits where a
        // value would. Printing it again beside the average gives the one row
        // the design leans on being right the shape
        // `NOT TAGGED | 9 brews | 3.9 · 9`, which is how it first shipped.
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:     [row()],
                    untagged: {brews: 9, rated: 2, avgRating: 3.9},
                    counted:  18
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        const untagged = screen.getByLabelText("Not tagged");
        expect(untagged).toHaveTextContent(/3\.9/);
        expect(untagged).not.toHaveTextContent(/·/);
    });

    it("writes a singular untagged count in the value column", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:     [row()],
                    untagged: {brews: 1, rated: 1, avgRating: 3.9},
                    counted:  10
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByLabelText("Not tagged")).toHaveTextContent(/1 brew/);
    });

    it("draws the untagged row outside the cap", async () => {
        const rows = Array.from({length: PROFILE_CAP}, (_, index) =>
            row({field: "custom", value: `Tag ${index}`, brews: PROFILE_CAP - index}));

        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows,
                    untagged: {brews: 7, rated: 3, avgRating: 3.7},
                    counted:  20
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getAllByTestId("bean-profile-row")).toHaveLength(PROFILE_CAP + 1);
        expect(screen.getByLabelText("Not tagged")).toBeTruthy();
    });

    it("shows an empty-state line when every counted brew is untagged", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    untagged: {brews: 4, rated: 2, avgRating: 3.5},
                    counted:  4
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        expect(screen.getByText("No brews tagged yet. Tag a brew to see what this recipe does best."))
            .toBeTruthy();
        expect(screen.getByLabelText("Not tagged")).toHaveTextContent(/4 brews/);
    });

    it("calls onShowAll from the expander", async () => {
        const onShowAll = jest.fn();
        const rows = Array.from({length: PROFILE_CAP + 1}, (_, index) =>
            row({value: `Origin ${index}`}));

        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({rows, counted: 20})}
                accent={ACCENT}
                onShowAll={onShowAll}
            />
        );

        await fireEvent.press(screen.getByLabelText("Show all brewed-with rows"));

        expect(onShowAll).toHaveBeenCalledTimes(1);
    });

    it("makes no ledger row pressable", async () => {
        await renderWithProviders(
            <BeanProfileDeck
                profile={profile({
                    rows:     [row(), row({field: "roast", value: "Light"})],
                    untagged: {brews: 3, rated: 2, avgRating: 3.8},
                    counted:  12
                })}
                accent={ACCENT}
                onShowAll={jest.fn()}
            />
        );

        for (const line of screen.getAllByTestId("bean-profile-row")) {
            expect(line.props.accessibilityRole).not.toBe("button");
            expect(line.props.onPress).toBeUndefined();
        }
    });
});
