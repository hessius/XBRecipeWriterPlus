/**
 * An independent reimplementation of the xBloom BLE frame layout.
 *
 * Written from `docs/machine-integration/ble-protocol.md` rather than from
 * `library/machine/protocol.ts`, deliberately: a fixture derived from the
 * implementation makes a round-trip test agree with itself and prove nothing.
 * If you change the frame format, change both sides consciously.
 */

/** CRC-16/KERMIT, written the slow, obvious way: bit by bit, no table. */
export function kermit(bytes: number[]): number {
    let crc = 0;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 1) ? ((crc >> 1) ^ 0x8408) : (crc >> 1);
        }
    }
    return crc & 0xFFFF;
}

function littleEndian32(value: number): number[] {
    return [value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF];
}

/**
 * `58 01 [func] [cmd_lo cmd_hi] [len_b0..b3] 01 [payload…] [crc_lo crc_hi]`
 *
 * The `01` at offset 9 is a constant payload marker, present on both packet
 * types and on frames that carry no arguments at all. The length counts the
 * whole frame, header, marker and CRC included — so the overhead is 12 bytes.
 */
function build(func: number, cmd: number, payload: number[]): number[] {
    const length = 12 + payload.length;
    const head = [
        0x58, 0x01, func,
        cmd & 0xFF, (cmd >> 8) & 0xFF,
        length & 0xFF, (length >> 8) & 0xFF, 0x00, 0x00,
        0x01,
        ...payload
    ];
    const crc = kermit(head);
    return [...head, crc & 0xFF, (crc >> 8) & 0xFF];
}

/** Type 1: arguments are 32-bit little-endian integers. */
export function type1(cmd: number, args: number[]): number[] {
    return build(0x01, cmd, args.flatMap(littleEndian32));
}

/** Type 1h: the same frame, but the payload is a raw blob. */
export function type1Bytes(cmd: number, payload: number[]): number[] {
    return build(0x01, cmd, payload);
}

/** Type 2: func code `0x02`, payload is raw bytes. */
export function type2(cmd: number, payload: number[]): number[] {
    return build(0x02, cmd, payload);
}

export function hex(bytes: ArrayLike<number>): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}
