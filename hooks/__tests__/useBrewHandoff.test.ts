import {act, renderHook} from "@testing-library/react-native";
import {gunzipSync} from "fflate";
import {Linking} from "react-native";

import {HANDOFF_OPEN_FAILED, HANDOFF_TOO_LARGE, useBrewHandoff} from "@/hooks/useBrewHandoff";
import type {BrewExportSource} from "@/hooks/useBrewExport";
import {notify} from "@/components/XbrwToast";
import {buildEnvelope, type HandoffEnvelope} from "@/library/brew/handoff/envelope";
import * as handoffEncode from "@/library/brew/handoff/encode";
import {encodeHandoff} from "@/library/brew/handoff/encode";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/library/RecipeDatabase", () => jest.fn());

const notifyMock = notify as jest.MockedFunction<typeof notify>;
const RecipeDatabaseMock = RecipeDatabase as jest.MockedClass<typeof RecipeDatabase>;
let openURL: jest.SpiedFunction<typeof Linking.openURL>;

function source(): BrewExportSource {
    return {record: brew(), samples};
}

function recipe(overrides: Partial<Pick<
    Recipe,
    "dosage" | "ratio" | "grindSize" | "grindRPM" | "grinder"
>> = {}): Recipe {
    const result = new Recipe();
    result.dosage = 18;
    result.ratio = 15;
    result.grindSize = 63;
    result.grindRPM = 90;
    result.grinder = true;
    Object.assign(result, overrides);
    return result;
}

function recipeStore(found: Recipe | null): RecipeDatabase {
    return {
        getRecipe: jest.fn(() => found)
    } as unknown as RecipeDatabase;
}

function decode(url: string): HandoffEnvelope {
    const params = new URL(url).searchParams;
    const joined = [...params.keys()]
        .filter((key) => /^shareBrew\d+$/.test(key))
        .map((key) => Number(key.slice("shareBrew".length)))
        .sort((a, b) => a - b)
        .map((index) => params.get(`shareBrew${index}`) ?? "")
        .join("");
    const padded = joined
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(joined.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as HandoffEnvelope;
}

describe("useBrewHandoff", () => {
    beforeEach(() => {
        RecipeDatabaseMock.mockReset();
        RecipeDatabaseMock.mockImplementation(() => recipeStore(null));
        openURL = jest.spyOn(Linking, "openURL");
        openURL.mockReset();
        openURL.mockResolvedValue(undefined);
        notifyMock.mockClear();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("opens a Beanconqueror brew handoff URL", async () => {
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledWith(expect.stringMatching(
            /^beanconqueror:\/\/ADD_BREW\?len=\d+&shareBrew0=/
        ));
    });

    it("ignores a second press while the first handoff is still in flight", async () => {
        let release!: () => void;
        openURL.mockImplementationOnce(
            () => new Promise<void>((resolve) => { release = resolve; })
        );
        const {result} = await renderHook(() => useBrewHandoff(source));
        let first!: Promise<void>;
        let second!: Promise<void>;

        await act(async () => {
            first = result.current.send();
            await Promise.resolve();
        });

        expect(result.current.busy).toBe(true);

        await act(async () => {
            second = result.current.send();
            expect(openURL).toHaveBeenCalledTimes(1);
            release();
            await Promise.all([first, second]);
        });

        expect(openURL).toHaveBeenCalledTimes(1);
    });

    it("allows another handoff after the first one completes", async () => {
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });
        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledTimes(2);
    });

    it("keeps the URL unchanged when all recipe fields were recorded", async () => {
        const record = brew();
        const expected = encodeHandoff(buildEnvelope(record, samples)).url;
        RecipeDatabaseMock.mockImplementation(() => recipeStore(recipe({
            dosage: 20,
            ratio: 12,
            grindSize: 70,
            grindRPM: 120,
            grinder: true
        })));
        const {result} = await renderHook(() => useBrewHandoff(() => ({record, samples})));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledWith(expected);
        expect(decode(expected).brew.note).not.toContain("read from recipe");
    });

    it("fills old handoff fields from the recipe and exports them", async () => {
        const record = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });
        RecipeDatabaseMock.mockImplementation(() => recipeStore(recipe()));
        const {result} = await renderHook(() => useBrewHandoff(() => ({record, samples})));

        await act(async () => {
            await result.current.send();
        });

        const opened = openURL.mock.calls[0]?.[0];
        if (opened === undefined) throw new Error("handoff URL was not opened");
        const envelope = decode(opened);
        expect(envelope.brew.doseIn).toEqual({value: 18, unit: "g"});
        expect(envelope.brew.ratio).toBe(15);
        expect(envelope.brew.grindSize).toBe("63");
        expect(envelope.brew.note).toContain(
            "Dose, ratio and grinder read from the recipe, not this recording."
        );
    });

    it("sends old records unchanged when the recipe is missing", async () => {
        const record = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });
        const expected = encodeHandoff(buildEnvelope(record, samples)).url;
        RecipeDatabaseMock.mockImplementation(() => recipeStore(null));
        const {result} = await renderHook(() => useBrewHandoff(() => ({record, samples})));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).toHaveBeenCalledWith(expected);
        const envelope = decode(expected);
        expect(envelope.brew).not.toHaveProperty("doseIn");
        expect(envelope.brew).not.toHaveProperty("ratio");
        expect(envelope.brew).not.toHaveProperty("grindSize");
        expect(envelope.brew.note).not.toContain("read from recipe");
        expect(notifyMock).not.toHaveBeenCalled();
    });

    it("keeps a backfilled stream attached to the handoff", async () => {
        const record = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined,
            hasStream: true
        });
        RecipeDatabaseMock.mockImplementation(() => recipeStore(recipe()));
        const {result} = await renderHook(() => useBrewHandoff(() => ({record, samples})));

        await act(async () => {
            await result.current.send();
        });

        const opened = openURL.mock.calls[0]?.[0];
        if (opened === undefined) throw new Error("handoff URL was not opened");
        expect(decode(opened).flow).toMatchObject({
            fidelity: "full",
            t: [0, 1_000, 1_500, 2_000]
        });
    });

    it("reports a rejected open to the user as a Beanconqueror error", async () => {
        openURL.mockRejectedValueOnce(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_OPEN_FAILED
        });
    });

    it("clears busy after Beanconqueror cannot be opened", async () => {
        openURL.mockRejectedValueOnce(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(result.current.busy).toBe(false);
    });

    it("reports an encoding failure as an oversized brew and clears busy", async () => {
        jest.spyOn(handoffEncode, "encodeHandoff").mockImplementationOnce(() => {
            throw new Error("too large");
        });
        const {result} = await renderHook(() => useBrewHandoff(source));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_TOO_LARGE
        });
        expect(notifyMock).not.toHaveBeenCalledWith({
            tone: "error",
            message: HANDOFF_OPEN_FAILED
        });
        expect(result.current.busy).toBe(false);
    });

    it("does nothing when there is no brew to hand off", async () => {
        const {result} = await renderHook(() => useBrewHandoff(() => null));

        await act(async () => {
            await result.current.send();
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).not.toHaveBeenCalled();
        expect(result.current.busy).toBe(false);
    });

    it("uses handoff failure copy without any dash characters", () => {
        for (const message of [HANDOFF_OPEN_FAILED, HANDOFF_TOO_LARGE]) {
            expect(message).not.toMatch(/[-–—]/);
        }
    });
});
