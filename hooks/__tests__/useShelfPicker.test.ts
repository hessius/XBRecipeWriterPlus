import {act, renderHook} from "@testing-library/react-native";

import {useShelfPicker} from "@/hooks/useShelfPicker";
import Recipe from "@/library/Recipe";

function recipe(uuid: string): Recipe {
    const made = new Recipe();
    made.uuid = uuid;
    return made;
}

describe("useShelfPicker", () => {
    it("is idle until it is started", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        expect(result.current.active).toBe(false);
        expect(result.current.count).toBe(0);
    });

    it("starts a new shelf with nobody on it", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startCreating());

        expect(result.current.mode).toEqual({kind: "creating"});
        expect(result.current.count).toBe(0);
    });

    it("starts an edit holding the shelf's current members", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startEditing("Mornings", [
            recipe("a"), recipe("b")
        ]));

        expect(result.current.mode).toEqual({kind: "editing", tag: "Mornings"});
        expect(result.current.count).toBe(2);
        expect(result.current.chosen().sort()).toEqual(["a", "b"]);
    });

    it("keeps the tag after every member has been unticked", async () => {
        // The shelf being edited cannot be named by its members once they are
        // gone, so the tag has to be carried through the mode itself.
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startEditing("Mornings", [recipe("a")]));
        await act(async () => result.current.toggle("a"));

        expect(result.current.mode).toEqual({kind: "editing", tag: "Mornings"});
        expect(result.current.count).toBe(0);
    });

    it("ticks and unticks the same uuid", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startCreating());
        await act(async () => result.current.toggle("a"));
        expect(result.current.selected.has("a")).toBe(true);

        await act(async () => result.current.toggle("a"));
        expect(result.current.selected.has("a")).toBe(false);
    });

    it("forgets the selection when it is cancelled", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startEditing("Mornings", [recipe("a")]));
        await act(async () => result.current.cancel());

        expect(result.current.active).toBe(false);
        expect(result.current.count).toBe(0);
    });

    it("does not carry a selection from one shelf into the next", async () => {
        const {result} = await renderHook(() => useShelfPicker());

        await act(async () => result.current.startEditing("Mornings", [recipe("a")]));
        await act(async () => result.current.startCreating());

        expect(result.current.count).toBe(0);
    });
});
