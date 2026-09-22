import {gzipSync, gunzipSync, strToU8} from "fflate";

import {
    MAX_BATCH_BREWS,
    MAX_BATCH_INFLATED_BYTES,
    MAX_BATCH_URL_CHARS,
    MAX_URL_CHARS,
    batchFits,
    encodeHandoff,
    encodeHandoffBatch,
    type HandoffBatch
} from "@/library/brew/handoff/encode";
import {buildEnvelope, type HandoffEnvelope, type HandoffFlow} from "@/library/brew/handoff/envelope";
import {brew, decodeDeltas, extendedPlan} from "@/library/brew/handoff/__tests__/fixtures";
import type {BrewSample} from "@/library/brew/BrewRecord";

function samples(count: number, intervalMs = 100): BrewSample[] {
    let seed = 0x0bad_f00d;
    let water = 0;

    function random(): number {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
    }

    // Deliberate entropy keeps gzip from making budget assertions vacuous.
    return Array.from({length: count}, (_value, index) => {
        const pour = Math.min(4, Math.floor(index / Math.max(1, Math.ceil(count / 4))) + 1);
        const pouring = index % Math.max(1, Math.ceil(count / 4)) < Math.ceil(count / 4) * 0.63;
        if (pouring) water += 0.9 + random() * 0.2;
        const cup = Math.max(0, water - 18 + random() * 0.4);

        return {
            at: index * intervalMs,
            water: Math.round(water * 10) / 10,
            cup: Math.round(cup * 10) / 10,
            pour
        };
    });
}

function envelopeFromSamples(count: number, intervalMs = 100): HandoffEnvelope {
    return buildEnvelope(brew({
        endedAt: Date.UTC(2026, 8, 19, 7, 45, 3, 852),
        pours: 4,
        waterTotal: 320,
        cupTotal: 276,
        plan: extendedPlan,
        stageWater: [40, 100, 100, 80],
        dose: 20
    }), samples(count, intervalMs));
}

function payload(overrides: Partial<HandoffEnvelope> = {}): HandoffEnvelope {
    return {
        v: 1,
        app: {name: "XBRW++", version: "1.6.0"},
        brew: {
            date: "2026-09-20T10:00:00.000Z",
            waterIn: {value: 240, unit: "ml"},
            beverageOut: {value: 204, unit: "g"},
            brewTime: 188,
            preparationMethod: "xBloom",
        preparationType: "XBLOOM",
            note: "Stage 1"
        },
        imported: {
            source: "xbrw",
            sourceName: "XBRecipeWriter++",
            sourceUrl: "https://github.com/hessius/XBRecipeWriterPlus",
            device: "xBloom",
            schema: 1,
            params: {}
        },
        ...overrides
    };
}

function flow(count: number, intervalMs = 100, salt = 0): HandoffFlow {
    let waterSeed = 0x1234_5678 ^ salt;
    let weightSeed = 0x9abc_def0 ^ salt;

    return {
        fidelity: "full",
        t: Array.from({length: count}, (_value, index) => index === 0 ? 0 : intervalMs),
        // Deliberate entropy keeps gzip from making budget assertions vacuous.
        waterDispensed: Array.from({length: count}, (_value, index) => {
            if (index === 0) return 0;
            waterSeed = (waterSeed * 1_664_525 + 1_013_904_223) >>> 0;
            return (waterSeed % 997) + 1;
        }),
        weight: Array.from({length: count}, (_value, index) => {
            if (index === 0) return 0;
            weightSeed = (weightSeed * 22_695_477 + 1) >>> 0;
            return (weightSeed % 991) + 1;
        })
    };
}

function batchEnvelope(index: number, flowSamples = 800): HandoffEnvelope {
    return payload({
        brew: {
            ...payload().brew,
            date: new Date(Date.UTC(2026, 8, 20, 10, index, 0)).toISOString(),
            note: `Stage 1 · export ${index}`
        },
        flow: flow(flowSamples, 100, index)
    });
}

function legacySingleUrl(envelope: HandoffEnvelope): string {
    const encoded = Buffer.from(gzipSync(strToU8(JSON.stringify(envelope))))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const chunkParams: string[] = [];
    for (let offset = 0; offset < encoded.length; offset += 400) {
        chunkParams.push(`shareBrew${chunkParams.length}=${encoded.slice(offset, offset + 400)}`);
    }
    return `beanconqueror://ADD_BREW?len=${encoded.length}&${chunkParams.join("&")}`;
}

/**
 * Independent reader written against Beanconqueror's parameter convention,
 * not against encode.ts internals. Keep it local: moving this toward shared
 * code is the first step to it quietly depending on the encoder.
 */
