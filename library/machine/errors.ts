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
