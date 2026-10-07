import {readFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Placeholders are examples, not values.
 *
 * `palette.placeholder` sits close enough to body text that a placeholder
 * phrased as a value reads as one somebody typed. The colour has no headroom
 * left to fix that, so the words have to: an example is prefixed `e.g.`.
 *
 * Three fields are exempt and named below. Those label what the field does
 * rather than exemplify what to type, and `e.g.` would be a lie about them.
 */
const EXAMPLE_FIELDS = [
    "components/BeanNameSheet.tsx",
    "components/RenameSheet.tsx",
    "components/NameShelfSheet.tsx",
    "components/NoteSection.tsx",
    "components/BrewJudgement.tsx",
    "components/PodSection.tsx"
];

const LABEL_FIELDS = [
    "components/RailSearch.tsx",
    "components/ImportSheet.tsx",
    "components/HubFilterSheet.tsx"
];

function placeholders(file: string): string[] {
    const source = readFileSync(join(__dirname, "..", "..", file), "utf8");
    return [...source.matchAll(/placeholder=(?:"([^"]*)"|\{"([^"]*)"\})/g)]
        .map((match) => match[1] ?? match[2]);
}

describe("placeholder convention", () => {
    it.each(EXAMPLE_FIELDS)("%s phrases its placeholder as an example", (file) => {
        const found = placeholders(file);
        expect(found.length).toBeGreaterThan(0);
        found.forEach((text) => expect(text).toMatch(/^e\.g\. /));
    });

    it.each(LABEL_FIELDS)("%s is exempt and says what the field does", (file) => {
        placeholders(file).forEach((text) => expect(text).not.toMatch(/^e\.g\. /));
    });
});
