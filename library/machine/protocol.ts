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

/** The states the machine reports in a `0x57` frame. */
export const MACHINE_STATE = {
    IDLE:             0x01,
    NO_WATER:         0x0C,
    NO_BEANS:         0x0F,
    BREWING:          0x10,
    LOADING:          0x1D,
    AWAITING_CONFIRM: 0x1E,
    ARMED:            0x1F,
    STARTING:         0x22,
    BREWING_SUB:      0x23,
    READY:            0x24,
    BREWING_ALT:      0x3B,
    COMPLETE:         0x41,
    SAVING_SLOTS:     0x43,
    SLOTS_SAVED:      0x25
} as const;

/** Notification codes the brew state machine reacts to. */
export const EVENT = {
    COFFEE_STARTING:  40502,
    BREWER_START:     40506,
    GRINDER_STOP:     40507,
    POUR_START:       40510,
    BREWER_STOP:      40511,
    ENJOY:            40512,
    ENJOY_2:          40513,
    ERROR_IDLING:     40517,
    ERROR_NO_WATER:   40522,
    ERROR_GEAR:       8203,
    ERROR_DOSE_WATER: 8204,
    MACHINE_INFO:     40521,
    HANDSHAKE_ACK:    8100
} as const;

export type MachineInfo = {
    kind: "info";
    serial: string;
    model: string;
    firmware: string;
    waterEnough: boolean;
    waterFeed: "tank" | "tap";
    grindSize: number;
    mode: "PRO" | "EASY";
};

export type Notification =
    | {kind: "status"; state: number}
    | {kind: "event"; code: number; value?: number}
    | {kind: "waterWeight"; grams: number}
    | {kind: "cupWeight"; grams: number}
    | MachineInfo
    | {kind: "unknown"; raw: Uint8Array};

const NOTIFY_HEADER = [0x58, 0x02, 0x07];
const PAYLOAD_START = 10;

function text(bytes: Uint8Array, from: number, to: number): string {
    let out = "";
    for (let i = from; i <= to && i < bytes.length; i++) {
        const byte = bytes[i];
        // 0xFF is the machine's blank filler; a 0 terminates the string.
        if (byte === 0 || byte === 0xFF) break;
        out += String.fromCharCode(byte);
    }
    return out;
}

function readInfo(payload: Uint8Array): MachineInfo {
    const modeHex = text(payload, 51, 58);
    return {
        kind: "info",
        serial:      text(payload, 0, 12),
        model:       text(payload, 13, 18),
        firmware:    text(payload, 19, 28),
        waterEnough: payload[33] === 1,
        waterFeed:   payload[36] === 1 ? "tap" : "tank",
        // The raw byte is offset by 30, and the machine never reports below 1.
        grindSize:   Math.max((payload[37] ?? 30) - 30, 1),
        mode:        modeHex === "91327856" ? "EASY" : "PRO"
    };
}

/**
 * Read one device→app frame.
 *
 * Anything unrecognised comes back as `unknown` with its bytes intact rather
 * than throwing. The console renders those verbatim, and a frame we cannot
 * read on somebody else's firmware is the single most useful thing they can
 * send us — so it must survive the parser, not die in it.
 */
export function parseNotification(bytes: Uint8Array): Notification {
    const unknown = {kind: "unknown", raw: bytes} as const;

    if (bytes.length < 12) return unknown;
    if (NOTIFY_HEADER.some((b, i) => bytes[i] !== b)) return unknown;

    const crc = crc16Kermit(bytes.subarray(0, bytes.length - 2));
    const carried = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    if (crc !== carried) return unknown;

    const type = bytes[3];
    const sub = bytes[4];
    const payload = bytes.subarray(PAYLOAD_START, bytes.length - 2);

    if (type === 0x57) {
        return {kind: "status", state: payload[0] ?? 0};
    }

    if (type === 0x4B || type === 0x15) {
        if (payload.length < 4) return unknown;
        const view = new DataView(payload.buffer, payload.byteOffset, 4);
        const value = view.getFloat32(0, true);
        // The water stream is milligrams; the cup stream is already grams.
        return type === 0x4B
            ? {kind: "waterWeight", grams: value / 1000}
            : {kind: "cupWeight", grams: value};
    }

    const code = type | (sub << 8);

    // 59, not 42: `readInfo` reads the mode string through index 58, and a
    // payload that stops short of it decodes as an empty mode — which is then
    // reported as PRO. A truncated frame claiming the machine is in PRO is
    // worse than no frame, because the PRO-mode fallback trusts it.
    if (code === EVENT.MACHINE_INFO && payload.length >= INFO_PAYLOAD_BYTES) {
        return readInfo(payload);
    }

    return payload.length > 0
        ? {kind: "event", code, value: payload[0]}
        : {kind: "event", code};
}

/** The mode string ends at index 58, so a shorter payload is not an info frame. */
const INFO_PAYLOAD_BYTES = 59;

/** What the encoder needs of a recipe, without depending on `Recipe` itself. */
export type BlobPour = {
    volume: number;
    temperature: number;
    pourPattern: number;
    agitation: number;
    pauseTime: number;
    flowRate: number;
};

