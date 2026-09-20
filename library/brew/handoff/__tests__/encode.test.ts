import {gunzipSync} from "fflate";

import {MAX_URL_CHARS, encodeHandoff} from "@/library/brew/handoff/encode";
import {buildEnvelope, downsample, type HandoffEnvelope, type HandoffFlow} from "@/library/brew/handoff/envelope";
import type {BrewSample, PlanStage} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";
import {AGITATION, POUR_PATTERN} from "@/library/Pour";

const plan: PlanStage[] = [
    {
        pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
        agitation: AGITATION.BEFORE_ON_AFTER_OFF,
        pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 30
    },
    {
        pourNumber: 2, volume: 100, temperature: 92, flowRate: 50,
        agitation: AGITATION.ALL_OFF,
        pourPattern: POUR_PATTERN.CIRCULAR, pauseTime: 15
    },
    {
        pourNumber: 3, volume: 100, temperature: 90, flowRate: 50,
        agitation: AGITATION.BEFORE_OFF_AFTER_ON,
        pourPattern: POUR_PATTERN.CENTERED, pauseTime: 0
    },
    {
        pourNumber: 4, volume: 80, temperature: 88, flowRate: 45,
        agitation: AGITATION.ALL_OFF,
        pourPattern: POUR_PATTERN.CENTERED, pauseTime: 0
    }
];

function brew(overrides: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "brew-1",
        recipeUuid: "recipe-1",
        recipeName: "Gummy Worms",
        accent: "#c8752f",
        startedAt: Date.UTC(2026, 8, 19, 7, 41, 3, 852),
        endedAt: Date.UTC(2026, 8, 19, 7, 45, 3, 852),
        outcome: "done",
        failure: null,
        pours: 4,
        waterTotal: 320,
        cupTotal: 276,
        heldSeconds: 0,
        hasStream: true,
        plan,
        stageWater: [40, 100, 100, 80],
        dose: 20,
        ratio: 16,
        grindSize: 62,
        grinderRpm: 6_400,
        grinderUsed: true,
        coffee: {
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            beanMix: "Single Origin",
            note: "A producer narrative.",
            imageUrl: "https://example.com/pod.png"
        },
        ...overrides
    };
}

function samples(count: number, intervalMs = 100): BrewSample[] {
    let seed = 0x0bad_f00d;
    let water = 0;

    function random(): number {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
    }

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
    return buildEnvelope(brew(), samples(count, intervalMs));
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

function flow(count: number, intervalMs = 100): HandoffFlow {
    let waterSeed = 0x1234_5678;
    let weightSeed = 0x9abc_def0;

    return {
        fidelity: "full",
        t: Array.from({length: count}, (_value, index) => index === 0 ? 0 : intervalMs),
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

function decodeDeltas(values: number[]): number[] {
    const out: number[] = [];
    let total = 0;
    values.forEach((value) => {
        total += value;
        out.push(total);
    });
    return out;
}

/**
 * Independent reader written against Beanconqueror's parameter convention,
 * not against encode.ts internals.
 */
function decode(url: string): HandoffEnvelope {
    const params = new URL(url).searchParams;
    const indices = [...params.keys()]
        .filter((key) => /^shareBrew\d+$/.test(key))
        .map((key) => Number(key.slice("shareBrew".length)))
        .sort((a, b) => a - b);
    const joined = indices.map((index) => params.get(`shareBrew${index}`) ?? "").join("");

    expect(joined).toHaveLength(Number(params.get("len")));

    const padded = joined
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(joined.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as HandoffEnvelope;
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
        const {url, chars} = encodeHandoff(envelopeFromSamples(2_400));
        const params = new URL(url).searchParams;
        const joined = chunks(url).join("");

        expect(Number(params.get("len"))).toBe(joined.length);
        expect(chars).toBe(url.length);
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
        expect(encoded.chars).toBeLessThan(MAX_URL_CHARS);
        expect(decode(encoded.url).flow?.t).toHaveLength(2_400);
    });

    it("downsamples enormous brews until they fit without shifting retained timestamps", () => {
        const original = payload({flow: flow(24_000)});
        const originalTimes = decodeDeltas(original.flow!.t);
        const encoded = encodeHandoff(original);
        const decoded = decode(encoded.url);
        const decodedTimes = decodeDeltas(decoded.flow!.t);
        const stride = originalTimes.indexOf(decodedTimes[1]!);

        expect(encoded.fidelity).toBe("downsampled");
        expect(encoded.chars).toBeLessThanOrEqual(MAX_URL_CHARS);
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
        expect(encoded.chars).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(decoded).not.toHaveProperty("flow");
        expect(decoded.brew.note).toBe("This note is the reason for the export.");
    });

    it("encodes swept-stream envelopes without discovering that path by degradation", () => {
        const original = payload();
        const encoded = encodeHandoff(original);

        expect(encoded.fidelity).toBe("none");
        expect(encoded.chars).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(decode(encoded.url)).toStrictEqual(original);
    });
});

describe("downsample", () => {
    it("returns null when thinning would push the mean interval past the 1 Hz floor", () => {
        expect(downsample(flow(10, 1_000), 2)).toBeNull();
    });
});
