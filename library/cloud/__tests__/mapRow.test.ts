import {cardWriteProblems} from "@/library/cardLimits";
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
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
        const recipe = mapRow(row())!;
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
        expect(mapRow(row())!.name).toBe("Kenya Nyeri");
    });

    it("reads the grinder settings", async () => {
        const recipe = mapRow(row())!;
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
        expect(cardWriteProblems(mapRow(row())!)).toEqual([]);
    });
});
