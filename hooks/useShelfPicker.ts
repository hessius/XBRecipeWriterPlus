import {useState} from "react";

import type Recipe from "@/library/Recipe";

/**
 * What the picker is doing: nothing, making a shelf, or editing one.
 *
 * `editing` carries the tag it started from, because the two ends of an edit
 * have to agree about which shelf is being changed even after every member has
 * been unticked and the shelf has no members left to name it by.
 */
export type PickerMode =
    | {kind: "idle"}
    | {kind: "creating"}
    | {kind: "editing"; tag: string};

export type ShelfPicker = {
    mode: PickerMode;
    active: boolean;
    /** The uuids on the shelf, which is not the same as the uuids on screen. */
    selected: ReadonlySet<string>;
    count: number;
    startCreating: () => void;
    startEditing: (tag: string, members: readonly Recipe[]) => void;
    toggle: (uuid: string) => void;
    cancel: () => void;
    /** Everything chosen, in no particular order. The caller resolves them. */
    chosen: () => string[];
};

/**
 * The picker's selection, held apart from the library's query.
 *
 * This is the whole reason filters compose with selection: narrow to tea, tick
 * three, clear the filter, and the three stay ticked, because the selection is
 * a set of uuids that knows nothing about what is on screen. A selection stored
 * per row, or derived from the visible list, would lose a member the moment the
 * lens changed and would lose it silently.
 *
 * It is also why the bottom bar counts the shelf rather than the view: `count`
 * is the size of this set, never the size of the list.
 */
export function useShelfPicker(): ShelfPicker {
    const [mode, setMode] = useState<PickerMode>({kind: "idle"});
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

    function startCreating() {
        setSelected(new Set());
        setMode({kind: "creating"});
    }

    function startEditing(tag: string, members: readonly Recipe[]) {
        setSelected(new Set(members.map((recipe) => recipe.uuid)));
        setMode({kind: "editing", tag});
    }

    function toggle(uuid: string) {
        setSelected((current) => {
            const next = new Set(current);
            if (!next.delete(uuid)) next.add(uuid);
            return next;
        });
    }

    function cancel() {
        setMode({kind: "idle"});
        setSelected(new Set());
    }

    return {
        mode,
        active: mode.kind !== "idle",
        selected,
        count: selected.size,
        startCreating,
        startEditing,
        toggle,
        cancel,
        chosen: () => [...selected]
    };
}

export default useShelfPicker;
