/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {fireEvent, screen} from "@testing-library/react-native";

import ImportResult from "@/components/ImportResult";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function preview(overrides: Partial<{name: string; subtitle: string; imageURL: string; isExisting: boolean}> = {}) {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.pours = [
        new Pour(1, 100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 30),
        new Pour(2, 188, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)
    ];
    return {
        recipe,
        isExisting: false,
        name:       "Ethiopia Guji",
        subtitle:   "Washed - Floral",
        imageURL:   "https://example.com/pod.png",
        ...overrides
    };
}

it("shows enough for a wrong result to be recognised", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByText("Ethiopia Guji")).toBeTruthy();
    expect(await screen.findByText("Washed - Floral")).toBeTruthy();
    expect(await screen.findByText("18")).toBeTruthy();     // dose
    expect(await screen.findByText("1:16")).toBeTruthy();   // ratio
    expect(await screen.findByText("2")).toBeTruthy();      // stages
    expect(await screen.findByTestId("import-result-profile")).toBeTruthy();
});

it("shows the pod mark when there is a photo", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByTestId("import-result-pod")).toBeTruthy();
});

it("is silently without a mark when there is no photo", async () => {
    // "Silently hidden" is a behaviour, not an omission: a shared recipe has no
    // pod photo at all, and neither a placeholder nor a gap is acceptable.
    await renderWithProviders(
        <ImportResult preview={preview({imageURL: ""})} onOpen={() => {}}/>
    );

    expect(await screen.findByText("Ethiopia Guji")).toBeTruthy();
    expect(screen.queryByTestId("import-result-pod")).toBeNull();
});

it("announces the figures as one sentence, not a loose pile of numbers", async () => {
    // VoiceOver would otherwise read "18", "DOSE", "1:16", "RATIO"… as separate
    // elements, and "1:16" as "one colon sixteen". The row is grouped with a
    // composed label, the way `RecipeCard` announces a recipe.
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByLabelText("18 grams, ratio 1 to 16, 2 stages")).toBeTruthy();
});

it("hides a pod photo that fails to load", async () => {
    // The spec says a failed load is indistinguishable from a recipe that never
    // had a photo. `onError` removes it entirely, so it no longer steals width
    // from the name column.
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    const pod = await screen.findByTestId("import-result-pod");
    await fireEvent(pod, "error");

    expect(screen.queryByTestId("import-result-pod")).toBeNull();
    expect(await screen.findByText("Ethiopia Guji")).toBeTruthy();
});

it("says IMPORT for a new recipe", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByText("IMPORT")).toBeTruthy();
});

it("says OPEN, and says why, for one already in the library", async () => {
    await renderWithProviders(
        <ImportResult preview={preview({isExisting: true})} onOpen={() => {}}/>
    );

    expect(await screen.findByText("OPEN")).toBeTruthy();
    expect(await screen.findByText("Already in your library")).toBeTruthy();
});

it("hands the press upward", async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<ImportResult preview={preview()} onOpen={onOpen}/>);

    await fireEvent.press(await screen.findByLabelText("Open Ethiopia Guji"));

    expect(onOpen).toHaveBeenCalledTimes(1);
});
