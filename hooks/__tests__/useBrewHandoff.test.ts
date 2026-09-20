import {act, renderHook} from "@testing-library/react-native";
import {Linking} from "react-native";

import {HANDOFF_OPEN_FAILED, HANDOFF_TOO_LARGE, useBrewHandoff} from "@/hooks/useBrewHandoff";
import type {BrewExportSource} from "@/hooks/useBrewExport";
import {notify} from "@/components/XbrwToast";
import * as handoffEncode from "@/library/brew/handoff/encode";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const notifyMock = notify as jest.MockedFunction<typeof notify>;
let openURL: jest.SpiedFunction<typeof Linking.openURL>;

function source(): BrewExportSource {
    return {record: brew(), samples};
}

describe("useBrewHandoff", () => {
    beforeEach(() => {
        openURL = jest.spyOn(Linking, "openURL");
        openURL.mockReset();
        openURL.mockResolvedValue(undefined);
        notifyMock.mockClear();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("opens a Beanconqueror brew handoff URL", async () => {
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledWith(expect.stringMatching(
            /^beanconqueror:\/\/ADD_BREW\?len=\d+&shareBrew0=/
        ));
    });

    it("ignores a second press while the first handoff is still in flight", async () => {
        let release!: () => void;
        openURL.mockImplementationOnce(
            () => new Promise<void>((resolve) => { release = resolve; })
        );
        const {result} = await renderHook(() => useBrewHandoff(source));
        let first!: Promise<void>;
        let second!: Promise<void>;

        await act(async () => {
            first = result.current.send();
            await Promise.resolve();
        });

        expect(result.current.busy).toBe(true);

        await act(async () => {
            second = result.current.send();
            expect(openURL).toHaveBeenCalledTimes(1);
            release();
            await Promise.all([first, second]);
        });

        expect(openURL).toHaveBeenCalledTimes(1);
    });

    it("allows another handoff after the first one completes", async () => {
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });
        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledTimes(2);
    });

    it("reports a rejected open to the user as a Beanconqueror error", async () => {
        openURL.mockRejectedValueOnce(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_OPEN_FAILED
        });
    });

    it("clears busy after Beanconqueror cannot be opened", async () => {
        openURL.mockRejectedValueOnce(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(result.current.busy).toBe(false);
    });

    it("reports an encoding failure as an oversized brew and clears busy", async () => {
        jest.spyOn(handoffEncode, "encodeHandoff").mockImplementationOnce(() => {
            throw new Error("too large");
        });
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_TOO_LARGE
        });
        expect(notifyMock).not.toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_OPEN_FAILED
        });
        expect(result.current.busy).toBe(false);
    });

    it("does nothing when there is no brew to hand off", async () => {
        const {result} = await renderHook(() => useBrewHandoff(() => null));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).not.toHaveBeenCalled();
        expect(result.current.busy).toBe(false);
    });

    it("uses handoff failure copy without any dash characters", () => {
        for (const message of [HANDOFF_OPEN_FAILED, HANDOFF_TOO_LARGE]) {
            expect(message).not.toMatch(/[-–—]/);
        }
    });
});
