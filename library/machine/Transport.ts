import {EventSubscription, Platform} from "react-native";
import BleManager, {
    BleDiscoverPeripheralEvent,
    BleManagerDidUpdateValueForCharacteristicEvent
} from "react-native-ble-manager";

import {
    ATT_HEADER_BYTES,
    DEFAULT_MTU,
    MACHINE_MTU,
    MACHINE_NAME_PREFIX,
    MACHINE_NOTIFY_CHARACTERISTIC,
    MACHINE_SERVICE,
    MACHINE_WRITE_CHARACTERISTIC,
    SCAN_SECONDS
} from "@/constants/machine";

export type FoundMachine = {id: string; name: string};

/**
 * What `Machine` needs of a radio.
 *
 * An interface rather than a hard dependency, so the state machine above can be
 * driven by a scripted fake. That is the whole reason this layer exists
 * separately: nothing below it can be tested, so everything above it must be
 * able to run without it.
 */
export interface MachineTransport {
    scan(seconds?: number): Promise<FoundMachine[]>;
    connect(id: string): Promise<void>;
    disconnect(): Promise<void>;
    /** Raw frame, already built. */
    write(frame: Uint8Array): Promise<void>;
    /**
     * Every notification frame, uninterpreted. Returns an unsubscribe.
     *
     * `source` names the characteristic it arrived on. The machine notifies on
     * more than one, and a log that does not say which cannot answer whether a
     * given channel is ever used.
     */
    onFrame(listener: (frame: Uint8Array, source?: string) => void): () => void;
    /** Fires when the link drops for any reason, including a deliberate one. */
    onDisconnect(listener: () => void): () => void;
    isConnected(): boolean;
    /** What happened to each notify subscription at the last connect. */
    channels?: string[];
    /** The longest frame the link will carry, if the transport knows. */
    frameBudget?: number;
    /**
     * Every service and characteristic the machine offers, one line each.
     *
     * Diagnostic only. We enable notifications on exactly one characteristic,
     * so a signal on any other would be invisible to the app by construction —
     * and nothing short of asking the radio can tell "the machine never sends
     * this" apart from "we never listened".
     */
    describeGatt?(): Promise<string[]>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether two UUIDs name the same thing.
 *
 * A radio may report `ffe2`, `0000ffe2`, or the full 128-bit form for one
 * characteristic, depending on the platform and on whether it is a standard
 * short UUID. Comparing the strings directly makes the app deaf to its own
 * channel on whichever platform disagrees with the constant.
 */
function sameUuid(a: string, b: string): boolean {
    const trim = (uuid: string) => uuid.toLowerCase().replace(/^0+/, "").replace(/-.*$/, "");
    return trim(a) === trim(b);
}

/** The recognisable part of a UUID, for a log line a person has to read. */
function shortUuid(uuid: string): string {
    const match = /^0000([0-9a-f]{4})-/i.exec(uuid);
    return (match === null ? uuid : match[1]).toLowerCase();
}

/** Property names, whichever shape the platform reports them in. */
function propertyNames(properties: unknown): string[] {
    if (Array.isArray(properties)) return properties.map(String);
    if (properties !== null && typeof properties === "object") {
        return Object.values(properties as Record<string, unknown>).map(String);
    }
    return [];
}

/**
 * The real radio.
 *
 * Wraps `react-native-ble-manager` and nothing else: it emits `Uint8Array`s
 * upward and interprets none of them. Same role and same shape as
 * `library/NFC.ts`, and untested for the same reason — a wrapper around a
 * native radio cannot run in Jest or in a simulator.
 */
export class BleTransport implements MachineTransport {
    private deviceId: string | null = null;
    private started = false;
    private frameListeners = new Set<(frame: Uint8Array, source?: string) => void>();
    private disconnectListeners = new Set<() => void>();
    private subscriptions: EventSubscription[] = [];
    /**
     * What happened to each notify subscription at the last connect.
     *
     * A channel that refuses does not cost the connection, which means the
     * refusal has to be recorded somewhere or it is indistinguishable from a
     * channel the machine simply never uses.
     */
    public channels: string[] = [];

    /**
     * The longest frame the link will carry, where that is knowable.
     *
     * Undefined means unknown, and unknown must not be read as small. Only
     * Android tells us anything: `requestMTU` is an Android call, and on iOS
     * CoreBluetooth negotiates for itself and reports nothing back. Treating
     * iOS's rejection as the 20-byte floor invented a limit the link does not
     * have, and with a budget enforced on top of it no iPhone could have
     * brewed at all.
     */
    public frameBudget: number | undefined = undefined;

