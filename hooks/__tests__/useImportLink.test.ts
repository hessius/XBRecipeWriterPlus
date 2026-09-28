import {renderHook, act} from "@testing-library/react-native";
import * as Linking from "expo-linking";

import {useImportLink} from "@/hooks/useImportLink";

let listener: ((event: {url: string}) => void) | undefined;
const remove = jest.fn();

jest.mock("expo-linking", () => ({
    getInitialURL:    jest.fn(),
    addEventListener: jest.fn()
}));

const initial = Linking.getInitialURL as jest.Mock;
const subscribe = Linking.addEventListener as jest.Mock;

const LINK = "xbrw://import?v=1&source=brewmind&share="
    + encodeURIComponent("https://share-h5.xbloom.com/r?id=abc123");

describe("useImportLink", () => {
    beforeEach(() => {
        listener = undefined;
        remove.mockClear();
        initial.mockReset().mockResolvedValue(null);
        subscribe.mockReset().mockImplementation((_type: string, fn: (e: {url: string}) => void) => {
            listener = fn;
            return {remove};
        });
    });

    it("delivers the URL the app was launched with", async () => {
        const onLink = jest.fn();
        initial.mockResolvedValue(LINK);

        await renderHook(() => useImportLink(onLink));
        await act(async () => {});

        expect(onLink).toHaveBeenCalledWith(
            expect.objectContaining({source: "brewmind"}),
            LINK
        );
    });

    it("delivers a link that arrives while the app runs", async () => {
        const onLink = jest.fn();
        await renderHook(() => useImportLink(onLink));

        await act(async () => {
            listener?.({url: LINK});
        });

        expect(onLink).toHaveBeenCalledTimes(1);
    });

    it("delivers the same link every time it is opened", async () => {
        // The reason this is not `Linking.useURL`: that hook holds the URL in
        // state, and setting state to the string already there is not a
        // change, so the second opening is never heard. A failed import is
        // exactly when somebody opens the link again.
        const onLink = jest.fn();
        await renderHook(() => useImportLink(onLink));

        await act(async () => {
            listener?.({url: LINK});
            listener?.({url: LINK});
        });

        expect(onLink).toHaveBeenCalledTimes(2);
    });

    it("says nothing about a URL that is not an import link", async () => {
        const onLink = jest.fn();
        initial.mockResolvedValue("xbrw://");
        await renderHook(() => useImportLink(onLink));

        await act(async () => {
            listener?.({url: "xbrw://import?v=2"});
        });

        expect(onLink).not.toHaveBeenCalled();
    });

    it("survives a launch URL that cannot be read", async () => {
        const onLink = jest.fn();
        initial.mockRejectedValue(new Error("no URL"));

        await renderHook(() => useImportLink(onLink));
        await act(async () => {});

        expect(onLink).not.toHaveBeenCalled();
    });

    it("stops listening once the screen is gone", async () => {
        const onLink = jest.fn();
        const {unmount} = await renderHook(() => useImportLink(onLink));

        await act(async () => {
            unmount();
        });

        expect(remove).toHaveBeenCalled();
    });

    it("calls the caller it has now, not the one it subscribed with", async () => {
        // The subscription is made once, so a stale closure would go on
        // importing into a handler the screen has replaced.
        const first = jest.fn();
        const second = jest.fn();
        const {rerender} = await renderHook(
            ({fn}: {fn: (link: unknown, url: string) => void}) => useImportLink(fn),
            {initialProps: {fn: first as (link: unknown, url: string) => void}}
        );

        await act(async () => {
            rerender({fn: second as (link: unknown, url: string) => void});
        });
        await act(async () => {
            listener?.({url: LINK});
        });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
