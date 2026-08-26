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
    // Balanced and writable: `dosage * ratio` (15 * 15 = 225) equals the single
    // pour's volume, which the machine requires (`isPourVolumeValid`), and 225
    // ml is inside `cardLimits`' 240 ml per-stage maximum. The roadmap's
    // 18/16/288 would have been rejected -- 288 ml overflows that limit.
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

    it("does not misread two batched keystrokes as a paste", async () => {
        // Two `onChangeText` calls dispatched in one tick, with no render flush
        // between them. If the previous value were read from render state, the
        // second call would still see the pre-batch `"ETH1"` and compute a delta
        // of 2 for `"ETH120"` -- a parseable value -- and navigate atomically
        // mid-keystroke. A ref updated synchronously inside the handler sees
        // `"ETH12"` as the previous value, so `"ETH120"` is a +1 keystroke.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });

        await act(async () => {
            result.current.onChangeText("ETH12");
            result.current.onChangeText("ETH120");
        });

        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(result.current.state.status).toBe("idle");
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

    it("clears a found result when the text is edited again", async () => {
        // Typed one character at a time: feeding the whole value in one
        // `onChangeText` is a +N delta, which the paste heuristic classifies as
        // atomic and navigates, never reaching the invalidation branch this
        // test names.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("found"));

        await act(async () => {
            result.current.onChangeText("E");
        });

        expect(result.current.state.status).toBe("idle");
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("clears an error the same way when the text is edited", async () => {
        // The invalidation rule applies to `error` as well as `found`; a typo
        // that failed must not linger once the user starts correcting it.
        mockGetRecipe.mockReturnValueOnce(null);
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH999"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("error"));

        await act(async () => {
            result.current.onChangeText("E");
        });

        expect(result.current.state.status).toBe("idle");
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });
});

describe("the tile's paste shortcut", () => {
    it("navigates on a recipe not already in the library", async () => {
        // Atomic-like: a fresh recipe reached from the shortcut opens the editor
        // straight away, with no field to type in.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "shortcut");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
        expect(onOpenRecipe.mock.calls[0][1]).toBe(false);
    });

    it("degrades to the found panel with the field shown when the recipe is already held", async () => {
        // The sticky-clipboard fix: tapping IMPORT with recipe A still on the
        // clipboard after importing A must not re-open A. Instead the shortcut
        // stops at the found panel and restores the field, so the user can enter
        // a different recipe -- which is what they opened the tile for.
        const existing = importedRecipe();
        const {onOpenRecipe, stored} = setup([existing]);
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "shortcut");
        });

        await waitFor(() => expect(result.current.state.status).toBe("found"));
        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(result.current.showField).toBe(true);
        expect(result.current.state).toMatchObject({preview: {isExisting: true}});
    });
});