function decode(url: string): HandoffEnvelope {
    return decodePayload<HandoffEnvelope>(url);
}

function decodePayload<T>(url: string): T {
    const joined = chunks(url).join("");

    const padded = joined
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(joined.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as T;
}

function chunks(url: string): string[] {
    const params = new URL(url).searchParams;
    return [...params.keys()]
        .filter((key) => /^shareBrew\d+$/.test(key))
        .map((key) => Number(key.slice("shareBrew".length)))
        .sort((a, b) => a - b)
        .map((index) => params.get(`shareBrew${index}`) ?? "");
}

describe("encodeHandoff", () => {
    it("keeps the single-brew ADD_BREW URL byte-for-byte stable", () => {
        const original = payload();
        const encoded = encodeHandoff(original);

        expect(encoded.url).toBe(legacySingleUrl(original));
    });

    it("round-trips through an independent reader", () => {
        const original = envelopeFromSamples(2_400);
        const {url} = encodeHandoff(original);

        expect(decode(url)).toStrictEqual(original);
    });

    it("uses only url-safe characters, so nothing needs re-escaping", () => {
        const {url} = encodeHandoff(envelopeFromSamples(2_400));

        chunks(url).forEach((chunk) => {
            expect(chunk).toMatch(/^[A-Za-z0-9_-]+$/);
        });
    });

    it("declares the joined base64url payload length", () => {
        const {url, urlChars} = encodeHandoff(envelopeFromSamples(2_400));
        const params = new URL(url).searchParams;
        const joined = chunks(url).join("");

        expect(Number(params.get("len"))).toBe(joined.length);
        expect(urlChars).toBe(url.length);
    });

    it("splits the payload into 400-character chunks", () => {
        const {url} = encodeHandoff(envelopeFromSamples(2_400));
        const values = chunks(url);

        expect(values.length).toBeGreaterThan(1);
        values.slice(0, -1).forEach((chunk) => {
            expect(chunk).toHaveLength(400);
        });
        expect(values.at(-1)!.length).toBeGreaterThan(0);
        expect(values.at(-1)!.length).toBeLessThanOrEqual(400);
    });

    it("keeps a realistic 2,400-sample brew at full fidelity inside the URL budget", () => {
        const encoded = encodeHandoff(envelopeFromSamples(2_400));

        expect(encoded.fidelity).toBe("full");
        expect(encoded.urlChars).toBeLessThan(MAX_URL_CHARS);
        expect(decode(encoded.url).flow?.t).toHaveLength(2_400);
    });

    it("downsamples enormous brews until they fit without shifting retained timestamps", () => {
        const original = payload({flow: flow(120_000)});
        const originalTimes = decodeDeltas(original.flow!.t);
        const encoded = encodeHandoff(original);
        const decoded = decode(encoded.url);
        const decodedTimes = decodeDeltas(decoded.flow!.t);
        const stride = originalTimes.indexOf(decodedTimes[1]!);

        expect(encoded.fidelity).toBe("downsampled");
        expect(encoded.urlChars).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(decoded.flow?.fidelity).toBe("downsampled");
        expect(decoded.flow!.t.length).toBeLessThan(original.flow!.t.length);
        expect(stride).toBeGreaterThan(1);
        expect(decodedTimes).toEqual(decodedTimes.map((_time, index) => originalTimes[index * stride]));
    });

    it("drops flow when even the 1 Hz floor cannot fit, keeping the brew note", () => {
        const encoded = encodeHandoff(payload({
            brew: {
                ...payload().brew,
                note: "This note is the reason for the export."
            },
            flow: flow(400_000)
        }));
        const decoded = decode(encoded.url);

        expect(encoded.fidelity).toBe("none");
        expect(encoded.urlChars).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(decoded).not.toHaveProperty("flow");
        expect(decoded.brew.note).toBe("This note is the reason for the export.");
    });

    it("encodes swept-stream envelopes without discovering that path by degradation", () => {
        const original = payload();
        const encoded = encodeHandoff(original);

        expect(encoded.fidelity).toBe("none");
        expect(encoded.urlChars).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(decode(encoded.url)).toStrictEqual(original);
    });
});

describe("encodeHandoffBatch", () => {
    it("uses ADD_BREWS and round-trips complete envelopes with intact flow traces", () => {
        const originals = [batchEnvelope(1), batchEnvelope(2), batchEnvelope(3)];
        const encoded = encodeHandoffBatch(originals);
        const decoded = decodePayload<HandoffBatch>(encoded.url);

        expect(encoded.url).toMatch(/^beanconqueror:\/\/ADD_BREWS\?len=\d+&shareBrew0=/);
        expect(decoded).toStrictEqual({v: 1, brews: originals});
        decoded.brews.forEach((brewEnvelope, index) => {
            expect(brewEnvelope.flow).toStrictEqual(originals[index].flow);
            expect(brewEnvelope.flow?.fidelity).toBe("full");
            expect(brewEnvelope.flow?.t).toHaveLength(800);
        });
    });

    it("keeps a single-element batch on the ADD_BREWS action", () => {
        const original = batchEnvelope(1);
        const encoded = encodeHandoffBatch([original]);

        expect(encoded.url).toMatch(/^beanconqueror:\/\/ADD_BREWS\?/);
        expect(decodePayload<HandoffBatch>(encoded.url)).toStrictEqual({v: 1, brews: [original]});
    });

    it("refuses an oversized batch instead of thinning any trace", () => {
        const originals = Array.from({length: 14}, (_value, index) => batchEnvelope(index, 2_400));
        const untouchedFlows = originals.map((envelope) => envelope.flow);

        expect(() => encodeHandoffBatch(originals)).toThrow(
            `Beanconqueror batch handoff URL exceeds ${MAX_BATCH_URL_CHARS} characters`
        );
        originals.forEach((envelope, index) => {
            expect(envelope.flow).toStrictEqual(untouchedFlows[index]);
            expect(envelope.flow?.fidelity).toBe("full");
            expect(envelope.flow?.t).toHaveLength(2_400);
        });
    });

    it("reports the same batch boundary as the encoder enforces", () => {
        const envelopes = Array.from({length: 20}, (_value, index) => batchEnvelope(index, 2_400));
        const firstTooLarge = envelopes.findIndex((_envelope, index) =>
            !batchFits(envelopes.slice(0, index + 1))
        );

        expect(firstTooLarge).toBeGreaterThan(0);
        const fitting = envelopes.slice(0, firstTooLarge);
        const oversized = envelopes.slice(0, firstTooLarge + 1);

        expect(batchFits(fitting)).toBe(true);
        expect(encodeHandoffBatch(fitting).urlChars).toBeLessThanOrEqual(MAX_BATCH_URL_CHARS);
        expect(batchFits(oversized)).toBe(false);
        expect(() => encodeHandoffBatch(oversized)).toThrow(
            `Beanconqueror batch handoff URL exceeds ${MAX_BATCH_URL_CHARS} characters`
        );
    });

    // The two limits below belong to Beanconqueror, not to us. They are
    // checked here so the app can say "select fewer" while the user is still
    // choosing, instead of handing over a link the other app throws away.
    it("refuses more brews than Beanconqueror will accept in one link", () => {
        const withinLimit = Array.from({length: MAX_BATCH_BREWS}, (_value, index) =>
            batchEnvelope(index, 2));
        const overLimit = [...withinLimit, batchEnvelope(MAX_BATCH_BREWS, 2)];

        expect(batchFits(withinLimit)).toBe(true);
        expect(batchFits(overLimit)).toBe(false);
        expect(() => encodeHandoffBatch(overLimit)).toThrow(
            `Beanconqueror batch handoff holds at most ${MAX_BATCH_BREWS} brews`
        );
    });

    it("refuses a batch that would inflate past what the reader will accept", () => {
        // A note is the cheapest way to make a large payload that gzip cannot
        // shrink away, which is the point: the URL would be comfortable here
        // and the inflated JSON would not.
        const wordy = batchEnvelope(0, 2);
        wordy.brew.note = Array.from({length: MAX_BATCH_INFLATED_BYTES / 8},
            (_value, index) => `note ${index}`).join(" ");

        expect(batchFits([wordy])).toBe(false);
        expect(() => encodeHandoffBatch([wordy])).toThrow(
            `Beanconqueror batch handoff exceeds ${MAX_BATCH_INFLATED_BYTES} inflated bytes`
        );
    });

    it("rejects empty batches instead of producing a no-op URL", () => {
        expect(batchFits([])).toBe(false);
        expect(() => encodeHandoffBatch([])).toThrow(
            "Beanconqueror batch handoff requires at least one brew"
        );
    });
});

describe("batch fidelity", () => {
    it("never reports a thinned trace, because a batch refuses instead of thinning", () => {
        const withFlow = batchEnvelope(1);
        const {flow: _flow, ...withoutFlow} = batchEnvelope(2);

        expect(encodeHandoffBatch([withFlow, withoutFlow]).fidelity).toBe("full");
        expect(encodeHandoffBatch([withoutFlow]).fidelity).toBe("none");
    });
});
