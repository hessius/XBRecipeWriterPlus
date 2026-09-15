import {fireEvent, screen} from "@testing-library/react-native";

import CloudImportRow from "@/components/CloudImportRow";
import type {ImportEntry} from "@/library/cloud/importPlan";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

const entry = (over: Partial<ImportEntry> = {}): ImportEntry => {
    const recipe = new Recipe(undefined, undefined);
    recipe.name = "Kenya";
    return {
        cloudId: 1,
        name: "Kenya",
        status: "new",
        recipe,
        selected: true,
        ...over,
    };
};

describe("CloudImportRow", () => {
    it("shows the recipe name", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Kenya")).toBeTruthy();
    });

    it("says what will happen for a new recipe", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("New")).toBeTruthy();
    });

    it("says what will happen for an updated recipe", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "updated"})} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Changed in xBloom")).toBeTruthy();
    });

    it("explains why an edited recipe is not selected", async () => {
        // The user must be able to see that the app is declining rather than
        // failing, and why.
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Edited here")).toBeTruthy();
    });

    it("marks an unchanged recipe as already imported", async () => {
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "unchanged", selected: false})}
                onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Already imported")).toBeTruthy();
    });

    it("reports its selected state to assistive technology", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        const row = screen.getByRole("checkbox", {name: /Kenya/});
        expect(row.props.accessibilityState.checked).toBe(true);
    });

    it("calls back with its cloud id when tapped", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <CloudImportRow entry={entry({cloudId: 42})} onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByRole("checkbox", {name: /Kenya/}));
        expect(onToggle).toHaveBeenCalledWith(42);
    });

    it("is still tappable when it starts unselected", async () => {
        // An `edited` row is offered, not forbidden. The user may overrule us.
        const onToggle = jest.fn();
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByRole("checkbox", {name: /Kenya/}));
        expect(onToggle).toHaveBeenCalled();
    });

    /**
     * The spec puts the consent on the tick itself: there is no confirming
     * dialog after it. So the row has to say what ticking would cost before
     * the user does it, or they are agreeing to something never stated.
     */
    it("tells an edited row what importing would cost, before it is ticked", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "edited", selected: false})} onToggle={jest.fn()}/>
        );

        expect(
            await screen.findByText("Importing replaces the changes you made here")
        ).toBeTruthy();
    });

    it("does not caption the statuses where ticking costs nothing", async () => {
        for (const status of ["new", "updated", "unchanged"] as const) {
            const view = await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );
            expect(
                screen.queryByText("Importing replaces the changes you made here")
            ).toBeNull();
            view.unmount();
        }
    });
});
