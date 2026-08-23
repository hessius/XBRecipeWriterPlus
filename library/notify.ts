import type {DotIconName} from "@/constants/dotIcons";

/**
 * What a message asks of the reader.
 *
 * Only three, and deliberately not one per event: a tone is how loudly the app
 * speaks, and every message in the app is one of these three volumes.
 */
export const TONES = ["success", "error", "info"] as const;

export type NoticeTone = (typeof TONES)[number];

/** What a call site passes: meaning, never styling. */
export type Notice = {
    tone: NoticeTone;
    message: string;
};

/** What the renderer needs. */
export type ResolvedNotice = Notice & {
    glyph: DotIconName;
    /** Milliseconds on screen. */
    duration: number;
    /** The tone named in the machine's own voice, set in Doto above the prose. */
    label: string;
};

const GLYPHS: Record<NoticeTone, DotIconName> = {
    success: "success",
    error:   "error",
    info:    "info"
};

/**
 * What the machine calls each tone.
 *
 * Short and upper case because these are rendered in Doto at 11px, the face's
 * legibility floor -- a long or mixed-case word becomes texture at that size.
 * "DONE" rather than "SUCCESS" for exactly that reason.
 *
 * This is meaning rather than styling, so it is resolved here with the glyph
 * and the duration instead of being written into the component.
 */
const LABELS: Record<NoticeTone, string> = {
    success: "DONE",
    error:   "ERROR",
    info:    "NOTE"
};

/**
 * A success confirms something the reader just asked for, so it can be brief. An
 * error may need reading twice and sometimes carries a reason from the card or
 * the network, so it stays longer.
 */
const DURATIONS: Record<NoticeTone, number> = {
    success: 2500,
    info:    3000,
    error:   4500
};

/**
 * Everything the toast body needs to draw itself.
 *
 * Pure, and kept in `library/` away from React, so the routing can be tested as
 * a function rather than by rendering and squinting.
 */
export function resolveNotice(notice: Notice): ResolvedNotice {
    return {
        ...notice,
        glyph:    GLYPHS[notice.tone],
        duration: DURATIONS[notice.tone],
        label:    LABELS[notice.tone]
    };
}

/**
 * The toast library's own type strings.
 *
 * The library tags each queued toast with one of these, and it is the only
 * channel through which a dispatcher can tell the single shared renderer what
 * kind of message this is. `info` maps to the library's default, `blank`.
 */
export type LibToastType = "success" | "error" | "blank" | "loading";

export function toneToLibType(tone: NoticeTone): LibToastType {
    return tone === "info" ? "blank" : tone;
}

export function libTypeToTone(type: string): NoticeTone {
    return type === "success" || type === "error" ? type : "info";
}
