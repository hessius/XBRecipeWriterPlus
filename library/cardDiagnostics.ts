/**
 * Capturing the raw bytes of a card read, so a crash cannot lose them.
 *
 * This exists because a genuine "bypass water" card scanned to what looked like
 * success and then took the app down with it, on a phone whose owner cannot see
 * a console. The import path (share link → `XBloomRecipe`) is provably clean
 * headlessly, so the fault is on the card-read path — the prime suspect being
 * `Recipe.parseData`, which assumes a fixed byte layout and reads `undefined`
 * off the end of a card that lays its bytes out differently.
 *
 * So we grab the bytes as they come off the card, *before* `parseData` runs,
 * persist them (a crash a millisecond later must not erase the evidence) and
 * show them as copyable text. Plain TypeScript, no React and no Settings
 * dependency: `library/` stays a leaf, and the caller injects persistence.
 */

/** The system-info block a NfcV/ISO-15693 tag reports about itself. */
export type CaptureSystemInfo = {
    afi: number;
    dsfid: number;
    blockCount: number;
    blockSize: number;
};

/**
 * One card read, whole.
 *
 * `data` is the bytes exactly as read, *including* the 32-byte hash prefix — the
 * whole point is to see what a real card actually carries, so nothing is spliced
 * out. `systemInfo` is null when the tag would not report it.
 */
export type CardCapture = {
    /** ISO timestamp of the read. */
    at: string;
    uid: number[];
    data: number[];
    systemInfo: CaptureSystemInfo | null;
};

/** How many bytes of hex sit on one line of the readable report. */
const BYTES_PER_LINE = 32;
/** How many bytes group together between spaces. */
const BYTES_PER_GROUP = 4;

export function serialiseCapture(capture: CardCapture): string {
    return JSON.stringify(capture);
}

function isNumber(value: unknown): value is number {
    return typeof value === "number";
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(isNumber);
}

function isSystemInfo(value: unknown): value is CaptureSystemInfo {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const info = value as Record<string, unknown>;
    return isNumber(info.afi) && isNumber(info.dsfid)
        && isNumber(info.blockCount) && isNumber(info.blockSize);
}

/**
 * Read a persisted capture back, or null for anything that is not one.
 *
 * It never throws: it reads a string a *future* version may have written to a
 * different shape, and a diagnostic that crashes the settings screen it is
 * meant to be read from would defeat itself. Every field is type-checked rather
 * than trusted — the same rule `Settings.get` follows for a hand-edited row.
 */
export function parseCapture(raw: string): CardCapture | null {
    if (raw === "") {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
    }

    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.at !== "string") {
        return null;
    }
    if (!isNumberArray(candidate.uid) || !isNumberArray(candidate.data)) {
        return null;
    }
    if (candidate.systemInfo !== null && !isSystemInfo(candidate.systemInfo)) {
        return null;
    }

    return {
        at: candidate.at,
        uid: candidate.uid,
        data: candidate.data,
        systemInfo: candidate.systemInfo as CaptureSystemInfo | null
    };
}

/** One byte as two uppercase hex digits. */
function hexByte(byte: number): string {
    return (byte & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

/** The data bytes as offset-prefixed lines of grouped uppercase hex. */
function hexDump(data: number[]): string[] {
    const lines: string[] = [];
    for (let offset = 0; offset < data.length; offset += BYTES_PER_LINE) {
        const lineBytes = data.slice(offset, offset + BYTES_PER_LINE);
        const groups: string[] = [];
        for (let i = 0; i < lineBytes.length; i += BYTES_PER_GROUP) {
            groups.push(lineBytes.slice(i, i + BYTES_PER_GROUP).map(hexByte).join(""));
        }
        lines.push(`${offset}: ${groups.join(" ")}`);
    }
    return lines;
}

/**
 * The human-readable, copyable report.
 *
 * Byte offsets are decimal so a message can say "look at byte 40" and the reader
 * can find the line it falls on. The system info's total (blockCount × blockSize)
 * is spelled out because it is the number the write path needs and cannot get
 * from the pour-count byte alone.
 */
export function captureToText(capture: CardCapture): string {
    const uid = capture.uid.map(hexByte).join(" ");
    const lines = [
        `Card read at ${capture.at}`,
        `UID: ${uid.length > 0 ? uid : "(none)"}`
    ];

    if (capture.systemInfo === null) {
        lines.push("System info: not available");
    } else {
        const {blockCount, blockSize, afi, dsfid} = capture.systemInfo;
        lines.push(
            `System info: ${blockCount} blocks × ${blockSize} bytes = ` +
            `${blockCount * blockSize} bytes total (afi ${afi}, dsfid ${dsfid})`
        );
    }

    lines.push(`Bytes read: ${capture.data.length}`);
    lines.push(...hexDump(capture.data));

    return lines.join("\n");
}
