import type {FoundMachine, MachineTransport} from "@/library/machine/Transport";

import {notification} from "./protocolFixtures";

/**
 * The frame a machine sends to describe itself.
 *
 * Shared because a great deal now depends on it having arrived: connecting is
 * not finished until it has, and no recipe may be sent before it, since it is
 * the only report of the water level.
 */
export function machineInfoFrame(
    overrides: {mode?: string; waterEnough?: number} = {}
): number[] {
    const payload = new Array(63).fill(0);
    const put = (at: number, textValue: string) => {
        for (let i = 0; i < textValue.length; i++) payload[at + i] = textValue.charCodeAt(i);
    };
    put(0, "J15ABC123456");
    put(13, "J15");
    put(19, "V12.0D.500");
    payload[33] = overrides.waterEnough ?? 1;
    payload[37] = 30 + 62;
    put(51, overrides.mode ?? "00000000");
    return notification(0x49, 0x9E, payload);
}

/**
 * A radio that does exactly what a test tells it to.
 *
 * Records what was written, decoded, so an assertion can read
 * `transport.sent` as a list of command codes rather than as hex. Replays
 * frames on demand, so a test can script the machine's side of a brew.
 */
export class FakeTransport implements MachineTransport {
    /** Every frame written, as raw bytes. */
    public written: Uint8Array[] = [];
    public connectedTo: string | null = null;
    public devices: FoundMachine[] = [{id: "AA:BB", name: "XBLOOM TEST"}];
    /** Set to make `connect` reject, for the taken-link case. */
    public refuseConnection = false;
    /**
     * How many of the next connections to refuse.
     *
     * A radio that lets go a moment after it is asked to, which is what iOS
     * does when the app returns to the front.
     */
    public refuseNextConnections = 0;
    /** Identifiers this radio refuses, for the stale-remembered-id case. */
    public refuseIds: string[] = [];
    /** Set to make the next `write` reject, for the failed-send case. */
    public failNextWrite: string | null = null;
    /**
     * What the machine answers the info request with.
     *
     * A real one always answers — that is confirmed on hardware — so the fake
     * does too by default. Set to null to play a machine that stays silent,
     * which is the case the brew preflight has to refuse.
     */
    public infoReply: number[] | null = machineInfoFrame();

    private frameListeners = new Set<(frame: Uint8Array) => void>();
    private disconnectListeners = new Set<() => void>();

    /** The command code of each frame written, in order. */
    get sent(): number[] {
        return this.written.map((frame) => frame[3] | (frame[4] << 8));
    }

    async scan(): Promise<FoundMachine[]> {
        return this.devices;
    }

    async connect(id: string): Promise<void> {
        if (this.refuseNextConnections > 0) {
            this.refuseNextConnections--;
            throw new Error("connection failed");
        }
        if (this.refuseConnection || this.refuseIds.includes(id)) {
            throw new Error("connection failed");
        }
        this.connectedTo = id;
    }

    async disconnect(): Promise<void> {
        this.connectedTo = null;
    }

    async write(frame: Uint8Array): Promise<void> {
        if (this.connectedTo === null) throw new Error("not connected");
        if (this.failNextWrite !== null) {
            const reason = this.failNextWrite;
            this.failNextWrite = null;
            throw new Error(reason);
        }
        this.written.push(frame);
        const code = frame[3] | (frame[4] << 8);
        if (code === 40521 && this.infoReply !== null) this.emit(this.infoReply);
    }

    onFrame(listener: (frame: Uint8Array) => void): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    onDisconnect(listener: () => void): () => void {
        this.disconnectListeners.add(listener);
        return () => this.disconnectListeners.delete(listener);
    }

    isConnected(): boolean {
        return this.connectedTo !== null;
    }

    /** Play a frame from the machine. */
    emit(frame: number[]): void {
        this.frameListeners.forEach((listener) => listener(Uint8Array.from(frame)));
    }

    /** Drop the link, as the radio would. */
    drop(): void {
        this.connectedTo = null;
        this.disconnectListeners.forEach((listener) => listener());
    }
}