export type BlobRecipe = {
    dosage: number;
    grindSize: number;
    grindRPM: number;
    grinder: boolean;
    pours: BlobPour[];
};

/** The wire value that turns the grinder off. Not `0x00`: that is *finest*. */
export const GRINDER_OFF_WIRE = 0xFE;
/** The largest volume one segment can carry before it has to be chunked. */
const MAX_SEGMENT_VOLUME = 127;

/**
 * The tail byte: the ratio, times ten, **rounded up**.
 *
 * saya6k found on hardware that 18 g / 250 ml truncated to 138 and the machine
 * never ground at all — no error, no complaint, just cold water over dry beans.
 * 139 grinds. A small overshoot is tolerated; any undershoot is fatal and
 * silent, which is why this is a ceiling and not a round.
 */
export function ratioByte(totalWaterMl: number, doseG: number): number {
    if (!(doseG > 0)) return 0;
    return Math.min(Math.ceil((totalWaterMl / doseG) * 10), 255);
}

function segmentsFor(recipe: BlobRecipe): number[] {
    const out: number[] = [];
    recipe.pours.forEach((pour, index) => {
        let left = Math.round(pour.volume);
        // Lead chunks for anything the trailing segment's single volume byte
        // cannot hold. `cardLimits` allows 240 ml, so this runs in practice.
        while (left > MAX_SEGMENT_VOLUME) {
            out.push(MAX_SEGMENT_VOLUME, pour.temperature, pour.pourPattern, pour.agitation);
            left -= MAX_SEGMENT_VOLUME;
        }
        const pause = Math.round(pour.pauseTime);
        out.push(
            left,
            Math.round(pour.temperature),
            pour.pourPattern,
            pour.agitation,
            // The post-pour wait, stored as its two's complement — the same
            // convention the card format uses.
            pause === 0 ? 0 : (256 - pause) & 0xFF,
            0x00,
            // Only the first pour carries the grind speed. Repeating it in
            // later segments is not merely redundant; no source has ever seen
            // the machine sent one.
            index === 0 ? Math.round(recipe.grindRPM) : 0,
            Math.round(pour.flowRate)
        );
    });
    return out;
}

/**
 * The coffee recipe blob, for commands 8001 (grind) and 8004 (no grind).
 *
 * Deliberately **not** built on `Recipe.getData()`. The two layouts rhyme but
 * differ, and `getData()` is the NFC card format: fixed, and unrecoverable if a
 * malformed frame reaches a genuine card. This is a protocol that varies
 * between firmware revisions. They must be free to move independently.
 */
export function encodeCoffeeBlob(recipe: BlobRecipe): Uint8Array {
    const segments = segmentsFor(recipe);
    const total = recipe.pours.reduce((sum, pour) => sum + pour.volume, 0);
    return Uint8Array.from([
        segments.length,
        ...segments,
        recipe.grinder ? Math.round(recipe.grindSize) : GRINDER_OFF_WIRE,
        ratioByte(total, recipe.dosage)
    ]);
}

/**
 * Which reading of the tea steep encoding to send.
 *
 * Not a preference so much as an open question with a switch on it. See
 * contradiction C11 in `docs/machine-integration/ble-protocol.md`.
 */
export type TeaSteepEncoding = "homoland" | "saya6k";

/**
 * Bytes 4 and 5 of a tea segment — the two the coffee format spends on a
 * two's-complement wait and a zero.
 */
export function teaSteepBytes(seconds: number, encoding: TeaSteepEncoding): [number, number] {
    if (encoding === "saya6k") {
        // A soak byte in position 5, scaled because the firmware is understood
        // to run it at about 1.67x. Clamped to at least 1: a zero soak is a
        // steep that does not happen.
        return [0, Math.max(1, Math.min(Math.round(seconds * 0.6), 255))];
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return [(-remainder) & 0xFF, (minutes * 32) & 0xFF];
}

/**
 * The tea recipe blob, for command 4513. Executed by 4512.
 *
 * Same chunked segment shape as coffee, different timing bytes, and the
 * grinder always off.
 */
export function encodeTeaBlob(recipe: BlobRecipe, encoding: TeaSteepEncoding): Uint8Array {
    const segments: number[] = [];
    recipe.pours.forEach((pour, index) => {
        let left = Math.round(pour.volume);
        while (left > MAX_SEGMENT_VOLUME) {
            segments.push(MAX_SEGMENT_VOLUME, pour.temperature, pour.pourPattern, pour.agitation);
            left -= MAX_SEGMENT_VOLUME;
        }
        const [wait, soak] = teaSteepBytes(Math.round(pour.pauseTime), encoding);
        segments.push(
            left,
            Math.round(pour.temperature),
            pour.pourPattern,
            pour.agitation,
            wait,
            soak,
            index === 0 ? Math.round(recipe.grindRPM) : 0,
            Math.round(pour.flowRate)
        );
    });

    const total = recipe.pours.reduce((sum, pour) => sum + pour.volume, 0);
    return Uint8Array.from([
        segments.length,
        ...segments,
        GRINDER_OFF_WIRE,
        ratioByte(total, recipe.dosage)
    ]);
}
