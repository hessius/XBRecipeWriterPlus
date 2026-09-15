import {mapRow} from "../mapRow";

const row = () => ({
    tableId: 4242,
    theName: "Kenya Nyeri",
    theColor: "#B8C9A2",
    grandWater: 16,
    dose: 18,
    pourCount: 1,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    pourList: [
        {
            pourNumber: 1,
            volume: 288,
            temperature: 93,
            pattern: 1,
            flowRate: 3,
            pausing: 30,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 0,
        },
    ],
});

describe("mapRow", () => {
    it("produces a Recipe from a row", async () => {
        const recipe = mapRow(row());
        expect(recipe).not.toBeNull();
        expect(recipe!.dosage).toBe(18);
        expect(recipe!.ratio).toBe(16);
        expect(recipe!.xid).toBe("AB12CD");
    });

    it("carries the cloud id across", async () => {
        expect(mapRow(row())!.cloudId).toBe(4242);
    });

    it("marks the recipe as imported", async () => {
        expect(mapRow(row())!.source).toBe("import");
    });

    it("returns null for a row the mapper cannot read", async () => {
        // A shape change must not produce a half-built recipe whose next stop
        // is a real card.
        expect(mapRow({tableId: 1})).toBeNull();
        expect(mapRow({})).toBeNull();
    });

    it("returns null when the row carries no id", async () => {
        const bad = row() as Record<string, unknown>;
        delete bad.tableId;
        expect(mapRow(bad)).toBeNull();
    });

    it("keeps the raw colour so the accent can be matched later", async () => {
        expect(mapRow(row())!.cloudColor).toBe("#B8C9A2");
    });
});