describe("a recipe already in the library", () => {
    it("opens the stored one and says so", async () => {
        // `resolveOnOpen` never creates a second copy; opening the existing
        // recipe is the reveal, exactly as a card read already does. This is the
        // atomic path -- a share intent -- which still navigates to a held
        // recipe, unlike the tile shortcut which degrades.
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

    it("restores the field after an atomic paste fails, so the user can retry", async () => {
        // The paste hid the field while resolving; a network error has nothing
        // to navigate to, so the field must come back or the sheet strands the
        // user on an error line with no input and no button.
        mockFetchRecipeDetail.mockRejectedValueOnce(new Error("offline"));
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.showField).toBe(true);
    });

    it("restores the field after a shortcut lookup fails", async () => {
        mockGetRecipe.mockReturnValueOnce(null);
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH999"}, "shortcut");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.showField).toBe(true);
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

describe("a paste affordance (onPastedText)", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("resolves and navigates when the pasted text parses", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onPastedText("https://share-h5.xbloom.com/r?id=abc123");
        });

        expect(onOpenRecipe).toHaveBeenCalledTimes(1);
    });

    it("disarms a debounce armed by earlier typing", async () => {
        // The trace: type `ETH12` (a 600 ms debounce is armed), then tap paste
        // while the clipboard holds junk. If the paste did not invalidate, the
        // stale debounce would fire 600 ms later and show a found panel for text
        // no longer in the field -- pressing it imports something unrelated to
        // what is on screen.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }

        await act(async () => {
            result.current.onPastedText("not a recipe at all");
        });

        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(result.current.state.status).toBe("idle");
        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("shows the hint immediately when the pasted text does not parse", async () => {
        // A paste is finished by definition, so the 2500 ms "still typing?"
        // grace does not apply: unparseable paste would otherwise leave the
        // silent sheet with no feedback at all until the user starts typing.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onPastedText("not a recipe at all");
        });

        // No timer advanced: the hint is up immediately, not after `ABANDONED_MS`.
        expect(result.current.hint).toBe(true);
    });
});

describe("resolving, reset and unmount", () => {
    it("reports resolving while a lookup is in flight", async () => {
        let releaseFetch!: () => void;
        mockFetchRecipeDetail.mockImplementationOnce(
            () => new Promise<void>((resolve) => {
                releaseFetch = resolve;
            })
        );

        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        expect(result.current.state.status).toBe("resolving");

        await act(async () => {
            releaseFetch();
        });
        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
    });

    it("reset() empties the field, returns to idle, and cancels an armed debounce", async () => {
        jest.useFakeTimers();
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }

        await act(async () => {
            result.current.reset();
        });

        expect(result.current.value).toBe("");
        expect(result.current.state.status).toBe("idle");

        // The debounce armed before the reset must not later fire.
        await act(async () => {
            jest.advanceTimersByTime(600);
        });
        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it("does not call setState after unmounting mid-flight", async () => {
        let releaseFetch!: () => void;
        mockFetchRecipeDetail.mockImplementationOnce(
            () => new Promise<void>((resolve) => {
                releaseFetch = resolve;
            })
        );

        const {onOpenRecipe, stored} = setup();
        const {result, unmount} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await act(async () => {
            unmount();
        });

        // Releasing the request after unmount must be inert: the generation was
        // bumped and the controller aborted on cleanup, so the resolved lookup
        // has nothing to say and never navigates.
        await act(async () => {
            releaseFetch();
        });

        expect(onOpenRecipe).not.toHaveBeenCalled();
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

        // One millisecond short: the debounce must not have fired yet. This is
        // what actually pins the constant. `waitFor` is fake-timer aware and
        // advances the clock itself, so `advanceTimersByTime(600)` followed by a
        // bare `waitFor` tolerates a debounce anywhere up to ~1600 ms -- it
        // would pass at 1000 ms just as happily and pins nothing.
        await act(async () => {
            jest.advanceTimersByTime(599);
        });
        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();
        expect(result.current.state.status).toBe("idle");

        // The 600th millisecond fires it. Asserted synchronously, no `waitFor`.
        await act(async () => {
            jest.advanceTimersByTime(1);
        });

        expect(result.current.state.status).toBe("found");
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
            jest.advanceTimersByTime(599);
        });

        expect(mockFetchRecipeDetail).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(1);
        });
        expect(mockFetchRecipeDetail).toHaveBeenCalledTimes(1);
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

        // One character at a time so the parsing transition is a keystroke, not
        // a paste. Fed whole, `ETH12` is a +5 change that resolves atomically
        // and returns before the hint-arming code is ever evaluated -- so the
        // original single-call test never reached the branch it names.
        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }

        // The parsing branch arms the debounce and returns; it must not also
        // touch the hint. Asserted here, while the debounce is still pending,
        // because the resolve it later fires calls `setHint(false)` -- so a hint
        // wrongly shown for a parsing value would be scrubbed by the time it
        // resolves, and only this pre-debounce check can see it.
        expect(result.current.hint).toBe(false);

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
