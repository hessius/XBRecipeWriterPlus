import type {FrameLogEntry} from "./Machine";
import {MACHINE_STATE, type Notification} from "./protocol";

/**
 * The code the water stream carries: 40523, or `0x9E4B`.
 *
 * It never reaches `readingOf` as an event, because `parseNotification`
 * matches the water stream on its type byte alone — `0x4B` — and so decodes
 * every 40523 as a `waterWeight`. Kept named because the console still counts
 * the stream, and because the code one below it, 40522 `0x9E4A`, is
 * `ERROR_NO_WATER`: the fault and the flow reading are the same subsystem
 * speaking, which is worth remembering when the machine claims to be dry.
 */
export const WATER_VOLUME_CODE = 40523;

const STATE_NAMES = new Map<number, string>([
    [MACHINE_STATE.IDLE, "idle"],
    [MACHINE_STATE.NO_WATER, "no_water"],
    [MACHINE_STATE.NO_BEANS, "no_beans"],
    [MACHINE_STATE.BREWING, "brewing"],
    [MACHINE_STATE.LOADING, "loading"],
    [MACHINE_STATE.AWAITING_CONFIRM, "awaiting_confirm"],
    [MACHINE_STATE.ARMED, "armed"],
    [MACHINE_STATE.STARTING, "starting"],
    [MACHINE_STATE.BREWING_SUB, "brewing (sub)"],
    [MACHINE_STATE.READY, "ready"],
    [MACHINE_STATE.BREWING_ALT, "brewing"],
    [MACHINE_STATE.COMPLETE, "complete (Easy idle)"],
    [MACHINE_STATE.SAVING_SLOTS, "saving_slots"],
    [MACHINE_STATE.SLOTS_SAVED, "slots_saved"]
]);

export function stateName(state: number): string {
    return STATE_NAMES.get(state) ?? "unknown";
}

export function toHex(frame: Uint8Array): string {
    return Array.from(frame, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/** The float32 of millilitres a tank-level frame carries, if it carries one. */
export function waterVolumeOf(frame: Uint8Array): number | undefined {
    const payload = frame.subarray(10, Math.max(10, frame.length - 2));
    if (payload.length < 4) return undefined;
    return new DataView(payload.buffer, payload.byteOffset, 4).getFloat32(0, true);
}

/** What a frame says, in words. */
export function readingOf(parsed: Notification): string {
    switch (parsed.kind) {
        case "status":
            return `state 0x${parsed.state.toString(16).padStart(2, "0")} ${stateName(parsed.state)}`;
        case "event":
            return `event ${parsed.code}`
                + (parsed.value === undefined ? "" : ` (${parsed.value})`);
        case "waterWeight": return `water ${parsed.grams.toFixed(1)} g`;
        case "cupWeight":   return `cup ${parsed.grams.toFixed(1)} g`;
        case "info":        return `${parsed.model} ${parsed.firmware} ${parsed.mode}`;
        default:            return "";
    }
}

/**
 * One retained-history entry as a log line, in the same shape and clock as the
 * live frame log: `HH:MM:SS.mmm  arrow  hex  reading`. The channel is named on
 * the arrow, and a sent frame carries no decoded reading.
 *
 * Lives here rather than on the console screen because the brew record keeps
 * the same lines: two formatters would eventually disagree, and a diagnostic
 * log that reads differently depending on where it was copied from is worse
 * than one that is merely terse.
 */
export function historyLine(entry: FrameLogEntry): string {
    const at = new Date(entry.at).toISOString().slice(11, 23);
    const arrow = entry.direction === "sent"
        ? "→"
        : entry.source === undefined ? "←" : `←${entry.source}`;
    const reading = entry.direction === "sent" ? "" : readingOf(entry.parsed);
    return `${at}  ${arrow}  ${toHex(entry.frame)}  ${reading}`;
}

/** A whole frame history as text, oldest first. */
export function frameLogText(entries: FrameLogEntry[]): string {
    return entries.map(historyLine).join("\n");
}
