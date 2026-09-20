import {gzipSync, strToU8} from "fflate";

import {downsample, type HandoffEnvelope} from "@/library/brew/handoff/envelope";

export const MAX_URL_CHARS = 32_768;

const CHUNK_CHARS = 400;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const URL_PREFIX = "beanconqueror://ADD_BREW";

type HandoffFlowFidelity = NonNullable<HandoffEnvelope["flow"]>["fidelity"];

export type HandoffEncodingFidelity = HandoffFlowFidelity | "none";

export type EncodedHandoff = {
    url: string;
    fidelity: HandoffEncodingFidelity;
    chars: number;
};

export function encodeHandoff(envelope: HandoffEnvelope): EncodedHandoff {
    if (envelope.flow === undefined) return encodeWithinBudget(envelope, "none");

    let encoded = encode(envelope, "full");
    if (encoded.chars <= MAX_URL_CHARS) return encoded;

    let current = envelope;
    while (current.flow !== undefined) {
        const flow = downsample(current.flow, 2);
        if (flow === null) break;

        current = {...current, flow};
        encoded = encode(current, "downsampled");
        if (encoded.chars <= MAX_URL_CHARS) return encoded;
    }

    const {flow: _flow, ...withoutFlow} = envelope;
    return encodeWithinBudget(withoutFlow, "none");
}

function encodeWithinBudget(envelope: HandoffEnvelope, fidelity: HandoffEncodingFidelity): EncodedHandoff {
    const encoded = encode(envelope, fidelity);
    if (encoded.chars > MAX_URL_CHARS) {
        throw new Error(`Beanconqueror handoff URL exceeds ${MAX_URL_CHARS} characters without a flow trace`);
    }
    return encoded;
}

function encode(envelope: HandoffEnvelope, fidelity: HandoffEncodingFidelity): EncodedHandoff {
    const payload = base64Url(gzipSync(strToU8(JSON.stringify(envelope))));
    const url = `${URL_PREFIX}?len=${payload.length}${chunks(payload)
        .map((chunk, index) => `&shareBrew${index}=${chunk}`)
        .join("")}`;

    return {
        url,
        fidelity,
        chars: url.length
    };
}

function chunks(payload: string): string[] {
    const out: string[] = [];
    for (let offset = 0; offset < payload.length; offset += CHUNK_CHARS) {
        out.push(payload.slice(offset, offset + CHUNK_CHARS));
    }
    return out;
}

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
