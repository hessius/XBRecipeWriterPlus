import React from "react";
import {Pressable, Text} from "react-native";
import {fireEvent, render, waitFor} from "@testing-library/react-native";
import ViewShot from "react-native-view-shot";
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
function Harness({src}: {src: () => BrewExportSource | null}) {
    const {shotRef, shareImage, shareData, busy} = useBrewExport(src);
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
