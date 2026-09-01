/**
 * The one thing about the transport that is worth testing.
 *
 * `Transport.ts` is otherwise deliberately untested — it wraps a native radio
 * that cannot run in Jest, the same reason `library/NFC.ts` has no tests. But
 * "does a frame reach the machine in one piece" is a contract, not a radio, and
 * getting it wrong shipped a milestone that connected, read the machine's info
 * correctly, and then could not brew.
 */
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
        await connected();

        expect(BleManager.requestMTU).toHaveBeenCalledWith("AA:BB:CC", expect.any(Number));
        const [, mtu] = (BleManager.requestMTU as jest.Mock).mock.calls[0];
        expect(mtu).toBeGreaterThanOrEqual(64);
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
