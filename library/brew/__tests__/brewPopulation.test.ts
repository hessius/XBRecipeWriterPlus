import {
    COUNTED_SQL,
    MEASURED_SQL,
    RATED_SQL,
    TIMED_SQL,
    countsAsBrewed,
    isMeasured,
    isRated,
    isTimed
} from "@/library/brew/brewPopulation";
import type {BrewOutcome} from "@/library/brew/BrewRecord";
import {createTestDatabase} from "@/test-utils/sqlite";

type Candidate = {
    id: string;
    outcome: BrewOutcome;
    watched: 0 | 1;
    pouringAt: number;
    rating: number;
};

const outcomes: BrewOutcome[] = [
    "done", "endedOnMachine", "cancelled", "lostContact", "failed"
];

function candidates(): Candidate[] {
    const rows: Candidate[] = [];
    for (const outcome of outcomes) {
        for (const watched of [0, 1] as const) {
            for (const pouringAt of [0, 123] as const) {
                for (const rating of [0, 4] as const) {
                    rows.push({
                        id: `${outcome}-${watched}-${pouringAt}-${rating}`,
                        outcome,
                        watched,
                        pouringAt,
                        rating
                    });
                }
            }
        }
    }
    return rows;
}

describe("brew population rules", () => {
    it("keeps the SQL fragments and TypeScript predicates on the same rows", () => {
        const rows = candidates();
        const db = createTestDatabase();
        db.execSync(`
            CREATE TABLE brews (
                id TEXT PRIMARY KEY NOT NULL,
                outcome TEXT NOT NULL,
                watched INTEGER NOT NULL,
                pouringAt INTEGER NOT NULL,
                rating INTEGER NOT NULL
            );
        `);
        rows.forEach((row) => {
            db.runSync(
                `INSERT INTO brews (id, outcome, watched, pouringAt, rating)
                 VALUES (?, ?, ?, ?, ?);`,
                [row.id, row.outcome, row.watched, row.pouringAt, row.rating]
            );
        });

        const selectedBy = (sql: string) =>
            db.getAllSync(`SELECT id FROM brews WHERE ${sql} ORDER BY id;`)
                .map((row) => (row as {id: string}).id);
        const expectedBy = (predicate: (row: Candidate) => boolean) =>
            rows.filter(predicate).map((row) => row.id).sort();

        expect(selectedBy(COUNTED_SQL)).toEqual(expectedBy((row) =>
            countsAsBrewed({outcome: row.outcome})));
        expect(selectedBy(MEASURED_SQL)).toEqual(expectedBy((row) =>
            isMeasured({outcome: row.outcome, watched: row.watched})));
        expect(selectedBy(TIMED_SQL)).toEqual(expectedBy((row) =>
            isTimed({
                outcome: row.outcome,
                watched: row.watched,
                pouringAt: row.pouringAt
            })));
        expect(selectedBy(RATED_SQL)).toEqual(expectedBy((row) =>
            isRated({outcome: row.outcome, rating: row.rating})));
    });

    it("spells out the population rule", () => {
        expect(countsAsBrewed({outcome: "done"})).toBe(true);
        expect(countsAsBrewed({outcome: "endedOnMachine"})).toBe(true);
        expect(countsAsBrewed({outcome: "cancelled"})).toBe(false);
        expect(countsAsBrewed({outcome: "lostContact"})).toBe(false);
        expect(countsAsBrewed({outcome: "failed"})).toBe(false);

        expect(isMeasured({outcome: "done", watched: 0})).toBe(false);
        expect(countsAsBrewed({outcome: "done"})).toBe(true);

        expect(isMeasured({outcome: "done", watched: 1})).toBe(true);
        expect(isTimed({outcome: "done", watched: 1, pouringAt: 0})).toBe(false);
    });
});
