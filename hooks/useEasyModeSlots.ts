import {useRef, useState, useSyncExternalStore} from "react";
import {appDatabase} from "@/library/appDatabase";
import Recipe from "@/library/Recipe";
import {pushPrepared} from "@/hooks/steadyRouter";
import {notify} from "@/components/XbrwToast";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    emptySlotRecord, objectValue, readSnapshot, snapshotRecipe, type SlotIndex, type SlotRecord
} from "@/library/slots/slotModel";
import {
    recoverSlots, writeSlots, unavailableSlotPort, type SlotIdentity, type SlotPort
} from "@/library/slots/slotWriter";

const databases = new WeakMap<object, SlotDatabase>();
const unpaired = emptySlotRecord();

export function sharedSlotDatabase(): SlotDatabase {
    const sql = appDatabase();
    let store = databases.get(sql);
    if (store === undefined) {
        store = new SlotDatabase(sql);
        databases.set(sql, store);
    }
    return store;
}

export function useSlotRecord(deviceId: string, supplied?: SlotDatabase): SlotRecord {
    return useSyncExternalStore(
        (listener) => deviceId === "" ? () => {} : (supplied ?? sharedSlotDatabase()).subscribe(listener),
        () => deviceId === "" ? unpaired : (supplied ?? sharedSlotDatabase()).read(deviceId)
    );
}

export function prepareEasyModeEntry(
    store: SlotDatabase, deviceId: string, recipe: Recipe
): {pathname: "/easyMode"; params?: {recipeJSON: string}} {
    const record = store.read(deviceId);
    if (record.journal !== null) return {pathname: "/easyMode"};
    const snapshot = snapshotRecipe(recipe);
    const empty = record.drafts.findIndex((slot) => slot === null);
    if (deviceId !== "" && record.journal === null && (empty === 0 || empty === 1 || empty === 2)) {
        store.assign(deviceId, empty, snapshot);
        return {pathname: "/easyMode"};
    }
    return {pathname: "/easyMode", params: {recipeJSON: snapshot.recipeJSON}};
}

export function openEasyModeRecipe(recipe: Recipe, deviceId: string): void {
    try {
        pushPrepared(JSON.stringify(["easyMode", deviceId, recipe.uuid]),
            () => prepareEasyModeEntry(sharedSlotDatabase(), deviceId, recipe));
    } catch (error) {
        notify({tone: "error", message: error instanceof Error ? error.message : String(error)});
    }
}

export function incomingEasyModeRecipe(value: string | string[] | undefined): {
    recipe?: Recipe; error: string | null;
} {
    if (value === undefined) return {error: null};
    try {
        if (typeof value !== "string") throw new Error("Supply one recipe.");
        const parsed: unknown = JSON.parse(value);
        if (!objectValue(parsed) || typeof parsed.uuid !== "string" || parsed.uuid.trim() === ""
            || !Array.isArray(parsed.pours)) {
            throw new Error("The recipe identity or stages are missing.");
        }
        const recipe = new Recipe(undefined, value);
        readSnapshot({...snapshotRecipe(recipe), recipeJSON: value});
        return {recipe, error: null};
    } catch (error) {
        return {error: `Incoming recipe could not be opened: ${
            error instanceof Error ? error.message : String(error)
        }`};
    }
}

export function useEasyModeSlots(
    identity: SlotIdentity, port: SlotPort = unavailableSlotPort, supplied?: SlotDatabase
) {
    const record = useSlotRecord(identity.deviceId, supplied);
    const [failure, setFailure] = useState<{deviceId: string; message: string} | null>(null);
    const [running, setRunning] = useState(false);
    const active = useRef(false);

    function report(failure: unknown): void {
        setFailure({
            deviceId: identity.deviceId,
            message: failure instanceof Error ? failure.message : String(failure)
        });
    }

    function assign(index: SlotIndex, recipe: Recipe): boolean {
        if (active.current) {
            report("Wait for the current slot operation to finish.");
            return false;
        }
        try {
            (supplied ?? sharedSlotDatabase()).assign(identity.deviceId, index, snapshotRecipe(recipe));
            setFailure(null);
            return true;
        } catch (failure) {
            report(failure);
            return false;
        }
    }

    async function run(recovery: boolean): Promise<void> {
        if (active.current) return;
        active.current = true;
        setRunning(true);
        setFailure(null);
        try {
            const store = supplied ?? sharedSlotDatabase();
            await (recovery ? recoverSlots(store, identity, port) : writeSlots(store, identity, port));
        } catch (failure) {
            report(failure);
        }
        active.current = false;
        setRunning(false);
    }

    return {
        record, error: failure?.deviceId === identity.deviceId ? failure.message : null,
        running, available: port.available, assign,
        write: () => run(false), recover: () => run(true)
    };
}
