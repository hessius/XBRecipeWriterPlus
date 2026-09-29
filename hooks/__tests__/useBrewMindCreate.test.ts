import {renderHook, act} from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";

import {useBrewMindCreate, BREWMIND_CREATE_URL, BREWMIND_RETURN_URL} from "@/hooks/useBrewMindCreate";

jest.mock("expo-web-browser", () => ({
    openAuthSessionAsync: jest.fn()
}));

const session = WebBrowser.openAuthSessionAsync as jest.Mock;

const returned = (url: string) => ({type: "success", url});

const LINK = "xbrw://import?v=1&source=brewmind&share="
    + encodeURIComponent("https://share-h5.xbloom.com/r?id=abc123")
    + "&bean.name=Finca";

describe("useBrewMindCreate", () => {
    beforeEach(() => session.mockReset());

    it("sends the user to BrewMind, saying who is asking", async () => {
        session.mockResolvedValue({type: "dismiss"});
        const {result} = await renderHook(() => useBrewMindCreate(jest.fn()));

        await act(async () => {
            await result.current.open();
        });

        expect(session).toHaveBeenCalledWith(BREWMIND_CREATE_URL, BREWMIND_RETURN_URL);
    });

    it("hands back the link the session returned", async () => {
        const onLink = jest.fn();
        session.mockResolvedValue(returned(LINK));
        const {result} = await renderHook(() => useBrewMindCreate(onLink));

        await act(async () => {
            await result.current.open();
        });

        expect(onLink).toHaveBeenCalledWith(
            expect.objectContaining({
                share:  "https://share-h5.xbloom.com/r?id=abc123",
                source: "brewmind",
                coffee: {name: "Finca"}
            }),
            // The raw URL goes with it: on Android this same redirect is also
            // delivered as a Linking event, and the caller can only recognise
            // the two as one arrival by the string.
            LINK
        );
    });

    it("says nothing when the user simply comes back", async () => {
        // Closing the browser is not a failure, and there is nothing to
        // report: the sheet they started from is still in front of them.
        const onLink = jest.fn();
        session.mockResolvedValue({type: "cancel"});
        const {result} = await renderHook(() => useBrewMindCreate(onLink));

        await act(async () => {
            await result.current.open();
        });

        expect(onLink).not.toHaveBeenCalled();
    });

    it("ignores a returned URL it cannot read", async () => {
        const onLink = jest.fn();
        session.mockResolvedValue(returned("xbrw://import?v=99"));
        const {result} = await renderHook(() => useBrewMindCreate(onLink));

        await act(async () => {
            await result.current.open();
        });

        expect(onLink).not.toHaveBeenCalled();
    });

    it("survives a session that throws", async () => {
        const onLink = jest.fn();
        session.mockRejectedValue(new Error("no browser"));
        const {result} = await renderHook(() => useBrewMindCreate(onLink));

        await act(async () => {
            await result.current.open();
        });

        expect(onLink).not.toHaveBeenCalled();
        // And the trip is over, so the button is pressable again rather than
        // stuck showing a spinner for a session that already failed.
        expect(result.current.busy).toBe(false);
    });

    it("does not open a second session over the first", async () => {
        let release: (value: unknown) => void = () => undefined;
        session.mockImplementation(() => new Promise((resolve) => {
            release = resolve;
        }));
        const {result} = await renderHook(() => useBrewMindCreate(jest.fn()));

        await act(async () => {
            void result.current.open();
        });
        expect(result.current.busy).toBe(true);

        await act(async () => {
            void result.current.open();
        });
        expect(session).toHaveBeenCalledTimes(1);

        await act(async () => {
            release({type: "cancel"});
        });
        expect(result.current.busy).toBe(false);
    });
});
