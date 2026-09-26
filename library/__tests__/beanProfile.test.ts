import {
    HIGHLY_RATED,
    PROFILE_CAP,
    PROFILE_FIELD_LABEL,
    PROFILE_FLOOR,
    rankProfileRows,
    type BeanProfileRow,
    type ProfileField
} from "@/library/beanProfile";

function row(
    value: string,
    brews: number,
    rated: number,
    avgRating: number,
    field: ProfileField = "process"
): BeanProfileRow {
    return {field, value, brews, rated, avgRating};
}

describe("the thresholds", () => {
    it("holds the floor at 3 rated brews", () => {
        expect(PROFILE_FLOOR).toBe(3);
    });

    it("starts highly rated at 4 stars", () => {
        expect(HIGHLY_RATED).toBe(4);
    });

    it("caps the ledger at 5 rows", () => {
        expect(PROFILE_CAP).toBe(5);
    });

    it("labels every field, including custom", () => {
        const fields: ProfileField[] =
            ["origin", "roast", "process", "fermentation", "custom"];
        for (const field of fields) {
            expect(PROFILE_FIELD_LABEL[field]).toMatch(/^[A-Z]+$/);
        }
    });
});

describe("ranking", () => {
    it("puts a row at the floor above a better-rated row below it", () => {
        // The whole point of the floor. 4.9 off two ratings does not outrank
        // 4.1 off three, because two numbers are not evidence.
        const ranked = rankProfileRows([
            row("Honey", 2, 2, 4.9),
            row("Natural", 9, 3, 4.1)
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Natural", "Honey"]);
    });

    it("counts rated brews against the floor, not counted ones", () => {
        // Eleven brews and one rating is an average of one number. It must not
        // rank, however many cups back it.
        const ranked = rankProfileRows([
            row("Light", 11, 1, 5),
            row("Washed", 3, 3, 3.2)
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Washed", "Light"]);
    });

    it("orders ranked rows by rating descending", () => {
        const ranked = rankProfileRows([
            row("Washed", 5, 5, 4.0),
            row("Co-ferment", 3, 3, 4.8),
            row("Natural", 9, 9, 4.6)
        ]);
        expect(ranked.map((r) => r.value))
            .toEqual(["Co-ferment", "Natural", "Washed"]);
    });

    it("breaks a rating tie on brews, then value, then field", () => {
        // The two Lights go in roast-first on purpose. Array.prototype.sort is
        // stable, so seeding them in the expected order would let this test
        // pass with no field comparator at all: it would be asserting V8's
        // stability rather than the rule. Reversed, only the comparator can
        // produce the expected order.
        const ranked = rankProfileRows([
            row("Light", 3, 3, 4.5, "roast"),
            row("Light", 3, 3, 4.5, "custom"),
            row("Anaerobic", 3, 3, 4.5),
            row("Natural", 7, 3, 4.5)
        ]);
        // Natural leads on brews. The other three tie on 3 brews, so value
        // decides: Anaerobic, then the two Lights, whose field decides them.
        expect(ranked.map((r) => `${r.field}:${r.value}`)).toEqual([
            "process:Natural",
            "process:Anaerobic",
            "custom:Light",
            "roast:Light"
        ]);
    });

    it("orders below-floor rows by brews then value, keeping their figures", () => {
        const ranked = rankProfileRows([
            row("Honey", 1, 1, 5),
            row("Gesha", 4, 0, 0, "origin"),
            row("Bourbon", 4, 2, 4.9, "origin")
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Bourbon", "Gesha", "Honey"]);
        expect(ranked[0].avgRating).toBe(4.9);
    });

    it("does not mutate the array it is given", () => {
        // The caller holds the database's own rows. Sorting them in place
        // would reorder somebody else's array as a side effect of rendering.
        const rows = [row("Honey", 1, 1, 5), row("Natural", 9, 3, 4.1)];
        const before = rows.map((r) => r.value);
        rankProfileRows(rows);
        expect(rows.map((r) => r.value)).toEqual(before);
    });

    it("returns an empty list unchanged", () => {
        expect(rankProfileRows([])).toEqual([]);
    });
});
