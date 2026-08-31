import {EventSubscription, Platform} from "react-native";
import BleManager, {
    BleDiscoverPeripheralEvent,
    BleManagerDidUpdateValueForCharacteristicEvent
} from "react-native-ble-manager";

import {
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
    /** Every notification frame, uninterpreted. Returns an unsubscribe. */
    onFrame(listener: (frame: Uint8Array) => void): () => void;
    /** Fires when the link drops for any reason, including a deliberate one. */
    onDisconnect(listener: () => void): () => void;
    isConnected(): boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    private frameListeners = new Set<(frame: Uint8Array) => void>();
    private disconnectListeners = new Set<() => void>();
    private subscriptions: EventSubscription[] = [];

    private async start(): Promise<void> {
        if (this.started) return;
        await BleManager.start({showAlert: false});
        this.subscriptions.push(
            BleManager.onDidUpdateValueForCharacteristic(
                ({value}: BleManagerDidUpdateValueForCharacteristicEvent) => {
                    const frame = Uint8Array.from(value);
                    this.frameListeners.forEach((listener) => listener(frame));
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
                }
            }
        );
        try {
            // Unfiltered, because firmware that advertises the name without the
            // service UUID would be invisible to a filtered scan. The name and
            // service checks above are what narrow it back down.
            await BleManager.scan({seconds, allowDuplicates: false});
            await sleep(seconds * 1000);
        } finally {
            subscription.remove();
            await BleManager.stopScan().catch(() => {});
        }
        return [...found.values()];
    }

    async connect(id: string): Promise<void> {
        await this.start();
        await BleManager.connect(id);
        await BleManager.retrieveServices(id);
        await BleManager.startNotification(
            id, MACHINE_SERVICE, MACHINE_NOTIFY_CHARACTERISTIC
        );
        this.deviceId = id;
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
        await BleManager.writeWithoutResponse(
            id, MACHINE_SERVICE, MACHINE_WRITE_CHARACTERISTIC, Array.from(frame)
        );
    }

    onFrame(listener: (frame: Uint8Array) => void): () => void {
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
 * Android 12 and up wants BLUETOOTH_SCAN and BLUETOOTH_CONNECT at runtime; iOS
 * asks for itself, on first use, using the purpose string in `app.json`.
 */
export async function ensureBluetoothPermission(): Promise<boolean> {
    if (Platform.OS !== "android") return true;
    const {PermissionsAndroid} = await import("react-native");
    const granted = await PermissionsAndroid.requestMultiple([
        "android.permission.BLUETOOTH_SCAN" as never,
        "android.permission.BLUETOOTH_CONNECT" as never
    ]);
    return Object.values(granted).every((result) => result === "granted");
}
