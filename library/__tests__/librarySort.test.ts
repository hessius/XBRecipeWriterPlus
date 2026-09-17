import {
    SORT_AXES,
    SORT_AXIS_ORDER,
    asSortAxis,
    asSortDirection,
    chipLabel,
    defaultDirection,
    directionLabels,
    isDefaultSort,
    isSortAxis,
    isSortDirection,
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

describe("the spoken vocabulary", () => {
    it("gives every axis a spoken name and both spoken directions", () => {
        // The rail builds its accessibility labels from this table rather than
        // a map of its own, so a new axis cannot ship announcing "undefined".
        for (const axis of SORT_AXIS_ORDER) {
            const {spoken} = SORT_AXES[axis];
            expect(spoken.axis).toMatch(/\S/);
            expect(spoken.directions.asc).toMatch(/\S/);
            expect(spoken.directions.desc).toMatch(/\S/);
        }
    });

    it("says the directions as sentences, not in the chip's caps", () => {
        // The chip says "NEWEST" because Doto is a caps face. Handing that
        // string to a reader shouts an abbreviation at somebody. "Low to high"
        // is allowed to match its chip once lowercased: the caps are the only
        // thing wrong with it.
        for (const axis of SORT_AXIS_ORDER) {
            const {spoken} = SORT_AXES[axis];
            for (const direction of ["asc", "desc"] as const) {
                const word = spoken.directions[direction];
                expect(word).not.toBe(word.toLocaleUpperCase());
            }
        }
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
    // These assert on the *shape* of the fragment, not on the order real rows
    // come out in. They cannot do the latter: proving a never-brewed recipe
    // actually trails requires a database and the query builder that joins to
    // the brews aggregate, and neither exists in this task. So they pin that the
    // guard is the leading term and covers the value the join yields for a
    // never-brewed recipe -- NULL for a MAX(date), zero or NULL for a COUNT.
    // The behavioural proof, with real rows through a real ORDER BY, belongs in
    // `library/libraryQuery`'s own test. Do not fake a SQL engine here to fake
    // that proof; a string that matches the CASE it was built from proves only
    // that the string was built.
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

    it("guards times brewed against both NULL and zero, both directions", () => {
        // COUNT over a recipe with no brews is 0, not NULL, so `IS NULL` alone
        // would be a dead no-op and never-brewed recipes would lead under LEAST.
        // The COALESCE guard treats zero as never brewed too, so it holds
        // whichever shape the eventual join hands back.
        for (const direction of DIRECTIONS) {
            expect(orderByFragment("timesBrewed", direction)).toMatch(
                /^CASE WHEN COALESCE\(brewCount, 0\) = 0 THEN 1 ELSE 0 END,/
            );
            expect(orderByFragment("timesBrewed", direction)).not.toContain(
                "brewCount IS NULL"
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

describe("an unknown axis survives the read boundary", () => {
    // `Settings.get("librarySort")` is typed `string`, not `SortAxis`: the union
    // is widened away and only `typeof` is checked, so a stale row can hand back
    // "banana". These prove the narrowing readers catch that before it indexes
    // SORT_AXES, so a bad setting is a sort by name and not a crashed screen.
    it("narrows a known axis to itself and anything else to name", () => {
        for (const axis of AXES) {
            expect(asSortAxis(axis)).toBe(axis);
        }
        for (const bad of ["banana", "", "NAME", null, undefined, 3, {}]) {
            expect(asSortAxis(bad)).toBe("name");
        }
    });

    it("narrows a direction to itself and anything else to asc", () => {
        expect(asSortDirection("asc")).toBe("asc");
        expect(asSortDirection("desc")).toBe("desc");
        for (const bad of ["up", "", null, undefined, 0, {}]) {
            expect(asSortDirection(bad)).toBe("asc");
        }
    });

    it("recognises exactly the known axes and directions", () => {
        for (const axis of AXES) {
            expect(isSortAxis(axis)).toBe(true);
        }
        for (const bad of ["banana", "", null, undefined, 7]) {
            expect(isSortAxis(bad)).toBe(false);
        }
        expect(isSortDirection("asc")).toBe(true);
        expect(isSortDirection("desc")).toBe(true);
        for (const bad of ["ASC", "", null, undefined, 1]) {
            expect(isSortDirection(bad)).toBe(false);
        }
    });

    // An `in` check would answer true for every one of these, because `in`
    // walks the prototype chain. They would then be stored by the restore path
    // and index SORT_AXES to a function with no `orderBy`, which is the crash
    // the readers exist to prevent -- and a backup file is untrusted input, so
    // these are precisely the strings an attacker would reach for.
    it("does not mistake an inherited property for an axis", () => {
        for (const inherited of [
            "toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"
        ]) {
            expect(isSortAxis(inherited)).toBe(false);
            expect(asSortAxis(inherited)).toBe("name");
            expect(() => orderByFragment(inherited, "asc")).not.toThrow();
        }
    });

    it("falls orderByFragment back to name rather than throwing on an unknown axis", () => {
        const unknownAxis = "banana" as unknown as SortAxis;
        expect(() => orderByFragment(unknownAxis, "asc")).not.toThrow();
        // The name fragment, because the axis fell back to name.
        expect(orderByFragment(unknownAxis, "asc")).toBe(orderByFragment("name", "asc"));
    });

    it("falls the sibling accessors back to name on an unknown axis", () => {
        const unknownAxis = "banana" as unknown as SortAxis;
        expect(chipLabel(unknownAxis)).toBe(chipLabel("name"));
        expect(directionLabels(unknownAxis)).toEqual(directionLabels("name"));
        expect(defaultDirection(unknownAxis)).toBe(defaultDirection("name"));
    });

    it("falls orderByFragment back to ascending on an unknown direction", () => {
        const unknownDirection = "sideways" as unknown as SortDirection;
        expect(orderByFragment("ratio", unknownDirection)).toBe(orderByFragment("ratio", "asc"));
    });
});
