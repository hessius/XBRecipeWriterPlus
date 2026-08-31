/**
 * The xBloom Studio BLE wire format.
 *
 * A function of bytes: no React, no react-native, no imports from anywhere else
 * in the app. That is what makes this layer fully provable without hardware,
 * which matters because nothing below it is provable at all.
 *
 * Everything here is derived from firmware V12.0D.500 on units nobody
 * cross-checked. See `docs/machine-integration/ble-protocol.md`.
 */

const HEADER = 0x58;
const VERSION = 0x01;
const FUNC_TYPE_1 = 0x01;
const FUNC_TYPE_2 = 0x02;
/** Header (3) + command (2) + length field (4) + payload marker (1) + CRC (2). */
const FRAME_OVERHEAD = 12;
/** The constant byte at offset 9, present even on frames with no payload. */
const PAYLOAD_MARKER = 0x01;

/**
 * CRC-16/KERMIT: polynomial 0x1021, init 0, reflected in and out, no final XOR.
 *
 * brAzzi64's notes call this poly `0x8408`, which is the same algorithm stated
 * in its reflected form — that is contradiction C1, and it is a notation
 * difference rather than a disagreement.
 */
export function crc16Kermit(bytes: Uint8Array): number {
    let crc = 0;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 1) ? ((crc >>> 1) ^ 0x8408) : (crc >>> 1);
        }
    }
    return crc & 0xFFFF;
}

function frame(func: number, cmd: number, payload: Uint8Array): Uint8Array {
    const length = FRAME_OVERHEAD + payload.length;
    const out = new Uint8Array(length);
    out[0] = HEADER;
    out[1] = VERSION;
    out[2] = func;
    out[3] = cmd & 0xFF;
    out[4] = (cmd >> 8) & 0xFF;
    // Four bytes, of which the machine only ever populates two. Sources
    // describe this as either a 4-byte LE length or a 2-byte length followed by
    // two zeroes; the wire bytes are identical either way (contradiction C2).
    out[5] = length & 0xFF;
    out[6] = (length >> 8) & 0xFF;
    out[7] = 0;
    out[8] = 0;
    out[9] = PAYLOAD_MARKER;
    out.set(payload, 10);
    const crc = crc16Kermit(out.subarray(0, length - 2));
    out[length - 2] = crc & 0xFF;
    out[length - 1] = (crc >> 8) & 0xFF;
    return out;
}

function intsToBytes(ints: number[]): Uint8Array {
    const out = new Uint8Array(ints.length * 4);
    ints.forEach((value, index) => {
        const at = index * 4;
        out[at] = value & 0xFF;
        out[at + 1] = (value >>> 8) & 0xFF;
        out[at + 2] = (value >>> 16) & 0xFF;
        out[at + 3] = (value >>> 24) & 0xFF;
    });
    return out;
}

/** A command whose arguments are 32-bit little-endian integers. */
export function buildType1(cmd: number, ints: number[] = []): Uint8Array {
    return frame(FUNC_TYPE_1, cmd, intsToBytes(ints));
}

/** A type 1 command whose payload is a raw blob — the recipe sends. */
export function buildType1Bytes(cmd: number, payload: Uint8Array): Uint8Array {
    return frame(FUNC_TYPE_1, cmd, payload);
}

/** A type 2 command. Slot writes, mode switch, calibration. */
export function buildType2(cmd: number, payload: Uint8Array): Uint8Array {
    return frame(FUNC_TYPE_2, cmd, payload);
}

/** The ASCII of a string, for the type 2 payloads that are text. */
export function ascii(text: string): Uint8Array {
    return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xFF);
}
