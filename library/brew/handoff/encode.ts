import {gzipSync, strToU8} from "fflate";

import {downsample, type HandoffEnvelope, type HandoffFlow} from "@/library/brew/handoff/envelope";

/**
 * Entire assembled URL budget: scheme and every parameter included.
 *
 * 131,072 is about a third of the 393,216 characters measured to arrive
 * byte-exact on iOS 26.6 (device probe, September 2026), which was itself
 * only the top of the ladder we could test: Beanconqueror's collector caps a
 * payload at 1,024 chunks of 400 characters, so the transport never showed a
 * ceiling at all. The old 32,768 was set against a 97,120 measurement and was
 * an order of magnitude more cautious than it needed to be, which cost a long
 * brew its full trace for nothing.
 *
 * Generous is cheap here because truncation cannot corrupt an import: the URL
 * carries `len`, and the receiver compares it against what it reassembled
 * before inflating anything, so a short delivery fails cleanly and loudly
 * rather than importing half a brew. **Android is still entirely unmeasured**,
 * and this is the number to revisit when it is.
 */
export const MAX_URL_CHARS = 131_072;

// Mirrors Beanconqueror's existing shareUserBeanN chunk convention.
const CHUNK_CHARS = 400;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SINGLE_URL_PREFIX = "beanconqueror://ADD_BREW";
const BATCH_URL_PREFIX = "beanconqueror://ADD_BREWS";

/**
 * A batch gets the same budget as one brew. It is almost never what stops a
 * batch: gzip finds so much in common between repeated brews that fifty of
 * them assemble into around thirty thousand characters, well inside this. The
 * two limits below are what actually bite.
 */
export const MAX_BATCH_URL_CHARS = MAX_URL_CHARS;

/**
 * The most brews one link may carry.
 *
 * Beanconqueror's decoder refuses a longer batch outright, so this is its
 * number rather than ours, kept here so the user is told to select fewer while
 * they are still choosing rather than watching the other app reject the lot.
 *
 * It was a hundred until review pointed out that the figure never reconciled
 * with the inflate ceiling below: a full-trace brew is nearer sixty kilobytes
 * of JSON than twenty, so a hundred of them would have been refused at around
 * sixty-five. Fifty is roughly three megabytes, comfortably inside four, and
 * the number is bounded as much by what the receiver does with a batch as by
 * its size -- Beanconqueror rewrites its whole brew collection twice per
 * imported brew, so a long batch is a long freeze on the other side.
 */
export const MAX_BATCH_BREWS = 50;

/**
 * The most JSON a batch may inflate to on the receiving side.
 *
 * Beanconqueror inflates a handoff through a cap, because the payload is
 * attacker-controlled gzip and an uncapped inflate is a zip bomb waiting to
 * happen. That cap is the real ceiling on a batch: a whole brew is roughly
 * sixty kilobytes of JSON and compresses to a few hundred characters, so a
 * selection runs out of inflated bytes long before it runs out of URL.
 *
 * Checked here as well as there so the two cannot disagree quietly. If this
 * ever exceeds Beanconqueror's figure, batches that fit by our reckoning will
 * be refused by theirs, which the user sees as a send that did nothing.
 */
export const MAX_BATCH_INFLATED_BYTES = 4 * 1024 * 1024;

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
    const refusal = batchRefusal(envelopes, batch);
    if (refusal !== null) throw new Error(refusal);

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
    const batch = batchPayload(envelopes);
    if (batchRefusal(envelopes, batch) !== null) return false;
    return encodeAt(batch, batchFidelity(envelopes), BATCH_URL_PREFIX).urlChars
        <= MAX_BATCH_URL_CHARS;
}

/**
 * Why Beanconqueror would turn this batch away, or null if it would take it.
 *
 * Both limits belong to the receiver, so they are checked before the expensive
 * part: there is no sense compressing two megabytes to find out it was never
 * going to be accepted.
 */
function batchRefusal(envelopes: HandoffEnvelope[], batch: HandoffBatch): string | null {
    if (envelopes.length > MAX_BATCH_BREWS) {
        return `Beanconqueror batch handoff holds at most ${MAX_BATCH_BREWS} brews`;
    }
    const inflated = strToU8(JSON.stringify(batch)).length;
    if (inflated > MAX_BATCH_INFLATED_BYTES) {
        return `Beanconqueror batch handoff exceeds ${MAX_BATCH_INFLATED_BYTES} inflated bytes`;
    }
    return null;
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

/**
 * `mtime: 0` is not tidiness. fflate stamps the current time into gzip's header
 * by default, so the same unchanged brew encodes to a different URL every
 * second, and nothing downstream can tell "the same export again" from "an
 * export with an edit in it". Beanconqueror receives a URL, not a file, so the
 * timestamp describes nothing a reader wants and only spoils that comparison.
 */
function payload(handoffPayload: HandoffEnvelope | HandoffBatch): string {
    return base64Url(gzipSync(strToU8(JSON.stringify(handoffPayload)), {mtime: 0}));
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
 * Hand-written because Hermes does not ship `btoa`. Node does, so a `btoa`
 * "simplification" passes every test here and fails on the first real phone.
 * Bytes come from fflate's `strToU8` rather than `TextEncoder` for the same
 * reason: one UTF-8 encoder, already a dependency, on every runtime we target.
 * The URL alphabet (`-_`, no `=`) is what
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
