import {
    beanFilterId,
    beanFilterLabel,
    parseBeanFilterId,
    resolveBeanFilter
} from "@/library/beanFilters";
import {HIGHLY_RATED, PROFILE_FLOOR} from "@/library/beanProfile";

describe("ids round-trip", () => {
    it("builds and reads back a preset", () => {
        const id = beanFilterId({field: "process", value: "Natural", rated: false});
        expect(id).toBe("bean:process:Natural");
        expect(parseBeanFilterId(id))
            .toEqual({field: "process", value: "Natural", rated: false});
    });

    it("builds and reads back a highly-rated preset", () => {
        const id = beanFilterId({field: "process", value: "Natural", rated: true});
        expect(id).toBe("bean:rated:process:Natural");
        expect(parseBeanFilterId(id))
            .toEqual({field: "process", value: "Natural", rated: true});
    });

    it("keeps a value containing a colon whole", () => {
        // The reason the rated flag leads rather than trails. With the flag at
        // the end, this id and the tag "9" highly rated are the same string.
        const id = beanFilterId({field: "custom", value: "9:rated", rated: false});
        expect(parseBeanFilterId(id))
            .toEqual({field: "custom", value: "9:rated", rated: false});
    });

    it("keeps a value containing spaces and an apostrophe whole", () => {
        const id = beanFilterId({field: "custom", value: "dad's bag", rated: true});
        expect(parseBeanFilterId(id))
            .toEqual({field: "custom", value: "dad's bag", rated: true});
    });

    it("reads nothing out of another namespace", () => {
        expect(parseBeanFilterId("tag:mornings")).toBeNull();
        expect(parseBeanFilterId("sharedBy:Ann")).toBeNull();
        expect(parseBeanFilterId("tea")).toBeNull();
    });

    it("refuses an unknown field", () => {
        expect(parseBeanFilterId("bean:varietal:Gesha")).toBeNull();
        expect(resolveBeanFilter("bean:varietal:Gesha")).toBeNull();
    });

    it("refuses an empty value", () => {
        expect(parseBeanFilterId("bean:process:")).toBeNull();
        expect(parseBeanFilterId("bean:process")).toBeNull();
    });
});

describe("refusals", () => {
    it("refuses a preset value outside the closed vocabulary", () => {
        // `beanTags` refuses a near miss rather than repairing it, and so does
        // this: repairing one would mean deciding that "washed" is Washed.
        expect(resolveBeanFilter("bean:process:washed")).toBeNull();
        expect(resolveBeanFilter("bean:process:Wet process")).toBeNull();
        expect(resolveBeanFilter("bean:roast:Blonde")).toBeNull();
        expect(resolveBeanFilter("bean:fermentation:Wild")).toBeNull();
    });

    it("accepts every value the closed vocabulary does hold", () => {
        expect(resolveBeanFilter("bean:process:Honey")).not.toBeNull();
        expect(resolveBeanFilter("bean:roast:Dark")).not.toBeNull();
        expect(resolveBeanFilter("bean:fermentation:Carbonic maceration"))
            .not.toBeNull();
    });

    it("binds a hostile origin rather than splicing it", () => {
        const clause = resolveBeanFilter("bean:origin:'; DROP TABLE brews; --");
        expect(clause).not.toBeNull();
        expect(clause?.where).not.toContain("DROP");
        expect(clause?.params).toEqual(["'; DROP TABLE brews; --"]);
    });

    it("binds a hostile custom tag, folded, rather than splicing it", () => {
        const clause = resolveBeanFilter("bean:custom:' OR 1=1 --");
        expect(clause?.where).not.toContain("OR 1=1");
        expect(clause?.params).toEqual(["' or 1=1 --"]);
    });

    it("refuses a custom tag that folds to nothing", () => {
        expect(resolveBeanFilter("bean:custom:   ")).toBeNull();
    });
});

