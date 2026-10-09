/**
 * Failures that are about the phone's radio, not about the machine.
 *
 * Kept in a module of its own so that `Machine` and its tests can tell the two
 * apart without importing `Transport`, which pulls in the native Bluetooth
 * module and cannot be loaded under Jest.
 */
export class RadioUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RadioUnavailableError";
    }
}

/**
 * The radio is there, but this phone will not let the app use it.
 *
 * Separate from `RadioUnavailableError` because the remedy is different and,
 * on Android, there are two remedies. Refuse the system dialog twice and it
 * never appears again; after that the only way back is the app's own page in
 * Settings. `canOpenSettings` is what lets the UI offer that route instead of
 * asking again for something that can no longer be asked for.
 */
export class BluetoothPermissionError extends Error {
    readonly canOpenSettings: boolean;

    constructor(message: string, canOpenSettings: boolean) {
        super(message);
        this.name = "BluetoothPermissionError";
        this.canOpenSettings = canOpenSettings;
    }
}

export class SlotOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SlotOperationError";
    }
}
