/**
 * The one thing about the transport that is worth testing.
 *
 * `Transport.ts` is otherwise deliberately untested — it wraps a native radio
 * that cannot run in Jest, the same reason `library/NFC.ts` has no tests. But
 * "does a frame reach the machine in one piece" is a contract, not a radio, and
 * getting it wrong shipped a milestone that connected, read the machine's info
 * correctly, and then could not brew.
 */
import {Platform} from "react-native";
import BleManager from "react-native-ble-manager";

import {MACHINE_SERVICE, MACHINE_WRITE_CHARACTERISTIC} from "@/constants/machine";
import {buildType1, buildType1Bytes} from "@/library/machine/protocol";
import {BleTransport} from "@/library/machine/Transport";

jest.mock("react-native-ble-manager", () => ({
    __esModule: true,
    default: {
        start: jest.fn().mockResolvedValue(undefined),
        connect: jest.fn().mockResolvedValue(undefined),
        retrieveServices: jest.fn().mockResolvedValue({}),
        startNotification: jest.fn().mockResolvedValue(undefined),
        requestMTU: jest.fn().mockResolvedValue(247),
        writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        onDidUpdateValueForCharacteristic: jest.fn(() => ({remove: jest.fn()})),
        onDisconnectPeripheral: jest.fn(() => ({remove: jest.fn()})),
        onDiscoverPeripheral: jest.fn(() => ({remove: jest.fn()}))
    }
}));

const write = BleManager.writeWithoutResponse as jest.Mock;

async function connected(): Promise<BleTransport> {
    const transport = new BleTransport();
    await transport.connect("AA:BB:CC");
    write.mockClear();
    return transport;
}

describe("writing a frame", () => {
    beforeEach(() => jest.clearAllMocks());
    // The platform is a fixture in this file, so it is reset rather than left
    // wherever the previous test put it.
    afterEach(() => { Platform.OS = "ios"; });

    it("never lets a frame be split across writes", async () => {
        // `writeWithoutResponse`'s `maxByteSize` defaults to **20**, and a frame
        // longer than that is chopped into separate ATT writes. The machine
        // reads each one as a whole frame, fails the header and CRC on every
        // fragment, and answers nothing at all.
        //
        // This is not hypothetical. It is what shipped: the handshake is
        // exactly 20 bytes and the info request is 12, so connecting and
        // reading the machine's serial worked perfectly — while every frame in
        // the brew path (the dose is 24, a two-pour recipe is 31) was
        // fragmented, and the machine simply never replied.
        const transport = await connected();
        const frame = buildType1Bytes(8001, new Uint8Array(19).fill(0x2A));
        expect(frame.length).toBeGreaterThan(20);

        await transport.write(frame);

        expect(write).toHaveBeenCalledTimes(1);
        const [, service, characteristic, data, maxByteSize] = write.mock.calls[0];
        expect(service).toBe(MACHINE_SERVICE);
        expect(characteristic).toBe(MACHINE_WRITE_CHARACTERISTIC);
        expect(data).toEqual(Array.from(frame));
        // The whole frame, in one ATT write, whatever its length.
        expect(maxByteSize).toBeGreaterThanOrEqual(frame.length);
    });

    it("sends a short frame whole too, without a special case", async () => {
        const transport = await connected();
        const frame = buildType1(8500);

        await transport.write(frame);

        const [, , , data, maxByteSize] = write.mock.calls[0];
        expect(data).toEqual(Array.from(frame));
        expect(maxByteSize).toBeGreaterThanOrEqual(frame.length);
    });

    it("asks for an MTU big enough to carry a frame", async () => {
        // Android negotiates 23 bytes by default, which leaves 20 for the
        // payload however politely we ask the library not to chunk. iOS
        // negotiates for itself and ignores this.
        Platform.OS = "android";
        await connected();

        expect(BleManager.requestMTU).toHaveBeenCalledWith("AA:BB:CC", expect.any(Number));
        const [, mtu] = (BleManager.requestMTU as jest.Mock).mock.calls[0];
        expect(mtu).toBeGreaterThanOrEqual(64);
    });

    it("does not hold iOS to a budget it was never given", async () => {
        // Caught on a real iPhone. `requestMTU` is an Android call and rejects
        // on iOS, where CoreBluetooth negotiates for itself and tells us
        // nothing -- so reading that rejection as "20 bytes a frame" invents a
        // limit the link does not have. With a budget enforced on top of it,
        // every recipe frame would be refused and no iOS device could brew.
        Platform.OS = "ios";
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        // Not asked at all, rather than asked and its rejection misread.
        expect(BleManager.requestMTU).not.toHaveBeenCalled();
        expect(transport.frameBudget).toBeUndefined();
        expect(transport.channels.join(" ")).toMatch(/iOS/i);
    });

    it("records what the MTU negotiation actually produced", async () => {
        Platform.OS = "android";
        // It was swallowed entirely: a stack that refused looked exactly like a
        // stack that granted 247, and the one symptom -- long frames silently
        // not arriving -- is the hardest kind of failure to reason about after
        // the fact. The link log is where this has to show up.
        (BleManager.requestMTU as jest.Mock).mockResolvedValueOnce(185);
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        expect(transport.channels.join(" ")).toContain("185");
        expect(transport.frameBudget).toBe(182);
    });

    it("says so in the link log when Android refuses the MTU request", async () => {
        // Android is where the number means something: the stack really does
        // fall back to 23, and a recipe blob does not fit in what is left.
        Platform.OS = "android";
        (BleManager.requestMTU as jest.Mock).mockRejectedValueOnce(new Error("nope"));
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        expect(transport.channels.join(" ")).toMatch(/MTU refused/i);
        // The default every LE stack must carry, minus the ATT header.
        expect(transport.frameBudget).toBe(20);
    });

    it("connects even when the machine refuses a bigger MTU", async () => {
        // Not every stack supports the request, and a refusal is not a reason
        // to fail the connection — most frames fit in 20 bytes regardless.
        (BleManager.requestMTU as jest.Mock).mockRejectedValueOnce(new Error("nope"));
        const transport = new BleTransport();

        await expect(transport.connect("AA:BB:CC")).resolves.toBeUndefined();
        expect(transport.isConnected()).toBe(true);
    });
});

