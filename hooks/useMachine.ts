import {useEffect, useState} from "react";
import {AppState} from "react-native";

import {CONNECT_DELAYS_MS} from "@/constants/machine";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
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
        const machine = new Machine(new BleTransport());
        shared = machine;
        holdLinkAcrossAppState(machine, () => openLink(machine, settingsStore()));
    }
    return shared;
}

/** The remembered-machine half of the settings store, as the link needs it. */
function settingsStore(): LinkStore {
    return {
        rememberedId: () => sharedSettings().get("machineDeviceId"),
        rememberId: (id) => sharedSettings().set("machineDeviceId", id)
    };
}

/** Where the remembered machine is kept. Injected, so the algorithm is testable. */
export type LinkStore = {
    rememberedId: () => string;
    rememberId: (id: string) => void;
};

/** How a caller overrides the retrying, which is only ever a test. */
export type RetryOptions = {delays?: number[]; wait?: (ms: number) => Promise<void>};

/** The part of `AppState` this file uses, so a test can supply its own. */
export type AppStateLike = {
    addEventListener: (
        type: "change", handler: (state: string) => void
    ) => {remove: () => void};
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hold the link across the app leaving the front and coming back.
 *
 * Two halves, and the app only ever had the first. Going away releases the
 * machine's single connection slot, because an app iOS has suspended is not
 * using the link it holds. **Coming back takes it again** — without that, every
 * trip to another app left the user looking at a machine that said it was not
 * connected, with no way back but Connect, and often not even that.
 *
 * `background` only, never `inactive`. iOS fires `inactive` for notification
 * centre, the app switcher and every system alert, and releasing the link for
 * those made the connection look random.
 *
 * A link is only restored if this function is the one that gave it up. Coming
 * to the front is not a request to connect: a beep at launch, for somebody who
 * opened the app to edit a recipe, is the machine shouting about something
 * nobody asked for.
 */
export function holdLinkAcrossAppState(
    machine: Machine,
    reconnect: () => Promise<void>,
    options: {appState?: AppStateLike} = {}
): () => void {
    const appState = options.appState ?? (AppState as unknown as AppStateLike);

    // Whether the link now missing is one this function took away. Held until a
    // reconnection succeeds, so a foreground that could not reach the machine
    // is tried again the next time the app comes forward rather than written
    // off for the rest of the session.
    let released = false;
    let reconnecting = false;

    const subscription = appState.addEventListener("change", (next) => {
        if (next === "background") {
            released = machine.isConnected();
            if (released) {
                machine.note("app went to the back — giving the link back");
                void machine.disconnect();
            }
            return;
        }
        if (next !== "active") return;
        if (!released || machine.isConnected() || reconnecting) return;

        reconnecting = true;
        machine.note("app came to the front — taking the link back");
        void (async () => {
            try {
                // `reconnect` does its own retrying: connecting to this machine
                // is unreliable enough that one attempt is not a fair test.
                await reconnect();
                released = false;
            } catch (e) {
                // Bounded on purpose. A machine that has been switched off
                // should stop being asked about, and Connect is still there.
                machine.note(`could not take it back — ${(e as Error).message}`);
            }
            reconnecting = false;
        })();
    });

    return () => subscription.remove();
}

/**
 * Connect to the machine the user has already paired, if there is one.
 *
 * Called once at launch. Silent about failure on purpose: nobody pressed
 * anything, so nobody should be shown an error — the status line in Settings
 * says it well enough, and Connect is still there.
 *
 * Does nothing at all when no machine has been paired. A beep at launch, for
 * somebody who opened the app to edit a recipe and will never own a J15, is the
 * machine shouting about something nobody asked for; and it must not provoke a
 * Bluetooth permission prompt either.
 */
export async function connectRememberedMachine(
    machine: Machine,
    store: LinkStore,
    ensurePermission: () => Promise<boolean> = ensureBluetoothPermission,
    options: RetryOptions = {}
): Promise<void> {
    if (store.rememberedId() === "") return;
    try {
        await openLink(machine, store, ensurePermission, options);
    } catch {
        // Deliberately swallowed. See above.
    }
}

/**
 * Take the link at launch, if a machine has been paired.
 *
 * Called from the root layout rather than from a screen, because the settings
 * screen is where the only `useMachine` on a normal launch path lives and a
 * user who never opens it would never be connected.
 */
export function startMachineLink(): void {
    const store = settingsStore();
    // Checked here as well as inside `connectRememberedMachine`, and for a
    // different reason: building the shared machine builds the BLE manager,
    // which is enough on its own to put a "turn Bluetooth on" alert in front of
    // somebody who has never paired anything and never will.
    if (store.rememberedId() === "") return;
    void connectRememberedMachine(sharedMachine(), store);
}

/** Tests only. */
export function __resetSharedMachine(): void {
    shared = undefined;
}

/**
 * Connect to the remembered machine, or find one and remember it.
 *
 * A plain function rather than part of the hook, because the link has to be
 * restorable from the app-state handler, which runs nowhere near React.
 */
export async function openLink(
    machine: Machine,
    store: LinkStore,
    ensurePermission: () => Promise<boolean> = ensureBluetoothPermission,
    options: RetryOptions = {}
): Promise<void> {
    if (machine.isConnected()) return;
    // Outside the retrying on purpose. Waiting fourteen seconds to be told the
    // app needs permission it has already been denied helps nobody.
    if (!await ensurePermission()) {
        throw new Error("XBRW++ needs permission to use Bluetooth.");
    }

    const delays = options.delays ?? CONNECT_DELAYS_MS;
    const wait = options.wait ?? sleep;
    const startedWith = store.rememberedId();
    let lastFailure: Error | null = null;
    for (const delay of delays) {
        if (delay > 0) await wait(delay);
        // The retrying takes the better part of fifteen seconds. Somebody who
        // gives up on it and presses "forget this machine" has said what they
        // want, and connecting anyway would be the app arguing with them.
        if (startedWith !== "" && store.rememberedId() === "") {
            throw lastFailure ?? new Error("Connecting was cancelled.");
        }
        try {
            await attemptLink(machine, store);
            return;
        } catch (e) {
            lastFailure = e as Error;
        }
    }
    // The reason has to survive the retrying: "the machine is already in use by
    // another app" is far more use to somebody than "could not connect".
    throw lastFailure ?? new Error("Could not connect to the machine.");
}

/** One go at it: remembered identifier first, a scan if that has gone stale. */
async function attemptLink(machine: Machine, store: LinkStore): Promise<void> {
    const scanForMachine = async (): Promise<string> => {
        const found = await machine.scan();
        if (found.length === 0) {
            throw new Error("Could not find a machine. Check it is switched on and nearby.");
        }
        return found[0].id;
    };

    const remembered = store.rememberedId();
    // The remembered id first, so a returning user pays for no scan.
    let id = remembered === "" ? await scanForMachine() : remembered;
    try {
        await machine.connect(id);
    } catch (e) {
        // A remembered id can go stale — settings restored onto another phone,
        // or a machine that changed its identifier. Falling back to a scan
        // means the user is never stuck retrying a dead id with "forget this
        // machine" as their only way out.
        if (id !== remembered) throw e;
        id = await scanForMachine();
        if (id === remembered) throw e;
        await machine.connect(id);
    }
    if (id !== remembered) store.rememberId(id);
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
 * @param options Tests pass a `wait` that does not, so the retrying is instant.
 */
export function useMachine(injected?: Machine, options: RetryOptions = {}): MachineLink {
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

    async function connect(): Promise<void> {
        if (machine.isConnected()) {
            setStatus("connected");
            return;
        }
        setStatus("connecting");
        setError(null);
        try {
            await openLink(machine, {
                rememberedId: () => remembered,
                rememberId: setRemembered
            }, ensureBluetoothPermission, options);
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
