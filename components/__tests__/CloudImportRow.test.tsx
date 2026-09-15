import {fireEvent, screen} from "@testing-library/react-native";

import CloudImportRow from "@/components/CloudImportRow";
import type {ImportEntry} from "@/library/cloud/importPlan";
import {accents, palette} from "@/constants/colors";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
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

/**
 * Tamagui resolves colour into the style prop, which arrives as a nest of
 * arrays. Flatten it before asking what colour something is.
 *
 * Note that nothing here calls `unmount()`. Under RNTL v14 a manual unmount
 * leaves the next render unable to find anything at all -- including through
 * its own returned queries -- so every case below gets its own `it` and lets
 * automatic cleanup do the work. A comparison is two tests, not one test with
 * two renders.
 */
const styleOf = (testID: string): Record<string, unknown> =>
    Object.assign({}, ...[screen.getByTestId(testID).props.style].flat(Infinity));

const LABEL = {
    new: "New here",
    updated: "Changed in xBloom",
    unchanged: "Already in your library",
} as const;

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
        expect(screen.getByText("New here")).toBeTruthy();
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
        expect(screen.getByText("Already in your library")).toBeTruthy();
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

    it.each(["new", "updated", "unchanged"] as const)(
        "does not caption %s, where ticking costs nothing",
        async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );

            // Positively assert the row is there first: without it this would
            // pass just as well against a component that rendered nothing.
            expect(screen.getByText(LABEL[status])).toBeTruthy();
            expect(
                screen.queryByText("Importing replaces the changes you made here")
            ).toBeNull();
        }
    );

    /**
     * The glyph is the only selection signal a sighted user gets, and it can
     * be exactly backwards while every assertion about copy stays green.
     */
    it("shows a ticked box when the entry is selected", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: true})} onToggle={jest.fn()}/>
        );
        expect(screen.getByTestId("cloud-import-tick")).toHaveTextContent("\u2713");
    });

    it("shows an empty box when the entry is not", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(screen.getByTestId("cloud-import-tick")).toHaveTextContent("\u25cb");
    });

    it("announces an unselected row as unchecked", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(screen.getByRole("checkbox").props.accessibilityState.checked)
            .toBe(false);
    });

    /**
     * The label is the whole row for a screen reader. If it carried only the
     * name, a blind user ticking an edited recipe would never be told that
     * doing so discards their changes -- and the tick is the only consent.
     */
    it("reads the name, the status and the consequence aloud", async () => {
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={jest.fn()}/>
        );

        expect(screen.getByRole("checkbox").props.accessibilityLabel).toBe(
            "Kenya, Edited here, Importing replaces the changes you made here"
        );
    });

    it("wears the recipe's own accent when selected", async () => {
        const picked = entry({selected: true});
        picked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={picked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor)
            .toBe(accents.coffee[2]);
    });

    it("steps the accent back when the entry is not selected", async () => {
        const unpicked = entry({selected: false});
        unpicked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={unpicked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor).toBe(palette.dim);
    });

    it("gives a tea recipe a tea accent, not a coffee one", async () => {
        // The two palettes are separate on purpose, and a tea recipe drawn in
        // a coffee accent would be the one place the import screen disagreed
        // with the library it is feeding.
        const tea = entry({selected: true});
        // Ours, not xBloom's: their cup types are 1-4 and tea is their 4,
        // while CUP_TYPE.TEA is 0x03 here. The assertion below is what stops
        // a wrong constant from quietly making this a coffee test.
        tea.recipe.cupType = CUP_TYPE.TEA;
        tea.recipe.accentIndex = 1;
        expect(tea.recipe.isTea()).toBe(true);

        await renderWithProviders(<CloudImportRow entry={tea} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor).toBe(accents.tea[1]);
        expect(accents.tea[1]).not.toBe(accents.coffee[1]);
    });

    // Spec 4.4: already-imported is "unchecked, dimmed". The rows that would
    // act carry full-strength text; the two that would not step back.
    it.each(["new", "updated"] as const)(
        "keeps %s at full strength", async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );
            expect(styleOf("cloud-import-status").color).toBe(palette.text);
        }
    );

    it.each(["unchanged", "edited"] as const)(
        "dims %s, which is not offering to do anything", async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );
            expect(styleOf("cloud-import-status").color).toBe(palette.dim);
        }
    );

    it("carries the selection in the tick's colour, not only its shape", async () => {
        const picked = entry({selected: true});
        picked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={picked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-tick").color).toBe(accents.coffee[2]);
    });

    it("steps the tick back when the entry is not selected", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(styleOf("cloud-import-tick").color).toBe(palette.dim);
    });

    /**
     * The three captionless statuses have nothing to append, and a label built
     * by joining an absent one reads "Kenya, New here, " -- a trailing pause
     * and then silence, every row, for the whole list.
     */
    it("does not trail an empty clause when there is no caption", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "new"})} onToggle={jest.fn()}/>
        );

        expect(screen.getByRole("checkbox").props.accessibilityLabel)
            .toBe("Kenya, New here");
    });

    it("keeps the name at full strength and the caption stepped back", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "edited", selected: false})} onToggle={jest.fn()}/>
        );

        expect(styleOf("cloud-import-name").color).toBe(palette.text);
        expect(styleOf("cloud-import-caption").color).toBe(palette.dim);
    });
});