    private async start(): Promise<void> {
        if (this.started) return;
        await BleManager.start({showAlert: false});
        this.subscriptions.push(
            BleManager.onDidUpdateValueForCharacteristic(
                ({value, characteristic}: BleManagerDidUpdateValueForCharacteristicEvent) => {
                    const frame = Uint8Array.from(value);
                    const source = shortUuid(characteristic ?? "");
                    this.frameListeners.forEach((listener) => listener(frame, source));
                }
            ),
            BleManager.onDisconnectPeripheral(() => {
                this.deviceId = null;
                this.disconnectListeners.forEach((listener) => listener());
            })
        );
        this.started = true;
    }

    async scan(seconds = SCAN_SECONDS): Promise<FoundMachine[]> {
        await this.start();
        const found = new Map<string, FoundMachine>();
        // Resolved by whichever comes first: a machine, or the window closing.
        // A machine that is switched on and next to the phone advertises within
        // a second or two, and sitting out the remaining eight while the user
        // watches a spinner is most of why this felt so much slower than the
        // official app. There is only ever one machine to find.
        let stop: () => void = () => {};
        const finished = new Promise<void>((resolve) => { stop = resolve; });

        const subscription = BleManager.onDiscoverPeripheral(
            (peripheral: BleDiscoverPeripheralEvent) => {
                const name = peripheral.name ?? peripheral.advertising?.localName ?? "";
                // Some units advertise the service UUID, some only the name.
                // Scanning filtered by service alone misses the latter.
                const advertised = peripheral.advertising?.serviceUUIDs ?? [];
                const matchesService = advertised.some(
                    (uuid) => uuid.toUpperCase() === MACHINE_SERVICE.toUpperCase()
                );
                if (matchesService || name.toUpperCase().startsWith(MACHINE_NAME_PREFIX)) {
                    found.set(peripheral.id, {id: peripheral.id, name});
                    stop();
                }
            }
        );
        try {
            // Unfiltered, because firmware that advertises the name without the
            // service UUID would be invisible to a filtered scan. The name and
            // service checks above are what narrow it back down.
            await BleManager.scan({seconds, allowDuplicates: false});
            await Promise.race([finished, sleep(seconds * 1000)]);
        } finally {
            subscription.remove();
            await BleManager.stopScan().catch(() => {});
        }
        return [...found.values()];
    }

    async connect(id: string): Promise<void> {
        await this.start();
        try {
            await BleManager.connect(id);
        } catch (error) {
            // A link the operating system is still holding from a previous run
            // of the JavaScript — a reload in development, or a crash — is
            // invisible up here, because `deviceId` was reset and the radio's
            // was not. The machine allows one link, so that ghost is enough to
            // lock the user out until they power-cycle the machine, which is
            // not a thing anybody should have to work out for themselves.
            await BleManager.disconnect(id).catch(() => {});
            try {
                await BleManager.connect(id);
            } catch {
                throw error;
            }
        }
        const services = await BleManager.retrieveServices(id);
        await this.listenToEverythingThatTalks(id, services);
        // Best effort: a stack that refuses still carries every frame short
        // enough to fit the default, so this is not a reason to fail the
        // connection. It is a reason to say what happened. Swallowed entirely,
        // a refusal looked exactly like a grant, and the only symptom would
        // have been long frames quietly not arriving.
        await this.negotiateMtu(id);
        this.deviceId = id;
    }

    /**
     * Ask for a bigger MTU, and record what came back.
     *
     * The budget is the MTU minus the three-byte ATT header. 23 is the MTU
     * every LE stack must support, so 20 is what a refusal leaves us with --
     * enough for a command, not enough for a recipe blob.
     */
    private async negotiateMtu(id: string): Promise<void> {
        if (Platform.OS !== "android") {
            // Not a failure, and not a budget. Say so, so the log does not read
            // like something went wrong.
            this.channels.push("MTU negotiated by iOS itself, and not reported");
            return;
        }
        try {
            const granted = await BleManager.requestMTU(id, MACHINE_MTU);
            const mtu = typeof granted === "number" && granted > 0 ? granted : DEFAULT_MTU;
            this.frameBudget = mtu - ATT_HEADER_BYTES;
            this.channels.push(`MTU ${mtu}, so ${this.frameBudget} bytes a frame`);
        } catch (e) {
            this.frameBudget = DEFAULT_MTU - ATT_HEADER_BYTES;
            this.channels.push(
                `MTU refused (${(e as Error).message}) — ${this.frameBudget} bytes a frame`
            );
        }
    }

