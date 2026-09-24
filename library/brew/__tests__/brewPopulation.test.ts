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
import {ensureBrewTables} from "@/library/BrewDatabase";
import {createTestDatabase} from "@/test-utils/sqlite";

type Candidate = {
    id: string;
    recipeUuid: string;
    outcome: BrewOutcome;
    watched: 0 | 1;
    pouringAt: number;
    rating: number;
};

const targetRecipe = "target-recipe";

const outcomes: BrewOutcome[] = [
    "done", "endedOnMachine", "cancelled", "lostContact", "failed"
];

function candidates(): Candidate[] {
    const rows: Candidate[] = [];
    let index = 0;
    for (const outcome of outcomes) {
        for (const watched of [0, 1] as const) {
            for (const pouringAt of [0, 123] as const) {
                for (const rating of [0, 4] as const) {
                    rows.push({
                        id: `${outcome}-${watched}-${pouringAt}-${rating}`,
                        recipeUuid: index % 2 === 0 ? targetRecipe : "other-recipe",
                        outcome,
                        watched,
                        pouringAt,
                        rating
                    });
                    index += 1;
                }
            }
        }
    }
    return rows;
}

type Predicate = (row: Candidate) => boolean;

function insertCandidates(rows: Candidate[]): ReturnType<typeof createTestDatabase> {
    const db = createTestDatabase();
    ensureBrewTables(db as Parameters<typeof ensureBrewTables>[0]);
    rows.forEach((row, index) => {
        db.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                outcome, failure, pours, waterTotal, cupTotal, heldSeconds,
                rating, watched, hasStream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                row.id, row.recipeUuid, "Fixture", "#000000", 1_000 + index,
                row.pouringAt, 2_000 + index, row.outcome, null, 1, 1, 1, 0,
                row.rating, row.watched, 0
            ]
        );
    });
    return db;
}

function expectedIds(rows: Candidate[], predicate: Predicate): string[] {
    return rows.filter(predicate).map((row) => row.id).sort();
}

describe("brew population rules", () => {
    it("keeps the SQL fragments and TypeScript predicates on the same rows", () => {
        const rows = candidates();
        const db = insertCandidates(rows);

        const selectedWhere = (sql: string) =>
            db.getAllSync(`SELECT id FROM brews WHERE ${sql} ORDER BY id;`)
                .map((row) => (row as {id: string}).id);
        const selectedByAggregate = (sql: string) =>
            db.getAllSync(`
                SELECT id, SUM(CASE WHEN ${sql} THEN 1 ELSE 0 END) AS admitted
                FROM brews
                GROUP BY id
                HAVING admitted > 0
                ORDER BY id;
            `).map((row) => (row as {id: string}).id);
        const selectedByAggregateWithCondition = (sql: string) =>
            db.getAllSync(`
                SELECT id,
                       SUM(CASE WHEN ${sql} AND recipeUuid = '${targetRecipe}'
                           THEN 1 ELSE 0 END) AS admitted
                FROM brews
                GROUP BY id
                HAVING admitted > 0
                ORDER BY id;
            `).map((row) => (row as {id: string}).id);
        const selectedByNot = (sql: string) =>
            db.getAllSync(`SELECT id FROM brews WHERE NOT (${sql}) ORDER BY id;`)
                .map((row) => (row as {id: string}).id);

        const fragments: [string, Predicate][] = [
            [COUNTED_SQL, (row) => countsAsBrewed({outcome: row.outcome})],
            [MEASURED_SQL, (row) => isMeasured({
                outcome: row.outcome,
                watched: row.watched
            })],
            [TIMED_SQL, (row) => isTimed({
                outcome: row.outcome,
                watched: row.watched,
                pouringAt: row.pouringAt
            })],
            [RATED_SQL, (row) => isRated({outcome: row.outcome, rating: row.rating})]
        ];

        for (const [sql, predicate] of fragments) {
            expect(selectedWhere(sql)).toEqual(expectedIds(rows, predicate));
            expect(selectedByAggregate(sql)).toEqual(expectedIds(rows, predicate));
            expect(selectedByAggregateWithCondition(sql)).toEqual(expectedIds(
                rows, (row) => predicate(row) && row.recipeUuid === targetRecipe
            ));
            expect(selectedByNot(sql)).toEqual(expectedIds(rows, (row) => !predicate(row)));
        }
    });

    it("keeps each SQL fragment parenthesized as one spliceable term", () => {
        for (const sql of [COUNTED_SQL, MEASURED_SQL, TIMED_SQL, RATED_SQL]) {
            expect(sql.startsWith("(")).toBe(true);
            expect(sql.endsWith(")")).toBe(true);
        }
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
        expect(isMeasured({outcome: "done"})).toBe(true);
        expect(isTimed({outcome: "done", watched: 1, pouringAt: 0})).toBe(false);
        expect(isTimed({outcome: "done", watched: 1})).toBe(false);
        expect(isRated({outcome: "done", rating: 4})).toBe(true);
        expect(isRated({outcome: "done"})).toBe(false);
        expect(isRated({outcome: "cancelled", rating: 4})).toBe(false);
    });
});
