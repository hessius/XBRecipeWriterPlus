import {useEffect, useState} from "react";
import {AppState} from "react-native";

import {useSetting} from "@/hooks/useSetting";
import Machine from "@/library/machine/Machine";
import {BleTransport, ensureBluetoothPermission} from "@/library/machine/Transport";

export type LinkStatus = "disconnected" | "connecting" | "connected" | "failed";

/**
 * One machine for the whole app.
 *
 * Shared rather than per-hook: the machine permits a single BLE link, so two
 * `Machine` instances would fight over it. Built lazily, because constructing
 * the transport touches the native module and importing a screen must not.
 */
let shared: Machine | undefined;

export function sharedMachine(): Machine {
    if (shared === undefined) {
        shared = new Machine(new BleTransport());
        releaseOnBackground(shared);
    }
    return shared;
}

/**
 * Give the machine's single connection slot back when the app leaves the front.
 *
 * Registered against the machine rather than from a hook, because the link
 * outlives every screen: connecting in Settings and then navigating to the
 * recipe list used to unmount the only listener, leaving the slot held by an
 * app that iOS had suspended anyway. Nothing is unsubscribed — this lives as
 * long as the machine does, which is as long as the app.
 */
function releaseOnBackground(machine: Machine): void {
    AppState.addEventListener("change", (next) => {
        if (next !== "active" && machine.isConnected()) void machine.disconnect();
    });
}

/** Tests only. */
export function __resetSharedMachine(): void {
    shared = undefined;
}

export type MachineLink = {
    machine: Machine;
    status: LinkStatus;
    error: string | null;
    /** The remembered device id, or "" if no machine has ever connected. */
    remembered: string;
    /**
     * Connect, and **throw** if it did not work.
     *
     * Callers that merely display the link swallow it and read `error`; the
     * brew path needs the throw, because "the machine is already in use by
     * another app" is a far more useful thing to tell somebody than the
     * "not connected" it would otherwise hit one line later.
     */
    connect: () => Promise<void>;
    forget: () => Promise<void>;
};

/**
 * The link to the machine: lazy to connect, sticky while the app is in front.
 *
 * @param injected Tests pass a `Machine` over a fake transport.
 */
export function useMachine(injected?: Machine): MachineLink {
    const machine = injected ?? sharedMachine();
    const [remembered, setRemembered] = useSetting("machineDeviceId");
    const [status, setStatus] = useState<LinkStatus>(
        machine.isConnected() ? "connected" : "disconnected"
    );
    const [error, setError] = useState<string | null>(null);

    // Bumped whenever the machine says something about itself, so a view
    // holding `machine.info` repaints. The info blob is mutated in place on the
    // shared machine, which React cannot see on its own.
    const [, setLinkVersion] = useState(0);

    useEffect(() => {
        // `onLink`, not `onFrame`: the case that matters most — the link
        // dropping — produces no frame at all, so a frame subscription leaves
        // the view saying "Connected" about a machine that has gone away.
        return machine.onLink(() => {
            setStatus(machine.isConnected() ? "connected" : "disconnected");
            setLinkVersion((n) => n + 1);
        });
    }, [machine]);

    async function scanForMachine(): Promise<string> {
        const found = await machine.scan();
        if (found.length === 0) {
            throw new Error("Could not find a machine. Check it is switched on and nearby.");
        }
        return found[0].id;
    }

    async function connect(): Promise<void> {
        if (machine.isConnected()) {
            setStatus("connected");
            return;
        }
        setStatus("connecting");
        setError(null);
        try {
            if (!await ensureBluetoothPermission()) {
                throw new Error("XBRW++ needs permission to use Bluetooth.");
            }
            // The remembered id first, so a returning user pays for no scan.
            let id = remembered === "" ? await scanForMachine() : remembered;
            try {
                await machine.connect(id);
            } catch (e) {
                // A remembered id can go stale — settings restored onto another
                // phone, or a machine that changed its identifier. Falling back
                // to a scan means the user is never stuck retrying a dead id
                // with "forget this machine" as their only way out.
                if (id !== remembered) throw e;
                id = await scanForMachine();
                if (id === remembered) throw e;
                await machine.connect(id);
            }
            if (id !== remembered) setRemembered(id);
            setStatus("connected");
        } catch (e) {
            setError((e as Error).message);
            setStatus("failed");
            throw e;
        }
    }

    async function forget(): Promise<void> {
        await machine.disconnect();
        setRemembered("");
        setError(null);
        setStatus("disconnected");
    }

    return {machine, status, error, remembered, connect, forget};
}

export default useMachine;
