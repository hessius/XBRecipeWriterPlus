/**
 * The import state machine.
 *
 * `renderHook`, `act` and `fireEvent` are asynchronous in this repository. A
 * missing `await` leaves the assertions running against a hook that has not
 * settled, and the test passes for the wrong reason -- which has happened twice
 * here already.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {useRecipeImport} from "@/hooks/useRecipeImport";

/** A recipe as the xBloom mapper would produce it. */
function importedRecipe(xid = "ETH120"): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.xid = xid;
    recipe.dosage = 15;
    recipe.ratio = 15;
    recipe.grinder = true;
    recipe.grindSize = 50;
    recipe.grindRPM = 120;
    recipe.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

/**
 * Stands in for the network.
 *
 * `XBloomRecipe` is mocked rather than `fetch`, because what this hook cares
 * about is the recipe that comes back and the timing around it, not the
 * request body -- which `XBloomRecipe.endpoint.test.ts` already covers.
 */
const mockFetchRecipeDetail = jest.fn(async () => {});
const mockGetRecipe = jest.fn<Recipe | null, []>(() => importedRecipe());

jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => {
        // A real `XBloomRecipe` holds the recipe its own fetch produced, so the
        // instance is bound to its result at construction. `mockGetRecipe` is
        // read here rather than shared live, otherwise two lookups racing would
        // consume the `mockReturnValueOnce` queue in await order rather than
        // construction order -- the newest lookup would read the older recipe.
        const recipe = mockGetRecipe();
        return {
            fetchRecipeDetail: mockFetchRecipeDetail,
            getRecipe:   () => recipe,
            getName:     () => "Ethiopia Guji",
            getSubtitle: () => "Washed - Floral",
            getImageURL: () => "https://example.com/pod.png"
        };
    })
}));

function setup(stored: Recipe[] = []) {
    const onOpenRecipe = jest.fn();
    return {onOpenRecipe, stored};
}

beforeEach(() => {
    mockFetchRecipeDetail.mockReset().mockResolvedValue(undefined);
    mockGetRecipe.mockReset().mockReturnValue(importedRecipe());
});

describe("a paste", () => {
    it("resolves and navigates without waiting to be asked", async () => {
        // Atomic: the whole value arrived in one event, chosen deliberately.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("https://share-h5.xbloom.com/r?id=abc123");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
        expect(onOpenRecipe.mock.calls[0][1]).toBe(false);
    });

    it("is inferred from the size of the change, since RN has no onPaste", async () => {
        // A one-character change is typing, however valid the result.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12", "ETH120"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }

        expect(onOpenRecipe).not.toHaveBeenCalled();
    });
});

describe("a typed value", () => {
    it("shows what it found and waits to be asked", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });

        await waitFor(() => expect(result.current.state.status).toBe("found"));
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("navigates when the panel is pressed", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("found"));

        await act(async () => {
            result.current.openFound();
        });

        expect(onOpenRecipe).toHaveBeenCalledTimes(1);
    });

    it("clears the result when the text changes again", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("found"));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });

        expect(result.current.state.status).toBe("idle");
    });
});

describe("a recipe already in the library", () => {
    it("opens the stored one and says so", async () => {
        // `resolveOnOpen` never creates a second copy; opening the existing
        // recipe is the reveal, exactly as a card read already does.
        const existing = importedRecipe();
        const {onOpenRecipe, stored} = setup([existing]);
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
        expect(onOpenRecipe.mock.calls[0][0]).toBe(existing);
        expect(onOpenRecipe.mock.calls[0][1]).toBe(true);
    });
});

describe("failure", () => {
    it("reports an unreachable server without blaming the input", async () => {
        mockFetchRecipeDetail.mockRejectedValueOnce(new Error("offline"));
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({
            reason:  "network",
            message: "Couldn't reach xBloom. Check your connection."
        });
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("names the input when nothing came back, because that is where a typo lands", async () => {
        mockGetRecipe.mockReturnValueOnce(null);
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH999"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({
            reason:  "notFound",
            message: "No recipe with that code."
        });
    });

    it("refuses a recipe that cannot produce card bytes", async () => {
        // This one must not be swallowed: `findDuplicate` treats a recipe whose
        // fingerprint throws as identity-less, so it would slip past
        // de-duplication and into the library.
        const broken = importedRecipe();
        broken.fingerprint = () => {
            throw new Error("bad bytes");
        };
        mockGetRecipe.mockReturnValueOnce(broken);

        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({reason: "unusable"});
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });
});

describe("two lookups in flight", () => {
    it("discards everything but the newest", async () => {
        // A debounce alone cannot prevent this: a resolved value can be edited
        // while its request is still running.
        let releaseFirst!: () => void;
        mockFetchRecipeDetail
            .mockImplementationOnce(
                () => new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                })
            )
            .mockResolvedValueOnce(undefined);

        mockGetRecipe
            .mockReturnValueOnce(importedRecipe("OLD11"))
            .mockReturnValueOnce(importedRecipe("NEW22"));

        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "OLD11"}, "atomic");
        });
        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "NEW22"}, "atomic");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));

        await act(async () => {
            releaseFirst();
        });

        expect(onOpenRecipe).toHaveBeenCalledTimes(1);
        expect(onOpenRecipe.mock.calls[0][0].xid).toBe("NEW22");
    });
});

describe("the lookup debounce", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("waits 600 ms after a parsing value is typed, then resolves", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        // Typed a character at a time -- each `onChangeText` in its own `act`
        // so the render flushes and the change is inferred as +1 (typing), not
        // a bulk paste.
        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }
        expect(result.current.state.status).toBe("idle");

        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        await waitFor(() => expect(result.current.state.status).toBe("found"));
        // Still does not navigate: it was typed.
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("does not fire for a value that does not parse", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();
    });

    it("restarts on each keystroke", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        // Typed to `ETH12` a character at a time so the parsing transition is a
        // keystroke, not a paste; a bulk change would navigate atomically.
        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }
        await act(async () => {
            jest.advanceTimersByTime(400);
        });
        await act(async () => {
            result.current.onChangeText("ETH120");
        });
        await act(async () => {
            jest.advanceTimersByTime(400);
        });

        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        await waitFor(() => expect(mockFetchRecipeDetail).toHaveBeenCalledTimes(1));
    });
});

describe("the abandonment hint", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("appears after 2500 ms on a value that does not parse", async () => {
        // The sheet is otherwise silent while idle -- there is no button to
        // press -- so without this a user whose value never parses sits in
        // front of a sheet that simply does nothing.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        expect(result.current.hint).toBe(false);

        await act(async () => {
            jest.advanceTimersByTime(2500);
        });

        expect(result.current.hint).toBe(true);
    });

    it("says nothing before the timer, because a half-typed code is not a mistake", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(2400);
        });

        expect(result.current.hint).toBe(false);
    });

    it("never appears for a value that parses", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });

        expect(result.current.hint).toBe(false);
    });

    it("never appears for an empty field", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("E");
        });
        await act(async () => {
            result.current.onChangeText("");
        });
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });

        expect(result.current.hint).toBe(false);
    });

    it("clears as soon as the value parses", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(2500);
        });
        expect(result.current.hint).toBe(true);

        await act(async () => {
            result.current.onChangeText("ETH12");
        });

        expect(result.current.hint).toBe(false);
    });
});