describe("connecting", () => {
    beforeEach(() => jest.clearAllMocks());

    it("clears a link the system is still holding and tries once more", async () => {
        // After a reload or a crash the radio can still be connected while this
        // object believes it is not. The machine permits one link, so that
        // ghost locks the user out entirely — the only way through, before
        // this, was to power-cycle the machine.
        (BleManager.connect as jest.Mock)
            .mockRejectedValueOnce(new Error("already connected"))
            .mockResolvedValueOnce(undefined);
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        expect(BleManager.disconnect).toHaveBeenCalledWith("AA:BB:CC");
        expect(BleManager.connect).toHaveBeenCalledTimes(2);
        expect(transport.isConnected()).toBe(true);
    });

    it("reports the original failure when the second attempt fails too", async () => {
        // The first error is the one worth showing: "already in use by another
        // app" says something, and the error from retrying after a disconnect
        // that did nothing says nothing at all.
        (BleManager.connect as jest.Mock)
            .mockRejectedValueOnce(new Error("in use by another app"))
            .mockRejectedValueOnce(new Error("unknown peripheral"));
        const transport = new BleTransport();

        await expect(transport.connect("AA:BB:CC")).rejects.toThrow(/in use by another app/);
        expect(transport.isConnected()).toBe(false);
    });
});