    /**
     * Enable notifications on every characteristic that offers them.
     *
     * Not only `ffe2`. Hardware reports `ffe3` on the same service carrying
     * Notify too, and a channel nobody subscribed to is indistinguishable from
     * a channel the machine never uses — which is how the tank level and the
     * info blob both came to look like things the machine simply does not send.
     *
     * `ffe2` is subscribed to whatever the radio lists, because the app has
     * always worked over it and a stack that describes itself poorly must not
     * leave us deaf. The extra channels are a discovery, so one refusing is not
     * worth the connection.
     */
    private async listenToEverythingThatTalks(
        id: string, services: {characteristics?: unknown[]} | undefined
    ): Promise<void> {
        this.channels = [];
        await this.listen(id, MACHINE_SERVICE, MACHINE_NOTIFY_CHARACTERISTIC);

        const listed = (services?.characteristics ?? []) as {
            service?: string; characteristic?: string; properties?: unknown;
        }[];
        for (const entry of listed) {
            const characteristic = entry.characteristic ?? "";
            if (!sameUuid(entry.service ?? "", MACHINE_SERVICE)) continue;
            if (sameUuid(characteristic, MACHINE_NOTIFY_CHARACTERISTIC)) continue;
            if (!propertyNames(entry.properties).some((name) => /notify|indicate/i.test(name))) {
                continue;
            }
            await this.listen(id, entry.service ?? MACHINE_SERVICE, characteristic);
        }
    }

    /** Subscribe, and record what came of it. Never throws. */
    private async listen(id: string, service: string, characteristic: string): Promise<void> {
        const name = shortUuid(characteristic);
        try {
            await BleManager.startNotification(id, service, characteristic);
            this.channels.push(`${name} listening`);
        } catch (e) {
            this.channels.push(`${name} refused — ${(e as Error).message}`);
        }
    }

    async describeGatt(): Promise<string[]> {
        const id = this.deviceId;
        if (id === null) throw new Error("not connected");
        const info = await BleManager.retrieveServices(id);
        return (info.characteristics ?? []).map((entry) =>
            `${entry.service}/${entry.characteristic} `
            + `${propertyNames(entry.properties).join(",") || "—"}`);
    }

    async disconnect(): Promise<void> {
        const id = this.deviceId;
        this.deviceId = null;
        if (id === null) return;
        await BleManager.disconnect(id).catch(() => {});
    }

    async write(frame: Uint8Array): Promise<void> {
        const id = this.deviceId;
        if (id === null) throw new Error("not connected");
        // Write **Without** Response. With-response is rejected by the machine
        // with CBATTErrorDomain Code=14 — this is not a performance choice.
        //
        // `maxByteSize` is passed explicitly because it defaults to 20, and a
        // frame longer than that is otherwise split into separate ATT writes.
        // The machine reads each fragment as a whole frame, fails the header
        // and CRC on all of them, and answers nothing — which is exactly how
        // this milestone first reached hardware: connecting and reading the
        // machine's serial worked, because those frames are 20 and 12 bytes,
        // and every frame in the brew path is bigger.
        await BleManager.writeWithoutResponse(
            id, MACHINE_SERVICE, MACHINE_WRITE_CHARACTERISTIC, Array.from(frame),
            frame.length
        );
    }

    onFrame(listener: (frame: Uint8Array, source?: string) => void): () => void {
        this.frameListeners.add(listener);
        return () => {
            this.frameListeners.delete(listener);
        };
    }

    onDisconnect(listener: () => void): () => void {
        this.disconnectListeners.add(listener);
        return () => {
            this.disconnectListeners.delete(listener);
        };
    }

    isConnected(): boolean {
        return this.deviceId !== null;
    }
}

/**
 * Ask for whatever this platform needs before the radio is usable.
 *
 * iOS asks for itself, on first use, using the purpose string in `app.json`.
 *
 * Android split this in two. From API 31 the radio has its own permissions,
 * BLUETOOTH_SCAN and BLUETOOTH_CONNECT. Before that, scanning was treated as a
 * way of working out where you are, and so required ACCESS_FINE_LOCATION —
 * asking only for the newer pair on Android 11 grants nothing at all, and the
 * scan comes back empty with no explanation.
 */
export async function ensureBluetoothPermission(): Promise<boolean> {
    if (Platform.OS !== "android") return true;
    const {PermissionsAndroid} = await import("react-native");
    const needed = Number(Platform.Version) >= 31
        ? ["android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"]
        : ["android.permission.ACCESS_FINE_LOCATION"];
    const granted = await PermissionsAndroid.requestMultiple(needed as never[]);
    return Object.values(granted).every((result) => result === "granted");
}
