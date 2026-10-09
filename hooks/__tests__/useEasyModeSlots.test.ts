import {act, renderHook} from "@testing-library/react-native";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {incomingEasyModeRecipe, openEasyModeRecipe, prepareEasyModeEntry, sharedSlotDatabase, useEasyModeSlots, useSlotRecord} from "@/hooks/useEasyModeSlots";
import {forgetLastMove, SETTLE_MS} from "@/hooks/steadyRouter";
import type {SlotLease} from "@/library/slots/slotWriter";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args)}
}));
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));

beforeEach(() => {
    forgetLastMove();
    mockPush.mockClear();
});

it.each([undefined, null, 0, "15", {}, -1, 32])(
    "refuses raw incoming dosage %p instead of opening a default-dose recipe", (dosage) => {
        const raw = JSON.parse(JSON.stringify(coffee()));
        raw.dosage = dosage;
        const incoming = incomingEasyModeRecipe(JSON.stringify(raw));
        expect(incoming.recipe).toBeUndefined();
        expect(incoming.error).toMatch(/dose|dosage/i);
    }
);

it.each([1, 15, 31])("preserves incoming raw dosage %s and its actual wire bytes", (dosage) => {
    const recipe = coffee();
    recipe.dosage = dosage;
    recipe.ratio = 5;
    recipe.pours[0].volume = dosage * 5;
    const incoming = incomingEasyModeRecipe(JSON.stringify(recipe));
    expect(incoming.error).toBeNull();
    expect(incoming.recipe?.dosage).toBe(dosage);
    expect(snapshotRecipe(incoming.recipe!).blob).toEqual(snapshotRecipe(recipe).blob);
});

it("assigns only once on rapid context taps but allows a deliberate repeat visit", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    const recipe = coffee();
    const store = sharedSlotDatabase();
    const deviceId = "rapid-context";
    try {
        openEasyModeRecipe(recipe, deviceId);
        openEasyModeRecipe(recipe, deviceId);
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(store.read(deviceId).drafts.map((slot) => slot?.sourceUuid ?? null))
            .toEqual([recipe.uuid, null, null]);
        now.mockReturnValue(1000 + SETTLE_MS);
        openEasyModeRecipe(recipe, deviceId);
        expect(mockPush).toHaveBeenCalledTimes(2);
        expect(store.read(deviceId).drafts[1]?.sourceUuid).toBe(recipe.uuid);
    } finally {
        now.mockRestore();
    }
});

it("context entry fills only an empty slot and full sets require replacement choice", () => {
    const store = new SlotDatabase(createTestDatabase());
    const recipe = coffee();
    expect(prepareEasyModeEntry(store, "one", recipe)).toEqual({pathname: "/easyMode"});
    expect(store.read("one").drafts[0]?.sourceUuid).toBe(recipe.uuid);
    prepareEasyModeEntry(store, "one", recipe);
    prepareEasyModeEntry(store, "one", recipe);
    expect(prepareEasyModeEntry(store, "one", recipe).params?.recipeJSON).toBe(JSON.stringify(recipe));
    expect(store.read("one").drafts.every((slot) => slot?.sourceUuid === recipe.uuid)).toBe(true);
});

it("notifies both screen and library subscribers after a durable assignment", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, undefined, store
    ));
    const library = await renderHook(() => useSlotRecord("one", store));
    await act(async () => editor.result.current.assign(1, coffee()));
    expect(library.result.current.drafts[1]?.name).toBe("Morning");
    expect(editor.result.current.error).toBeNull();
});

it("context entry during recovery opens the frozen batch without proposing a replacement", () => {
    const store = new SlotDatabase(createTestDatabase());
    const recipe = coffee();
    const slot = snapshotRecipe(recipe);
    store.begin("one", {
        id: "attempt", serial: null, slots: [slot, slot, slot],
        frames: prepareSet([slot, slot, slot]),
        acknowledged: 0, inFlight: null, error: null
    });
    expect(prepareEasyModeEntry(store, "one", coffee("Replacement")))
        .toEqual({pathname: "/easyMode"});
    expect(store.read("one").drafts).toEqual([null, null, null]);
});

it("surfaces invalid assignment and production transport blocks without a journal", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, undefined, store
    ));
    const invalid = coffee();
    invalid.bypassEnabled = true;
    await act(async () => editor.result.current.assign(0, invalid));
    expect(editor.result.current.error).toMatch(/bypass/i);
    await act(async () => { await editor.result.current.write(); });
    expect(editor.result.current.error).toMatch(/integrat/i);
    expect(store.read("one").journal).toBeNull();
});

it("holds the screen lock across a duplicate tap while lease acquisition is pending", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
    let resolveLease: (lease: SlotLease) => void = () => { throw new Error("No pending acquisition"); };
    const acquire = jest.fn(() => new Promise<SlotLease>((resolve) => { resolveLease = resolve; }));
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, {available: true, acquire}, store
    ));
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
        first = editor.result.current.write();
        void editor.result.current.write();
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(editor.result.current.running).toBe(true);
    await act(async () => {
        resolveLease({
            sendAndConfirm: async () => {},
            confirmSaved: async () => {},
            release: () => {}
        });
        await first;
    });
    expect(editor.result.current.running).toBe(false);
});
