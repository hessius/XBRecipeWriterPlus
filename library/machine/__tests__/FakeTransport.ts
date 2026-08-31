import type {FoundMachine, MachineTransport} from "@/library/machine/Transport";

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
        if (this.refuseConnection) throw new Error("connection failed");
        this.connectedTo = id;
    }

    async disconnect(): Promise<void> {
        this.connectedTo = null;
    }

    async write(frame: Uint8Array): Promise<void> {
        if (this.connectedTo === null) throw new Error("not connected");
        this.written.push(frame);
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
