import {gzipSync, strToU8} from "fflate";

import {downsample, type HandoffEnvelope, type HandoffFlow} from "@/library/brew/handoff/envelope";

/**
 * Entire assembled URL budget: scheme and every parameter included.
 *
 * 32,768 is roughly eight times a typical brew and about a third of the
 * 97,120 characters measured to arrive byte-exact on iOS 18.3, so it is
 * conservative at both ends. Android is not yet measured.
 */
export const MAX_URL_CHARS = 32_768;

// Mirrors Beanconqueror's existing shareUserBeanN chunk convention.
const CHUNK_CHARS = 400;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SINGLE_URL_PREFIX = "beanconqueror://ADD_BREW";
const BATCH_URL_PREFIX = "beanconqueror://ADD_BREWS";

export const MAX_BATCH_URL_CHARS = MAX_URL_CHARS;

type HandoffFlowFidelity = NonNullable<HandoffEnvelope["flow"]>["fidelity"];

export type HandoffEncodingFidelity = HandoffFlowFidelity | "none";

export type HandoffBatch = {v: 1; brews: HandoffEnvelope[]};

/**
 * A handoff URL plus the fidelity state needed for UI copy.
 *
 * "full" means the complete flow trace fit, "downsampled" means the trace
 * was thinned until it fit, and "none" means no trace is present.
 */
export type EncodedHandoff = {
    url: string;
    fidelity: HandoffEncodingFidelity;
    /** Whole URL length, not just the gzip/base64url payload reported by len. */
    urlChars: number;
};

export function encodeHandoff(envelope: HandoffEnvelope): EncodedHandoff {
    if (envelope.flow === undefined) return encodeWithoutFlow(envelope);

    const encoded = encodeAt(envelope, "full");
    if (encoded.urlChars <= MAX_URL_CHARS) return encoded;

    return degradeToFit(envelope, envelope.flow) ?? encodeWithoutFlow(envelope);
}

export function encodeHandoffBatch(envelopes: HandoffEnvelope[]): EncodedHandoff {
    const batch = batchPayload(envelopes);
    const encoded = encodeAt(batch, batchFidelity(envelopes), BATCH_URL_PREFIX);
    if (encoded.urlChars > MAX_BATCH_URL_CHARS) {
        // Batch exports refuse rather than reusing the single-brew fidelity ladder:
        // if someone selected ten brews, silently thinning or dropping all ten traces
        // would leave them no way to tell what fidelity Beanconqueror received.
        throw new Error(`Beanconqueror batch handoff URL exceeds ${MAX_BATCH_URL_CHARS} characters`);
    }
    return encoded;
}

export function batchFits(envelopes: HandoffEnvelope[]): boolean {
    if (envelopes.length === 0) return false;
    return encodeAt(batchPayload(envelopes), batchFidelity(envelopes), BATCH_URL_PREFIX).urlChars
        <= MAX_BATCH_URL_CHARS;
}

/**
 * The ladder: full -> 2x -> 4x -> 8x ... -> the 1 Hz floor -> no flow at all.
 * The retained sample count strictly shrinks until downsample refuses.
 */
function degradeToFit(envelope: HandoffEnvelope, flow: HandoffFlow): EncodedHandoff | null {
    for (let factor = 2; ; factor *= 2) {
        const thinned = downsample(flow, factor);
        if (thinned === null) return null; // Hit the floor; caller drops flow.

        const encoded = encodeAt({...envelope, flow: thinned}, "downsampled");
        if (encoded.urlChars <= MAX_URL_CHARS) return encoded;
    }
}

function encodeWithoutFlow(envelope: HandoffEnvelope): EncodedHandoff {
    const {flow: _flow, ...withoutFlow} = envelope;
    return encodeWithinBudget(withoutFlow, "none");
}

/**
 * Encodes an envelope that has no more lossy fallback available.
 *
 * This can still throw for pathological non-flow data, such as an unusually
 * large note or imported params. Callers that expose this from UI must catch it
 * and report that the brew cannot fit inside Beanconqueror's URL handoff.
 */
function encodeWithinBudget(envelope: HandoffEnvelope, fidelity: HandoffEncodingFidelity): EncodedHandoff {
    const encoded = encodeAt(envelope, fidelity);
    if (encoded.urlChars > MAX_URL_CHARS) {
        throw new Error(`Beanconqueror handoff URL exceeds ${MAX_URL_CHARS} characters without a flow trace`);
    }
    return encoded;
}

function encodeAt(
    handoffPayload: HandoffEnvelope | HandoffBatch,
    fidelity: HandoffEncodingFidelity,
    urlPrefix = SINGLE_URL_PREFIX
): EncodedHandoff {
    const encodedPayload = payload(handoffPayload);
    const handoffUrl = url(encodedPayload, urlPrefix);

    return {
        url: handoffUrl,
        fidelity,
        urlChars: handoffUrl.length
    };
}

function batchPayload(envelopes: HandoffEnvelope[]): HandoffBatch {
    if (envelopes.length === 0) {
        throw new Error("Beanconqueror batch handoff requires at least one brew");
    }
    return {v: 1, brews: envelopes};
}

/**
 * A batch never thins a trace, so it can never report "downsampled": it either
 * carries every trace whole or it was refused. A brew that simply has no
 * stream is not a thinned one, so a mixed selection is still "full" — the
 * traces that exist are all complete.
 */
function batchFidelity(envelopes: HandoffEnvelope[]): HandoffEncodingFidelity {
    return envelopes.some((envelope) => envelope.flow !== undefined) ? "full" : "none";
}

function payload(handoffPayload: HandoffEnvelope | HandoffBatch): string {
    return base64Url(gzipSync(strToU8(JSON.stringify(handoffPayload))));
}

function url(payload: string, urlPrefix: string): string {
    // gzip's CRC catches corrupt chunk contents only after inflating; len catches truncation first.
    return `${urlPrefix}?len=${payload.length}${chunks(payload)
        .map((chunk, index) => `&shareBrew${index}=${chunk}`)
        .join("")}`;
}

function chunks(payload: string): string[] {
    const out: string[] = [];
    for (let offset = 0; offset < payload.length; offset += CHUNK_CHARS) {
        out.push(payload.slice(offset, offset + CHUNK_CHARS));
    }
    return out;
}

/**
 * RFC 4648 §5 base64url, unpadded.
 *
 * Hand-written because Hermes ships neither `btoa` nor `TextEncoder`.
 * Node has both, so a `btoa` "simplification" passes every test here and
 * fails on the first real phone. The URL alphabet (`-_`, no `=`) is what
 * keeps the payload out of percent-encoding, which would inflate it by
 * roughly a third against a fixed URL budget.
 */
function base64Url(bytes: Uint8Array): string {
    let out = "";
    let index = 0;

    for (; index + 2 < bytes.length; index += 3) {
        const bits = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
        out += BASE64URL_ALPHABET[(bits >> 18) & 0x3f]
            + BASE64URL_ALPHABET[(bits >> 12) & 0x3f]
            + BASE64URL_ALPHABET[(bits >> 6) & 0x3f]
            + BASE64URL_ALPHABET[bits & 0x3f];
    }

    if (index < bytes.length) {
        const first = bytes[index];
        out += BASE64URL_ALPHABET[first >> 2];

        if (index + 1 < bytes.length) {
            const second = bytes[index + 1];
            out += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >> 4)]
                + BASE64URL_ALPHABET[(second & 0x0f) << 2];
        } else {
            out += BASE64URL_ALPHABET[(first & 0x03) << 4];
        }
    }

    return out;
}
