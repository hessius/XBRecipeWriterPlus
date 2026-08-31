/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {fireEvent, screen} from "@testing-library/react-native";

import ImportResult from "@/components/ImportResult";
import {PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function preview(overrides: Partial<{recipe: Recipe; name: string; subtitle: string; imageURL: string; isExisting: boolean}> = {}) {
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

    // The graph appears only once the panel has measured a width for it.
    const frame = await screen.findByTestId("import-result-profile-frame");
    await fireEvent(frame, "layout", {nativeEvent: {layout: {width: 320}}});
    expect(await screen.findByTestId("import-result-profile")).toBeTruthy();
});

it("sizes the graph to the width it measures, not a constant", async () => {
    // The old panel drew the graph at a hard-coded 240 and left dead space on a
    // wider sheet. Now it fills the measured width: the rendered SVG element is
    // exactly the panel's width, with the stroke bleed folded back in so it does
    // not overrun the container by a stroke.
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    // Nothing is drawn before the first measurement, so the panel cannot reflow.
    expect(screen.queryByTestId("import-result-profile")).toBeNull();

    const frame = await screen.findByTestId("import-result-profile-frame");
    await fireEvent(frame, "layout", {nativeEvent: {layout: {width: 320}}});

    const profile = await screen.findByTestId("import-result-profile");
    expect(profile.props.width).toBe(320);
    expect(profile.props.width).not.toBe(240 + PROFILE_STROKE_WIDTH);
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

it("names the stored recipe when the user gave it a custom name", async () => {
    // The custom name is how the user recognises which of theirs this is, so it
    // is the most useful thing on the panel. Straight quotes are drawn (matching
    // the app's ASCII copy) but the spoken label drops them.
    const recipe = preview().recipe;
    recipe.name = "My Morning Cup";
    await renderWithProviders(
        <ImportResult preview={preview({isExisting: true, recipe})} onOpen={() => {}}/>
    );

    expect(await screen.findByText('Already in your library as "My Morning Cup"')).toBeTruthy();
    // Read aloud without the awkward "quote … quote".
    expect(await screen.findByLabelText("Already in your library as My Morning Cup")).toBeTruthy();
    // The bare form is gone -- the name replaced it, it was not appended.
    expect(screen.queryByText("Already in your library")).toBeNull();
});

it("does not print empty quotes, or the xBloom title, when there is no custom name", async () => {
    // `recipe.name` is empty for a never-renamed import, even though it carries
    // an XID and an xBloom title. The bare line shows; no quotes, and the title
    // (already the heading) is not repeated.
    const recipe = preview().recipe;
    recipe.name = "";
    recipe.xbloomName = "Ethiopia Guji";
    recipe.xid = "ETH120";
    await renderWithProviders(
        <ImportResult preview={preview({isExisting: true, recipe})} onOpen={() => {}}/>
    );

    expect(await screen.findByText("Already in your library")).toBeTruthy();
    expect(screen.queryByText(/Already in your library as/)).toBeNull();
});

it("hands the press upward", async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<ImportResult preview={preview()} onOpen={onOpen}/>);

    await fireEvent.press(await screen.findByLabelText("Open Ethiopia Guji"));

    expect(onOpen).toHaveBeenCalledTimes(1);
});

describe("ImportResult grind notice", () => {
    it("says nothing when the grind fits on a card", async () => {
        const found = preview();
        found.recipe.grindSize = 50;

        await renderWithProviders(<ImportResult preview={found} onOpen={() => {}}/>);

        expect(screen.queryByTestId("import-grind-notice")).toBeNull();
    });

    it("names the band and frames it as a card limit, not a bad recipe", async () => {
        // The cloud keeps grind on the grinder's 1-80 scale, so this is a
        // value a real import can carry.
        const found = preview();
        found.recipe.grindSize = 25;

        await renderWithProviders(<ImportResult preview={found} onOpen={() => {}}/>);

        expect(screen.getByTestId("import-grind-notice")).toBeTruthy();
        expect(screen.getByText(/Aeropress/)).toBeTruthy();
    });
});
