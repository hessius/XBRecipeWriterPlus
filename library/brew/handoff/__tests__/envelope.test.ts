import {buildEnvelope, downsample, type HandoffFlow} from "@/library/brew/handoff/envelope";
import {DEVICE_NAME} from "@/library/brew/handoff/device";
import {brew, decodeDeltas, samples} from "@/library/brew/handoff/__tests__/fixtures";
import appConfig from "@/app.json";

function hasUndefined(value: unknown): boolean {
    if (value === undefined) return true;
    if (Array.isArray(value)) return value.some(hasUndefined);
    if (value !== null && typeof value === "object") {
        return Object.values(value).some(hasUndefined);
    }
    return false;
}

describe("buildEnvelope", () => {
    it("carries every brew figure with the units and bare values the schema names", () => {
        const envelope = buildEnvelope(brew(), samples);

        expect(envelope.v).toBe(1);
        expect(envelope.app).toEqual({name: "XBRW++", version: appConfig.expo.version});
        expect(envelope.brew).toMatchObject({
            date: "2026-09-19T07:41:03.852Z",
            doseIn: {value: 15, unit: "g"},
            waterIn: {value: 240, unit: "ml"},
            beverageOut: {value: 204, unit: "g"},
            brewTime: 188,
            temperature: 94,
            ratio: 16,
            grindSize: "62",
            grinderRpm: 6_400,
            grinderName: DEVICE_NAME,
            preparationMethod: DEVICE_NAME,
            bloomTime: 30,
            firstDripTime: 2.5
        });
    });

    it("omits first drip rather than reporting zero when the cup never moved", () => {
        const dry = samples.map((sample) => ({...sample, cup: 0}));

        expect(buildEnvelope(brew(), dry).brew).not.toHaveProperty("firstDripTime");
    });

    it("sends stage temperatures as a target staircase metric", () => {
        const {metrics} = buildEnvelope(brew(), samples);

        expect(metrics).toEqual([{
            key: "targetTemperature",
            name: "Target temp",
            unit: "°C",
            kind: "target",
            t: [0, 40_000, 40_000, 75_000, 75_000, 95_000],
            v: [94, 94, 92, 92, 90, 90]
        }]);
    });

    it("names itself and its fixed https source", () => {
        const {imported} = buildEnvelope(brew(), samples);

        expect(imported).toMatchObject({
            source: "xbrw",
            sourceName: "XBRecipeWriter++",
            sourceUrl: "https://github.com/hessius/XBRecipeWriterPlus",
            device: DEVICE_NAME,
            schema: 1
        });
        if (imported.sourceUrl === undefined) throw new Error("sourceUrl missing");
        expect(new URL(imported.sourceUrl).protocol).toBe("https:");
    });

    it("omits pour numbers from imported plan stages because order carries them", () => {
        const {imported} = buildEnvelope(brew(), samples);
        const exportedPlan = imported.params.plan as Record<string, unknown>[];

        expect(exportedPlan).toHaveLength(3);
        exportedPlan.forEach((stage) => {
            expect(stage).not.toHaveProperty("pourNumber");
        });
        expect(exportedPlan[0]).toMatchObject({
            volume: 40,
            temperature: 94,
            flowRate: 40
        });
    });

    it("carries pod coffee hints only when a pod coffee is present", () => {
        expect(buildEnvelope(brew(), samples).bean).toEqual({
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            beanMix: "Single Origin",
            note: "A producer narrative.",
            imageUrl: "https://example.com/pod.png"
        });

        expect(buildEnvelope(brew({coffee: undefined}), samples)).not.toHaveProperty("bean");
    });

    it("omits grinder hints and grind size when the grinder did not run", () => {
        const envelope = buildEnvelope(brew({
            grinderUsed: false,
            grindSize: 81,
            grinderRpm: undefined
        }), samples);

        expect(envelope.brew).not.toHaveProperty("grinderName");
        expect(envelope.brew).not.toHaveProperty("grindSize");
        expect(envelope.brew).not.toHaveProperty("grinderRpm");
    });

    it("carries the generated note", () => {
        expect(buildEnvelope(brew(), samples).brew.note).toBe(`#1 · 40 ml · 94°C · spiral · agitate before · wait 30 s
#2 · 100 ml · 92°C · circular · wait 15 s
#3 · 100 ml · 90°C · centred · agitate after

15 g · 1:16 · grind 62 · 3 stages · xBloom`);
    });

    it("exports swept-stream brews without flow but with their figures intact", () => {
        const envelope = buildEnvelope(brew({hasStream: false}), samples);

        expect(envelope).not.toHaveProperty("flow");
        expect(envelope.brew.waterIn).toEqual({value: 240, unit: "ml"});
        expect(envelope.brew.beverageOut).toEqual({value: 204, unit: "g"});
        expect(envelope.brew.doseIn).toEqual({value: 15, unit: "g"});
    });

    it("omits flow when no samples were kept", () => {
        expect(buildEnvelope(brew(), [])).not.toHaveProperty("flow");
    });

    it("delta-codes flow arrays reversibly", () => {
        const envelope = buildEnvelope(brew(), samples);

        expect(envelope.flow).toEqual({
            fidelity: "full",
            t: [0, 1_000, 1_500, 2_000],
            waterDispensed: [0, 42, 55, 54],
            weight: [0, 0, 12, 46]
        });
        expect(decodeDeltas(envelope.flow!.t)).toEqual(samples.map((sample) => sample.at));
        expect(decodeDeltas(envelope.flow!.waterDispensed))
            .toEqual(samples.map((sample) => Math.round(sample.water * 10)));
        expect(decodeDeltas(envelope.flow!.weight))
            .toEqual(samples.map((sample) => Math.round(sample.cup * 10)));
    });

    it("exports an old record without optional fields and without undefined values", () => {
        const old = brew({
            plan: undefined,
            stageWater: undefined,
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined,
            coffee: undefined,
        });

        const envelope = buildEnvelope(old, samples);

        expect(envelope.brew).not.toHaveProperty("doseIn");
        expect(envelope.brew).not.toHaveProperty("ratio");
        expect(envelope.brew).not.toHaveProperty("grindSize");
        expect(envelope.brew).not.toHaveProperty("grinderRpm");
        expect(envelope.brew).not.toHaveProperty("grinderName");
        expect(envelope).not.toHaveProperty("bean");
        expect(envelope).not.toHaveProperty("metrics");
        expect(hasUndefined(envelope)).toBe(false);
    });

    it("survives a JSON round trip unchanged and without undefined values", () => {
        const envelope = buildEnvelope(brew(), samples);
        const roundTripped = JSON.parse(JSON.stringify(envelope)) as typeof envelope;

        expect(hasUndefined(envelope)).toBe(false);
        expect(roundTripped).toStrictEqual(envelope);
    });
});

describe("downsample", () => {
    it("returns null when thinning would push the mean interval past the 1 Hz floor", () => {
        const flow: HandoffFlow = {
            fidelity: "full",
            t: Array.from({length: 10}, (_value, index) => index === 0 ? 0 : 1_000),
            waterDispensed: Array.from({length: 10}, (_value, index) => index),
            weight: Array.from({length: 10}, (_value, index) => index)
        };

        expect(downsample(flow, 2)).toBeNull();
    });
});