describe("which channels the app listens to", () => {
    // Reported from hardware: the machine offers three characteristics on its
    // service, and `ffe3` carries Notify as well as `ffe2`. Subscribing to one
    // of them means anything sent on the other never reaches the app — and
    // looks exactly like a machine that sends nothing. The tank level and the
    // info blob both showed zero arrivals while this was true.
    const notify = BleManager.startNotification as jest.Mock;
    const retrieve = BleManager.retrieveServices as jest.Mock;

    beforeEach(() => {
        notify.mockClear();
        notify.mockResolvedValue(undefined);
    });

    it("subscribes to every notifying characteristic the machine offers", async () => {
        retrieve.mockResolvedValueOnce({characteristics: [
            {service: MACHINE_SERVICE, characteristic: "ffe1",
             properties: ["Write", "WriteWithoutResponse"]},
            {service: MACHINE_SERVICE, characteristic: "ffe2", properties: ["Notify"]},
            {service: MACHINE_SERVICE, characteristic: "ffe3",
             properties: ["WriteWithoutResponse", "Notify", "Write", "Read"]}
        ]});

        await new BleTransport().connect("AA:BB:CC");

        // A short name or the full 128-bit form, depending on what the radio
        // reported it as. Either is the same channel.
        const subscribed = notify.mock.calls.map((call) => call[2].toLowerCase());
        expect(subscribed.some((uuid) => uuid.includes("ffe2"))).toBe(true);
        expect(subscribed.some((uuid) => uuid.includes("ffe3"))).toBe(true);
        expect(subscribed.some((uuid) => uuid.includes("ffe1"))).toBe(false);
    });

    it("still subscribes to the known channel when the radio lists nothing", async () => {
        // A stack that returns no characteristic list must not leave the app
        // deaf altogether. The one channel we have always used is the floor.
        retrieve.mockResolvedValueOnce({});

        await new BleTransport().connect("AA:BB:CC");

        const subscribed = notify.mock.calls.map((call) => call[2].toLowerCase());
        expect(subscribed.some((uuid) => uuid.includes("ffe2"))).toBe(true);
    });

    it("keeps the link when one of the extra channels refuses", async () => {
        // `ffe3` is a discovery, not a requirement. A stack that will not
        // subscribe to it must not cost us the connection.
        retrieve.mockResolvedValueOnce({characteristics: [
            {service: MACHINE_SERVICE, characteristic: "ffe2", properties: ["Notify"]},
            {service: MACHINE_SERVICE, characteristic: "ffe3", properties: ["Notify"]}
        ]});
        notify.mockImplementation((_id: string, _service: string, char: string) =>
            char.toLowerCase() === "ffe3"
                ? Promise.reject(new Error("refused"))
                : Promise.resolve(undefined));

        await expect(new BleTransport().connect("AA:BB:CC")).resolves.toBeUndefined();
    });
});

describe("saying which channels were opened", () => {
    // `ffe3` was subscribed to and nothing arrived on it. That has two very
    // different explanations — the machine sends nothing there, or the
    // subscription was refused — and swallowing the refusal made them look
    // identical from the app. Whichever it is has to be readable.
    const notify = BleManager.startNotification as jest.Mock;
    const retrieve = BleManager.retrieveServices as jest.Mock;

    beforeEach(() => {
        notify.mockClear();
        notify.mockResolvedValue(undefined);
    });

    it("reports each channel it opened", async () => {
        retrieve.mockResolvedValueOnce({characteristics: [
            {service: MACHINE_SERVICE, characteristic: "ffe2", properties: ["Notify"]},
            {service: MACHINE_SERVICE, characteristic: "ffe3", properties: ["Notify"]}
        ]});
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        expect(transport.channels.join(" ")).toContain("ffe3 listening");
    });

    it("reports a channel that refused, rather than swallowing it", async () => {
        retrieve.mockResolvedValueOnce({characteristics: [
            {service: MACHINE_SERVICE, characteristic: "ffe3", properties: ["Notify"]}
        ]});
        notify.mockImplementation((_id: string, _service: string, char: string) =>
            char.toLowerCase().includes("ffe3")
                ? Promise.reject(new Error("refused"))
                : Promise.resolve(undefined));
        const transport = new BleTransport();

        await transport.connect("AA:BB:CC");

        expect(transport.channels.join(" ")).toContain("ffe3 refused");
    });
});
