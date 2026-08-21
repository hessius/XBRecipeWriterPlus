import {AGITATION, POUR_PATTERN} from '../Pour';
import {CUP_TYPE} from '../Recipe';

/**
 * Independent re-implementation of the xBloom card byte layout, derived from
 * `Data Format.png` / `Data Format.xlsx` rather than from `Recipe.getData`.
 *
 * These helpers exist so the tests validate the encoder against an external
 * description of the format. Building fixtures with `Recipe.getData` itself
 * would make the round-trip assertions tautological.
 */

export const HASH_LENGTH = 32;
export const XID_LENGTH = 7;

export type PourSpec = {
    volume: number;
    temperature: number;
    pattern: number;
    agitation: number;
    /** Total pause in seconds. Values above 255 are split across the minutes bits. */
    pauseSeconds: number;
    flowRate: number;
};

export type CardSpec = {
    hash?: number[];
    xid: string;
    cupType: number;
    /** Tea cards only: encoded into the high nibble of byte 39 as (cups - 1). */
    teaCups?: number;
    dosage: number;
    grindRPM: number;
    /** Real grind size (e.g. 50). Stored on the card as value - 40. */
    grindSize: number;
    ratio: number;
    pours: PourSpec[];
};

/**
 * CRC-8/MAXIM-DOW computed bitwise (poly 0x31, reflected as 0x8C, init 0x00).
 * Deliberately does not use Recipe's precomputed POLY_TABLE.
 */
export function crc8MaximDow(bytes: number[]): number {
    let crc = 0x00;
    for (const byte of bytes) {
        crc ^= byte & 0xff;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? (crc >> 1) ^ 0x8c : crc >> 1;
        }
    }
    return crc & 0xff;
}

export function makeHash(seed = 0xa5): number[] {
    return Array.from({length: HASH_LENGTH}, (_, i) => (seed + i) & 0xff);
}

function encodeXid(xid: string): number[] {
    const bytes = Array.from(xid).map(c => c.charCodeAt(0));
    while (bytes.length < XID_LENGTH) {
        bytes.push(0);
    }
    return bytes.slice(0, XID_LENGTH);
}

/** Builds a full card image: 32-byte hash + payload + trailing checksum. */
export function buildCard(spec: CardSpec): number[] {
    const data: number[] = [...(spec.hash ?? makeHash())];

    data.push(...encodeXid(spec.xid));

    const teaNibble = spec.cupType === CUP_TYPE.TEA ? ((spec.teaCups ?? spec.pours.length) - 1) << 4 : 0;
    data.push(teaNibble | spec.cupType);

    data.push(spec.pours.length << 3);

    spec.pours.forEach((pour, index) => {
        const capped = Math.min(pour.pauseSeconds, 360);
        const waitMinutes = capped > 255 ? Math.floor(capped / 60) : 0;
        const waitSeconds = capped > 255 ? capped % 60 : capped;

        data.push(pour.volume);
        data.push(pour.temperature);
        data.push(pour.pattern);
        data.push(pour.agitation);
        data.push(waitSeconds === 0 ? 0x00 : 256 - waitSeconds);
        // Byte 5 packs the wait-minutes (bits 5-7) and, on the first pour only, the dose (bits 0-4).
        data.push(index === 0 ? (waitMinutes << 5) | spec.dosage : waitMinutes << 5);
        data.push(index === 0 ? spec.grindRPM : 0x00);
        data.push(pour.flowRate);
    });

    data.push(spec.grindSize - 40);
    data.push(spec.ratio);
    data.push(crc8MaximDow(data));

    return data;
}

export const XPOD_CARD: CardSpec = {
    xid:       'ABC1234',
    cupType:   CUP_TYPE.XPOD,
    dosage:    15,
    grindRPM:  90,
    grindSize: 50,
    ratio:     16,
    pours:     [
        {volume: 30, temperature: 93, pattern: POUR_PATTERN.CIRCULAR, agitation: AGITATION.ALL_OFF, pauseSeconds: 30, flowRate: 32},
        {volume: 105, temperature: 92, pattern: POUR_PATTERN.SPIRAL, agitation: AGITATION.BEFORE_ON_AFTER_OFF, pauseSeconds: 0, flowRate: 33},
        {volume: 105, temperature: 91, pattern: POUR_PATTERN.CENTERED, agitation: AGITATION.BEFORE_ON_AFTER_ON, pauseSeconds: 10, flowRate: 30}
    ]
};

export const TEA_CARD: CardSpec = {
    xid:       'TEA001',
    cupType:   CUP_TYPE.TEA,
    teaCups:   3,
    dosage:    5,
    grindRPM:  120,
    grindSize: 50, // tea cards always store the default grind size
    ratio:     54, // 3 x 90ml / 5g
    pours:     [
        {volume: 90, temperature: 95, pattern: POUR_PATTERN.CENTERED, agitation: AGITATION.ALL_OFF, pauseSeconds: 300, flowRate: 30},
        {volume: 90, temperature: 95, pattern: POUR_PATTERN.CENTERED, agitation: AGITATION.ALL_OFF, pauseSeconds: 180, flowRate: 30},
        {volume: 90, temperature: 95, pattern: POUR_PATTERN.CENTERED, agitation: AGITATION.ALL_OFF, pauseSeconds: 0, flowRate: 30}
    ]
};
