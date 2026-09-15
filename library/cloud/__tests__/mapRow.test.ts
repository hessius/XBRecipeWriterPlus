import {cardWriteProblems} from "@/library/cardLimits";
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {CUP_TYPE} from "@/library/Recipe";
import {mapRow} from "../mapRow";

const row = () => ({
    tableId: 4242,
    theName: "Kenya Nyeri",
    theColor: "#B8C9A2",
    grandWater: 16,
    dose: 18,
    pourCount: 2,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    // Two stages, because one is not a realistic account recipe and 288 ml in
    // a single stage is not even writable -- the card stops at 240. 18 g at
    // 1:16 is 288 ml, which is what the machine checks the stages sum to.
    pourList: [
        {
            pourNumber: 1,
            volume: 144,
            temperature: 93,
            pattern: 1,
            flowRate: 3,
            pausing: 30,
            isEnableVibrationBefore: 1,
            isEnableVibrationAfter: 0,
        },
        {
            pourNumber: 2,
            volume: 144,
            temperature: 90,
            pattern: 2,
            flowRate: 3,
            pausing: 0,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 1,
        },
    ],
});

describe("mapRow", () => {
    it("produces a Recipe from a row", async () => {
        const mapped = mapRow(row());
        expect(mapped).not.toBeNull();
        expect(mapped!.recipe.dosage).toBe(18);
        expect(mapped!.recipe.ratio).toBe(16);
        expect(mapped!.recipe.xid).toBe("AB12CD");
    });

    it("carries the cloud id across", async () => {
        expect(mapRow(row())!.recipe.cloudId).toBe(4242);
    });

    it("marks the recipe as imported", async () => {
        expect(mapRow(row())!.recipe.source).toBe("import");
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
        expect(mapRow(row())!.color).toBe("#B8C9A2");
    });

    /**
     * Every field the mapper reads, asserted one by one.
     *
     * Without these the pour mapping was barely tested: renaming `pausing` to
     * anything else left the suite green while every stage silently kept
     * `pauseTime` at its -1 sentinel. The names here are xBloom's, and the
     * only place they are checked is against a real server we cannot call
     * from a test -- so the test has to at least notice when we stop reading
     * one of them.
     */
    it("reads every field of every stage", async () => {
        const recipe = mapRow(row())!.recipe;
        expect(recipe.pours).toHaveLength(2);

        const [first, second] = recipe.pours;

        expect(first.volume).toBe(144);
        expect(first.temperature).toBe(93);
        // xBloom's pattern numbers are not ours and are not even in the same
        // order: their 1 is centred, their 2 is spiral, their 3 is circular,
        // while ours run centred, circular, spiral. Anyone "tidying" that
        // switch into a straight 1:1 would swap spiral and circular on every
        // imported recipe, so both mappings are pinned here.
        expect(first.pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(first.flowRate).toBe(30);
        expect(first.pauseTime).toBe(30);
        expect(first.getAgitation()).toBe(AGITATION.BEFORE_ON_AFTER_OFF);

        expect(second.volume).toBe(144);
        expect(second.temperature).toBe(90);
        expect(second.pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(second.pauseTime).toBe(0);
        expect(second.getAgitation()).toBe(AGITATION.BEFORE_OFF_AFTER_ON);
    });

    it("takes the name the user gave the recipe in xBloom", async () => {
        expect(mapRow(row())!.recipe.name).toBe("Kenya Nyeri");
    });

    it("reads the grinder settings", async () => {
        const recipe = mapRow(row())!.recipe;
        expect(recipe.grindSize).toBe(60);
        expect(recipe.grindRPM).toBe(100);
        expect(recipe.grinder).toBe(true);
    });

    /**
     * The one assertion that ties this to the real constraint.
     *
     * A mapped recipe's next stop is a physical card, and `cardWriteProblems`
     * is the app's single authority on what a card will take -- per-stage
     * volume, temperature, flow rate, pause, pattern, agitation, and the sum
     * the machine rejects a recipe for missing. An account recipe that arrives
     * whole should need no repair, and if the mapper starts producing one that
     * does, this says so in the language the user would have been shown.
     */
    it("produces a recipe the card will actually take", async () => {
        expect(cardWriteProblems(mapRow(row())!.recipe)).toEqual([]);
    });

    /**
     * Tea is special-cased everywhere in this app, and all of it happens
     * inside the mapper this module delegates to: volumes clamp to 90 ml, the
     * dose falls back to 5 g and the ratio is recomputed from what survived
     * the clamp. Nothing here does any of that, which is the point -- but a
     * change that quietly stopped passing the cup type through would corrupt
     * every tea import on its way to a card, and nothing else would notice.
     */
    it("carries a tea row through its clamping intact", async () => {
        // 4, not CUP_TYPE.TEA. xBloom numbers cups 1-4 and we number them
        // 0-3, and the two orders do not even agree: their 2 is our OMNI and
        // their 3 is our OTHER. Writing our own enum into a row fixture is
        // the same mistake as reading their pattern numbers as ours.
        const tea = row() as Record<string, unknown>;
        tea.cupType = 4;
        tea.dose = 5;

        const {recipe} = mapRow(tea)!;

        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.isTea()).toBe(true);
        for (const pour of recipe.pours) {
            expect(pour.volume).toBeLessThanOrEqual(90);
        }
        // Clamping the stages changes the water, so the ratio has to follow or
        // the machine rejects the card for a sum it cannot reconcile.
        expect(cardWriteProblems(recipe)).toEqual([]);
    });

    it("carries a recipe whose grinder is off", async () => {
        // 2 is xBloom's "no grinder", and the mapper also treats a grind size
        // of 81 as off -- the two ways a row can say the same thing.
        const off = row() as Record<string, unknown>;
        off.isSetGrinderSize = 2;

        expect(mapRow(off)!.recipe.grinder).toBe(false);

        const byGrindSize = row() as Record<string, unknown>;
        byGrindSize.grinderSize = 81;
        expect(mapRow(byGrindSize)!.recipe.grinder).toBe(false);
    });

    it.each([
        ["1", 1, CUP_TYPE.XPOD],
        ["2", 2, CUP_TYPE.OMNI],
        ["3", 3, CUP_TYPE.OTHER],
        ["4", 4, CUP_TYPE.TEA],
    ])("reads xBloom's cup type %s as ours", async (_label, theirs, ours) => {
        const r = row() as Record<string, unknown>;
        r.cupType = theirs;
        expect(mapRow(r)!.recipe.cupType).toBe(ours);
    });

    /**
     * The guard is about coherence, not about what a card will take.
     *
     * A recipe ground for espresso is an ordinary account recipe that the
     * editor exists to coarsen, so it must survive the import even though it
     * cannot be written as-is. A dose of zero or less is a different thing: it
     * is a row we failed to read, and `fixRatio` turns it into a negative
     * ratio rather than refusing, so nothing downstream would catch it.
     */
    it("keeps a recipe that needs fixing before a card will take it", async () => {
        const espresso = row() as Record<string, unknown>;
        espresso.grinderSize = 12;

        const mapped = mapRow(espresso);

        expect(mapped).not.toBeNull();
        expect(mapped!.recipe.grindSize).toBe(12);
        expect(cardWriteProblems(mapped!.recipe).length).toBeGreaterThan(0);
    });

    it.each([
        ["a dose of zero", 0],
        ["a negative dose", -5],
    ])("refuses %s, which is a row we did not read", async (_label, dose) => {
        const bad = row() as Record<string, unknown>;
        bad.dose = dose;
        expect(mapRow(bad)).toBeNull();
    });
});
