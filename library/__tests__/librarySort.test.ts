import {
    SORT_AXES,
    SORT_AXIS_ORDER,
    chipLabel,
    defaultDirection,
    directionLabels,
    isDefaultSort,
    orderByFragment,
    type SortAxis,
    type SortDirection
} from "@/library/librarySort";

const AXES: SortAxis[] = ["name", "added", "lastBrewed", "timesBrewed", "ratio"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];

// The shared tie break every non-name axis ends with. Kept here as its own
// literal so a test fails if the two strings drift apart, which is the whole
// point of asserting on it.
const NAME_UUID_TIE = "sortName COLLATE NOCASE ASC, uuid ASC";

describe("the vocabulary", () => {
    it("offers exactly the five axes, and no Rating yet", () => {
        // Rating waits for #99; until then it would sort nothing. Pinned so
        // adding it is a deliberate change to this expectation, not a surprise.
        expect(Object.keys(SORT_AXES).sort()).toEqual(
            ["added", "lastBrewed", "name", "ratio", "timesBrewed"]
        );
        expect(SORT_AXIS_ORDER).toEqual(
            ["name", "added", "lastBrewed", "timesBrewed", "ratio"]
        );
    });

    it("labels each chip in Doto caps from the design table", () => {
        expect(chipLabel("name")).toBe("NAME");
        expect(chipLabel("added")).toBe("ADDED");
        expect(chipLabel("lastBrewed")).toBe("LAST BREWED");
        expect(chipLabel("timesBrewed")).toBe("TIMES BREWED");
        expect(chipLabel("ratio")).toBe("RATIO");
    });

    it("words each direction verbatim from the design table", () => {
        expect(directionLabels("name")).toEqual({asc: "A TO Z", desc: "Z TO A"});
        expect(directionLabels("added")).toEqual({asc: "OLDEST", desc: "NEWEST"});
        expect(directionLabels("lastBrewed")).toEqual({asc: "LONGEST AGO", desc: "RECENT"});
        expect(directionLabels("timesBrewed")).toEqual({asc: "LEAST", desc: "MOST"});
        expect(directionLabels("ratio")).toEqual({asc: "LOW TO HIGH", desc: "HIGH TO LOW"});
    });

    it("defaults each axis to its useful-on-first-tap direction", () => {
        expect(defaultDirection("name")).toBe("asc");
        expect(defaultDirection("added")).toBe("desc");
        expect(defaultDirection("lastBrewed")).toBe("desc");
        expect(defaultDirection("timesBrewed")).toBe("desc");
        expect(defaultDirection("ratio")).toBe("asc");
    });
});

describe("isDefaultSort", () => {
    it("is true only for name ascending", () => {
        expect(isDefaultSort("name", "asc")).toBe(true);
        expect(isDefaultSort("name", "desc")).toBe(false);
        for (const axis of AXES.filter((a) => a !== "name")) {
            for (const direction of DIRECTIONS) {
                expect(isDefaultSort(axis, direction)).toBe(false);
            }
        }
    });
});

describe("a sort never hides a recipe", () => {
    it("puts a never-brewed recipe last under last brewed, both directions", () => {
        // Deliberately last, not last by accident of NULL ordering: the CASE is
        // the first term and is identical for RECENT and LONGEST AGO, so a
        // library opened at LONGEST AGO does not lead with recipes nobody brewed.
        for (const direction of DIRECTIONS) {
            expect(orderByFragment("lastBrewed", direction)).toMatch(
                /^CASE WHEN lastBrewedAt IS NULL THEN 1 ELSE 0 END,/
            );
        }
        expect(orderByFragment("lastBrewed", "desc")).toContain("lastBrewedAt DESC");
        expect(orderByFragment("lastBrewed", "asc")).toContain("lastBrewedAt ASC");
    });

    it("puts a never-brewed recipe last under times brewed, both directions", () => {
        for (const direction of DIRECTIONS) {
            expect(orderByFragment("timesBrewed", direction)).toMatch(
                /^CASE WHEN brewCount IS NULL THEN 1 ELSE 0 END,/
            );
        }
        expect(orderByFragment("timesBrewed", "desc")).toContain("brewCount DESC");
        expect(orderByFragment("timesBrewed", "asc")).toContain("brewCount ASC");
    });
});

describe("ties never reshuffle between launches", () => {
    it("falls every non-name axis back to name then uuid", () => {
        for (const axis of AXES.filter((a) => a !== "name")) {
            for (const direction of DIRECTIONS) {
                expect(orderByFragment(axis, direction).endsWith(NAME_UUID_TIE)).toBe(true);
            }
        }
    });

    it("falls name back to uuid, and puts unnamed recipes last", () => {
        for (const direction of DIRECTIONS) {
            const fragment = orderByFragment("name", direction);
            expect(fragment.endsWith("uuid ASC")).toBe(true);
            expect(fragment).toContain("sortName");
            // Unnamed recipes (NULL sortName) are pushed to the end deliberately,
            // in both directions, rather than led with as SQLite would by default.
            expect(fragment.startsWith("sortName IS NULL")).toBe(true);
        }
    });

    it("directs the name term itself, not just the tie break", () => {
        expect(orderByFragment("name", "asc")).toContain("sortName COLLATE NOCASE ASC");
        expect(orderByFragment("name", "desc")).toContain("sortName COLLATE NOCASE DESC");
    });
});
