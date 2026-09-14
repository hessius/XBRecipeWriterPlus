import React from "react";
import {Pressable, Text} from "react-native";
import {fireEvent, render, waitFor} from "@testing-library/react-native";
import ViewShot from "react-native-view-shot";
import * as viewShotModule from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import {useBrewExport, type BrewExportSource} from "@/hooks/useBrewExport";
import type {StoredBrew} from "@/library/BrewDatabase";

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

const source = (): BrewExportSource => ({
    record,
    samples: [{at: 0, water: 0, cup: 0, pour: 1}]
});

// A harness so the hook's ViewShot ref is wired to the (mocked) ViewShot,
// which is what makes `capture()` resolve to a URL. Defined at module scope.
function Harness({src, prepare}: {
    src: () => BrewExportSource | null;
    prepare?: () => Promise<void>;
}) {
    const {shotRef, shareImage, shareData, busy} = useBrewExport(src, prepare);
    return (
        <>
            <ViewShot ref={shotRef}><Text>content</Text></ViewShot>
            <Pressable accessibilityRole="button" accessibilityLabel="image"
                       onPress={() => void shareImage()} />
            <Pressable accessibilityRole="button" accessibilityLabel="data"
                       onPress={() => void shareData()} />
            <Text testID="busy">{busy ? "busy" : "idle"}</Text>
        </>
    );
}

describe("useBrewExport", () => {
    beforeEach(() => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        (Sharing.isAvailableAsync as jest.Mock).mockReset();
        (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
        (FSFile as unknown as jest.Mock).mockClear();
    });

    it("captures the shot and shares it as a PNG the photo library accepts", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        fireEvent.press(getByLabelText("image"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock/brew.png",
                expect.objectContaining({mimeType: "image/png", UTI: "public.png"})
            )
        );
    });

    it("names the shared image after the brew", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        fireEvent.press(getByLabelText("image"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({dialogTitle: "ethiopia-guji-1970-01-01.png"})
            )
        );
    });

    it("writes the brew as JSON and shares the file", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        fireEvent.press(getByLabelText("data"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock-cache/ethiopia-guji-1970-01-01.json",
                expect.objectContaining({mimeType: "application/json"})
            )
        );
        const instance = (FSFile as unknown as jest.Mock).mock
            .instances[0] as {write: jest.Mock};
        expect(instance.write).toHaveBeenCalled();
    });

    it("does nothing when there is nothing to export", async () => {
        const {getByLabelText} = await render(<Harness src={() => null} />);
        await fireEvent.press(getByLabelText("image"));
        await fireEvent.press(getByLabelText("data"));
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it("ignores a second image press while the first is still in flight", async () => {
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>((r) => { releaseFirst = r; })
        );
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("image"));
        await fireEvent.press(getByLabelText("image"));
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });

    it("ignores a second data press while the first is still in flight", async () => {
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>((r) => { releaseFirst = r; })
        );
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("data"));
        await fireEvent.press(getByLabelText("data"));
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
});

describe("useBrewExport's prepare step", () => {
    it("finishes preparing before it photographs the screen", async () => {
        // The order is the entire point: the record screen clears its selected
        // stage in `prepare`, and a capture taken first would bake the
        // highlight into a picture nobody can tap. Asserting only that both ran
        // would pass with them in either order.
        const order: string[] = [];
        const prepare = async () => { order.push("prepare"); };
        (Sharing.shareAsync as jest.Mock).mockImplementation(async () => {
            order.push("share");
        });
        // `mockCapture` exists only on the shared mock in jest.setup.js, not on
        // the real module, so it has to be reached through a cast.
        const {mockCapture} = viewShotModule as unknown as
            {mockCapture: jest.Mock<Promise<string>, []>};
        mockCapture.mockImplementation(async () => {
            order.push("capture");
            return "file:///mock/brew.png";
        });

        const {getByLabelText} = await render(
            <Harness src={source} prepare={prepare} />
        );
        fireEvent.press(getByLabelText("image"));
        await waitFor(() => expect(order).toEqual(["prepare", "capture", "share"]));
        mockCapture.mockReset();
        mockCapture.mockResolvedValue("file:///mock/brew.png");
        (Sharing.shareAsync as jest.Mock).mockReset();
    });

    it("still exports for a caller that has nothing to prepare", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        fireEvent.press(getByLabelText("image"));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    });
});
