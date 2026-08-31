import Machine from "@/library/machine/Machine";

import {FakeTransport} from "./FakeTransport";
import {notification, status} from "./protocolFixtures";

function machineInfoFrame(overrides: {mode?: string; waterEnough?: number} = {}): number[] {
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

describe("connecting to a machine", () => {
    it("handshakes immediately, because the machine stops listening after 200 ms", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);

        await machine.connect("AA:BB");

        // The handshake must be the very first thing written. Anything ahead of
        // it in the queue spends the window we are inside.
        expect(transport.sent[0]).toBe(8100);
    });

    it("asks the machine what it is", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);
        await machine.connect("AA:BB");

        transport.emit(machineInfoFrame());

        expect(machine.info).toMatchObject({
            serial: "J15ABC123456",
            firmware: "V12.0D.500",
            mode: "PRO",
            waterEnough: true,
            grindSize: 62
        });
    });

    it("tracks the machine's state as it reports it", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);
        await machine.connect("AA:BB");

        transport.emit(status(0x01));
        expect(machine.state).toBe(0x01);

        transport.emit(status(0x1F));
        expect(machine.state).toBe(0x1F);
    });

    it("says the link is taken rather than blaming the machine", async () => {
        // The machine permits one link at a time and gives no protocol-level
        // rejection when it is taken — it simply ignores you. The most likely
        // cause by far is the official app, and the copy should say so rather
        // than implying the hardware is broken.
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport);

        await expect(machine.connect("AA:BB")).rejects.toThrow(/another app|in use/i);
    });

    it("forgets everything it knew when the link drops", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());
        expect(machine.info).not.toBeNull();

        transport.drop();

        expect(machine.isConnected()).toBe(false);
        expect(machine.info).toBeNull();
    });
});