describe("clauses", () => {
    it("asks for a counted brew carrying the preset", () => {
        const clause = resolveBeanFilter("bean:process:Natural");
        expect(clause?.where).toContain("EXISTS");
        expect(clause?.where).toContain("b.recipeUuid = recipes.uuid");
        expect(clause?.where).toContain("b.process = ?");
        expect(clause?.where).toContain("outcome IN ('done', 'endedOnMachine')");
        expect(clause?.params).toEqual(["Natural"]);
    });

    it("joins brew_tags for a custom tag and matches the folded key", () => {
        const clause = resolveBeanFilter("bean:custom:Mornings");
        expect(clause?.where).toContain("JOIN brew_tags t ON t.brewId = b.id");
        expect(clause?.where).toContain("t.tagKey = ?");
        expect(clause?.params).toEqual(["mornings"]);
    });

    it("scopes the rating to the value and binds it twice", () => {
        // The point of the whole clause. A recipe whose Natural brews average
        // 4.4 matches even if its overall average is 3.1.
        const clause = resolveBeanFilter("bean:rated:process:Natural");
        expect(clause?.params).toEqual(["Natural", "Natural"]);
        expect(clause?.where).toContain(`>= ${PROFILE_FLOOR}`);
        expect(clause?.where).toContain(`>= ${HIGHLY_RATED}`);
        expect(clause?.where).toContain("AVG(b.rating)");
        expect(clause?.where).toContain("rating > 0");
    });

    it("binds a rated custom tag twice, folded both times", () => {
        const clause = resolveBeanFilter("bean:rated:custom:Mornings");
        expect(clause?.params).toEqual(["mornings", "mornings"]);
    });
});

describe("labels", () => {
    it("raises a preset to caps, because those are the app's words", () => {
        expect(beanFilterLabel("bean:process:Natural")).toBe("NATURAL");
    });

    it("keeps an origin's own spelling", () => {
        expect(beanFilterLabel("bean:origin:Ethiopia Guji")).toBe("Ethiopia Guji");
    });

    it("marks a highly-rated filter with a star", () => {
        expect(beanFilterLabel("bean:rated:process:Natural")).toBe("NATURAL · 4★+");
    });

    it("names nothing outside the namespace", () => {
        expect(beanFilterLabel("tea")).toBeNull();
    });
});

/* eslint-disable import/first */
import {
    asLibraryFilters,
    filterLabel,
    resolveLibraryFilter,
    STOCK_FILTERS
} from "@/library/libraryFilters";
/* eslint-enable import/first */

describe("the library's own resolver", () => {
    it("resolves a bean id", () => {
        expect(resolveLibraryFilter("bean:process:Natural")?.params)
            .toEqual(["Natural"]);
    });

    it("still resolves a stock id, a tag and an author", () => {
        expect(resolveLibraryFilter("tea")).not.toBeNull();
        expect(resolveLibraryFilter("tag:mornings")).not.toBeNull();
        expect(resolveLibraryFilter("sharedBy:Ann")).not.toBeNull();
    });

    it("refuses a bean id whose value is outside the vocabulary", () => {
        expect(resolveLibraryFilter("bean:process:washed")).toBeNull();
    });

    it("does not let stock lookup claim a refused bean id", () => {
        // The parse guard is not about today's stock list, which also refuses
        // this id. It keeps the namespace boundary ahead of the mutable
        // exported table: a polluted stock map still cannot turn a refused
        // bean value into a clause.
        const id = "bean:process:washed";
        const stock = STOCK_FILTERS as unknown as Record<
            string,
            {label: string; clause: () => {where: string}}
        >;
        stock[id] = {label: "BAD", clause: () => ({where: "1 = 1"})};
        try {
            expect(resolveLibraryFilter(id)).toBeNull();
        } finally {
            delete stock[id];
        }
    });

    it("keeps a bean id through the narrowing reader", () => {
        // Without this the reader drops every bean filter the moment one is
        // applied, leaving the library narrowed with no chip to undo it.
        expect(asLibraryFilters(["bean:process:Natural", "tea", "nonsense"]))
            .toEqual(["bean:process:Natural", "tea"]);
    });

    it("drops a bean id that cannot be parsed", () => {
        expect(asLibraryFilters(["bean:varietal:Gesha"])).toEqual([]);
    });

    it("names a bean filter on its chip", () => {
        expect(filterLabel("bean:process:Natural")).toBe("NATURAL");
        expect(filterLabel("bean:rated:custom:mornings")).toBe("mornings · 4★+");
    });

    it("still names a stock filter and a tag", () => {
        expect(filterLabel("tea")).toBe("TEA");
        expect(filterLabel("tag:Mornings")).toBe("Mornings");
    });
});
