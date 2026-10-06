import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import {
    handoffBatchFilename,
    handoffLinkFilename,
    shareHandoffLink
} from "@/library/brew/handoff/shareLink";

const shareAsync = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;
const isAvailableAsync =
    Sharing.isAvailableAsync as jest.MockedFunction<typeof Sharing.isAvailableAsync>;
const FileMock = FSFile as unknown as jest.Mock;

const URL = "beanconqueror://ADD_BREW?len=4&shareBrew0=abcd";

function writtenFile(): {uri: string; write: jest.Mock} {
    return FileMock.mock.instances[0] as unknown as {uri: string; write: jest.Mock};
}

describe("shareHandoffLink", () => {
    beforeEach(() => {
        FileMock.mockClear();
        shareAsync.mockClear();
        isAvailableAsync.mockClear();
        isAvailableAsync.mockResolvedValue(true);
    });

    it("writes the bare URL and nothing else", async () => {
        await shareHandoffLink(URL, "handoff-sample.txt");

        // No header, no byte count, no trailing newline: whoever receives the
        // file has to be able to use the whole of it, and a stray character
        // inside a base64url payload is a corrupt import.
        expect(writtenFile().write).toHaveBeenCalledWith(URL);
    });

    it("hands the file to the share sheet as plain text", async () => {
        await shareHandoffLink(URL, "handoff-sample.txt");

        expect(shareAsync).toHaveBeenCalledWith(writtenFile().uri, {
            mimeType:    "text/plain",
            // iOS decides what the sheet may offer from the UTI, not the MIME
            // type, so losing this loses "Save to Files".
            UTI:         "public.plain-text",
            dialogTitle: "handoff-sample.txt"
        });
    });

    it("writes nothing when there is no share sheet to read it", async () => {
        isAvailableAsync.mockResolvedValue(false);

        await shareHandoffLink(URL, "handoff-sample.txt");

        expect(FileMock).not.toHaveBeenCalled();
        expect(shareAsync).not.toHaveBeenCalled();
    });

    it("swallows a cancelled share", async () => {
        shareAsync.mockRejectedValueOnce(new Error("cancelled"));

        await expect(shareHandoffLink(URL, "handoff-sample.txt")).resolves.toBeUndefined();
    });
});

describe("handoff link filenames", () => {
    it("slugs the recipe name and dates the brew", () => {
        expect(handoffLinkFilename({
            recipeName: "Ethiopia Guji / Natural",
            startedAt:  Date.UTC(2026, 9, 6, 7, 41)
        })).toBe("handoff-ethiopia-guji-natural-2026-10-06.txt");
    });

    it("falls back when a recipe has no usable name", () => {
        expect(handoffLinkFilename({recipeName: "☕️", startedAt: 0}))
            .toBe("handoff-brew-1970-01-01.txt");
    });

    it("counts a batch, and says brew in the singular", () => {
        const at = Date.UTC(2026, 9, 6);
        expect(handoffBatchFilename(7, at)).toBe("handoff-batch-7-brews-2026-10-06.txt");
        expect(handoffBatchFilename(1, at)).toBe("handoff-batch-1-brew-2026-10-06.txt");
    });
});
