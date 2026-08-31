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
    shared ??= new Machine(new BleTransport());
    return shared;
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

    useEffect(() => {
        const off = machine.onFrame(() => {
            if (!machine.isConnected()) setStatus("disconnected");
        });
        // Backgrounding releases the machine's single connection slot back to
        // the official app. Without a background mode iOS suspends us anyway,
        // so holding it would be a fiction rather than a feature.
        const subscription = AppState.addEventListener("change", (next) => {
            if (next !== "active" && machine.isConnected()) {
                void machine.disconnect();
                setStatus("disconnected");
            }
        });
        return () => {
            off();
            subscription.remove();
        };
    }, [machine]);

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
            let id = remembered;
            if (id === "") {
                const found = await machine.scan();
                if (found.length === 0) {
                    throw new Error(
                        "Could not find a machine. Check it is switched on and nearby."
                    );
                }
                id = found[0].id;
            }
            await machine.connect(id);
            if (id !== remembered) setRemembered(id);
            setStatus("connected");
        } catch (e) {
            setError((e as Error).message);
            setStatus("failed");
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
