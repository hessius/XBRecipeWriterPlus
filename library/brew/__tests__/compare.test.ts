import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample, PlanStage} from "@/library/brew/BrewRecord";
import {
    COMPARE_TIME_TOLERANCE_SECONDS,
    COMPARE_WATER_TOLERANCE_ML,
    compareAxis,
    compareBrews,
    cupGap,
    gapBand,
    hasTrace,
    planDrift,
    pourVerdict
} from "@/library/brew/compare";

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "a", recipeUuid: "r", recipeName: "Ethiopia Guji", accent: "#C86A3B",
        startedAt: 0, pouringAt: 10_000, endedAt: 150_000, outcome: "done",
        failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 0,
        hasStream: true, ...over
    };
}

describe("pourVerdict", () => {
    it("calls two undisturbed brews with matching figures the same", () => {
        expect(pourVerdict(brew(), brew({id: "b"})).verdict).toBe("same");
    });

    it("tolerates water inside the tolerance", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls water outside the tolerance a difference", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML + 1});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("4 ml");
    });

    it("tolerates a duration inside the tolerance", () => {
        const b = brew({id: "b", endedAt: 150_000 + COMPARE_TIME_TOLERANCE_SECONDS * 1000});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls a duration outside the tolerance a difference", () => {
        const late = (COMPARE_TIME_TOLERANCE_SECONDS + 3) * 1000;
        const b = brew({id: "b", endedAt: 150_000 + late});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("8 seconds");
    });

    // Same pouring duration, very different total: one brew ground for a
    // minute longer. Grinding is not pouring, so the pours are the same.
    it("measures duration from the first drop, not from waking", () => {
        const a = brew({startedAt: 0, pouringAt: 10_000, endedAt: 150_000});
        const b = brew({id: "b", startedAt: 0, pouringAt: 70_000, endedAt: 210_000});
        expect(pourVerdict(a, b).verdict).toBe("same");
    });

    it("refuses to compare a brew logged by hand", () => {
        const logged = brew({
            id: "b", watched: false, waterTotal: 0, cupTotal: 0, endedAt: 0
        });
        const {verdict, why} = pourVerdict(brew(), logged);
        expect(verdict).toBe("unwatched");
        expect(why).toContain("by hand");
    });

    it("does not read an unwatched brew's zeroes as a difference", () => {
        const logged = brew({id: "b", watched: false, waterTotal: 0, cupTotal: 0});
        expect(pourVerdict(brew(), logged).verdict).not.toBe("differed");
    });

    it("puts an unfinished brew ahead of an unwatched one", () => {
        const cancelled = brew({outcome: "cancelled"});
        const logged = brew({id: "b", watched: false});
        expect(pourVerdict(cancelled, logged).verdict).toBe("incomplete");
    });

    it("puts a stall ahead of a difference in the totals", () => {
        const b = brew({
            id: "b", waterTotal: 100, stalls: [[], [{atMl: 180, seconds: 12}]]
        });
        expect(pourVerdict(brew(), b).verdict).toBe("stalled");
    });

    it("names a stall rather than calling it a difference", () => {
        const b = brew({id: "b", stalls: [[], [{atMl: 180, seconds: 12}]]});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("stalled");
        expect(why).toContain("stalled");
    });

    it("puts an unfinished brew ahead of a stall", () => {
        const b = brew({
            id: "b", outcome: "cancelled", stalls: [[{atMl: 40, seconds: 9}]]
        });
        expect(pourVerdict(brew(), b).verdict).toBe("incomplete");
    });

    it("counts a brew ended on the machine as a finished one", () => {
        expect(pourVerdict(brew(), brew({id: "b", outcome: "endedOnMachine"})).verdict)
            .toBe("same");
    });

    it("falls back to startedAt on a row written before pouringAt existed", () => {
        const a = brew({pouringAt: undefined, startedAt: 10_000, endedAt: 150_000});
        expect(pourVerdict(a, brew({id: "b"})).verdict).toBe("same");
    });
});

function stage(over: Partial<PlanStage> = {}): PlanStage {
    return {
        pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
        agitation: 0, pourPattern: 0, pauseTime: 20, ...over
    };
}

describe("planDrift", () => {
    it("grades two identical plans as no drift", () => {
        expect(planDrift([stage()], [stage()])).toEqual({grade: "none", fields: []});
    });

    it.each([
        ["volume", {volume: 60}],
        ["flowRate", {flowRate: 32}],
        ["pauseTime", {pauseTime: 5}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as shape drift, because it moves the line",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("shape");
            expect(drift.fields).toContain(field);
        }
    );

    it.each([
        ["temperature", {temperature: 88}],
        ["pourPattern", {pourPattern: 1}],
        ["agitation", {agitation: 3}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as detail drift, because the line is unmoved",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("detail");
            expect(drift.fields).toContain(field);
        }
    );

    it("grades a different stage count as shape drift", () => {
        const drift = planDrift([stage()], [stage(), stage({pourNumber: 2})]);
        expect(drift.grade).toBe("shape");
        expect(drift.fields).toContain("stages");
    });

    it("lets shape outrank detail when both changed", () => {
        expect(planDrift([stage()], [stage({volume: 60, temperature: 88})]).grade)
            .toBe("shape");
    });

    // Rows written before `plan` existed have nothing to disagree with, so an
    // absence must not be graded as a difference.
    it("reports no drift when a brew carries no plan at all", () => {
        expect(planDrift(undefined, [stage()])).toEqual({grade: "none", fields: []});
        expect(planDrift([stage()], undefined)).toEqual({grade: "none", fields: []});
    });

    it("grades legacy zero-default plan fields the same way the line is drawn", () => {
        const legacy = {
            ...stage(), flowRate: undefined, pauseTime: undefined
        } as unknown as PlanStage;
        const current = stage({flowRate: 0, pauseTime: 0});

        expect(planDrift([legacy], [current])).toEqual({grade: "none", fields: []});
    });
});

function stream(...rows: [number, number][]): BrewSample[] {
    return rows.map(([at, cup]) => ({at: at * 1000, water: 0, cup, pour: 1}));
}

describe("cupGap", () => {
    it("is empty when either stream is missing", () => {
        expect(cupGap(stream([0, 0], [10, 50]), [])).toEqual([]);
        expect(cupGap([], stream([0, 0], [10, 50]))).toEqual([]);
    });

    it("is empty when a stream has only one sample, which draws nothing", () => {
        expect(cupGap(stream([0, 0]), stream([0, 0], [10, 50]))).toEqual([]);
    });

    it("subtracts the reference from the subject, second by second", () => {
        const gap = cupGap(stream([0, 0], [10, 100]), stream([0, 0], [10, 50]));
        expect(gap[0]).toEqual({t: 0, v: 0});
        expect(gap[5]).toEqual({t: 5, v: 25});
        expect(gap[10]).toEqual({t: 10, v: 50});
    });

    // Both streams describe the same climb at different sample rates, so a
    // correct interpolation reads zero throughout. The length is asserted too:
    // an empty array satisfies `every` without interpolating anything.
    it("interpolates across different sample rates", () => {
        const gap = cupGap(
            stream([0, 0], [2, 20], [4, 40], [6, 60]),
            stream([0, 0], [6, 60])
        );
        expect(gap).toHaveLength(7);
        expect(gap.every((point) => point.v === 0)).toBe(true);
    });

    // The same rates, different climbs: a symmetric mistake that survives the
    // test above cannot survive this one.
    it("reads the gap between two different climbs", () => {
        const gap = cupGap(
            stream([0, 0], [2, 20], [4, 40], [6, 60]),
            stream([0, 0], [6, 30])
        );
        expect(gap[2]).toEqual({t: 2, v: 10});
        expect(gap[6]).toEqual({t: 6, v: 30});
    });

    it("rounds the gap to a tenth of a millilitre", () => {
        const gap = cupGap(stream([0, 0], [3, 1]), stream([0, 0], [3, 0]));
        expect(gap[1]).toEqual({t: 1, v: 0.3});
    });

    it("stops where the shorter stream stops", () => {
        const gap = cupGap(stream([0, 0], [20, 200]), stream([0, 0], [8, 80]));
        expect(gap[gap.length - 1].t).toBe(8);
    });
});

describe("gapBand", () => {
    it("returns a closed polygon leg out on subject and back on reference", () => {
        const band = gapBand(
            [{t: 0, v: 0}, {t: 5, v: 50}, {t: 12, v: 120}],
            [{t: 0, v: 0}, {t: 4, v: 24}, {t: 8, v: 40}]
        );

        expect(band).toEqual([
            {t: 0, v: 0},
            {t: 5, v: 50},
            {t: 8, v: 80},
            {t: 8, v: 40},
            {t: 4, v: 24},
            {t: 0, v: 0}
        ]);
    });

    it("uses only the common watched extent", () => {
        const band = gapBand(
            [{t: 0, v: 0}, {t: 10, v: 100}, {t: 20, v: 200}],
            [{t: 0, v: 0}, {t: 8, v: 40}]
        );

        expect(band).toHaveLength(4);
        expect(band.map((point) => point.t)).toEqual([0, 8, 8, 0]);
        expect(Math.max(...band.map((point) => point.t))).toBe(8);
    });

    it("is empty when either curve cannot draw a line", () => {
        expect(gapBand([{t: 0, v: 0}], [{t: 0, v: 0}, {t: 1, v: 1}])).toEqual([]);
        expect(gapBand([{t: 0, v: 0}, {t: 1, v: 1}], [])).toEqual([]);
    });
});

describe("compareAxis", () => {
    function rateStream(rate: number, pour = 1): BrewSample[] {
        return Array.from({length: 21}, (_, i) => {
            const seconds = i / 10;
            return {
                at: i * 100,
                water: rate * seconds,
                cup: rate * seconds,
                pour
            };
        });
    }

    function underRate(rate: number, over: Partial<StoredBrew> = {}) {
        return {
            record: brew({pours: 1, ...over}),
            samples: rateStream(rate)
        };
    }

    it("uses one shared scale for both streams and both plans", () => {
        const axis = compareAxis(
            {
                record: brew({
                    plan: [
                        stage({volume: 40, flowRate: 40, pauseTime: 10}),
                        stage({pourNumber: 2, volume: 60, flowRate: 30, pauseTime: 0})
                    ],
                    waterTotal: 100
                }),
                samples: [
                    {at: 0, water: 0, cup: 0, pour: 1},
                    {at: 70_000, water: 100, cup: 90, pour: 2}
                ]
            },
            {
                record: brew({
                    id: "b",
                    plan: [stage({volume: 250, flowRate: 50, pauseTime: 0})],
                    waterTotal: 250
                }),
                samples: [
                    {at: 0, water: 0, cup: 0, pour: 1},
                    {at: 40_000, water: 250, cup: 230, pour: 1}
                ]
            }
        );

        expect(axis.maxT).toBe(70);
        expect(axis.maxV).toBe(250);
        expect(axis.subjectPours).toHaveLength(2);
        expect(axis.referencePours).toHaveLength(1);
    });

    it("negotiates one rate axis across both brews", () => {
        const axis = compareAxis(
            underRate(2),
            underRate(5, {id: "b"})
        );

        expect(axis.maxRate).toBeCloseTo(5, 6);
        expect(axis.subjectRate).toHaveLength(20);
        expect(axis.referenceRate).toHaveLength(20);
    });

    it("excludes bypass samples with the brew's stage count", () => {
        const brewed = underRate(2);
        const bypass = rateStream(25, 2);
        const axis = compareAxis(
            {
                record: brew({pours: 1}),
                samples: [...brewed.samples, ...bypass]
            },
            underRate(3, {id: "b"})
        );

        expect(axis.maxRate).toBeCloseTo(3, 6);
        expect(axis.subjectRate.every((point) => point.cup < 3)).toBe(true);
    });

    it("has a rate axis of 0 when neither brew kept its stream", () => {
        const axis = compareAxis(
            underRate(2, {hasStream: false}),
            underRate(5, {id: "b", hasStream: false})
        );

        expect(axis.maxRate).toBe(0);
        expect(axis.subjectRate).toEqual([]);
        expect(axis.referenceRate).toEqual([]);
    });

    it("keeps a retained short stream out of the drawable rate series", () => {
        const axis = compareAxis(
            underRate(2),
            {
                record: brew({id: "b", pours: 1}),
                samples: [
                    {at: 0, water: 0, cup: 0, pour: 1},
                    {at: 100, water: 0.5, cup: 0.5, pour: 1},
                    {at: 200, water: 1, cup: 1, pour: 1}
                ]
            }
        );

        expect(axis.subjectRate.length).toBeGreaterThanOrEqual(2);
        expect(axis.referenceRate).toEqual([]);
    });
});

describe("hasTrace", () => {
    it("requires enough retained samples to draw a line", () => {
        const record = brew({hasStream: true});
        expect(hasTrace({record, samples: [{at: 0, water: 0, cup: 0, pour: 1}]}))
            .toBe(false);
        expect(hasTrace({
            record,
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 1_000, water: 10, cup: 8, pour: 1}
            ]
        })).toBe(true);
    });
});

describe("compareBrews", () => {
    it("keeps a shared value once and marks it", () => {
        const c = compareBrews(
            {record: brew({grindSize: 58, dose: 18}), samples: []},
            {record: brew({id: "b", grindSize: 62, dose: 18}), samples: []}
        );
        const dose = c.rows.find((row) => row.label === "DOSE");
        const grind = c.rows.find((row) => row.label === "GRIND");
        expect(dose).toEqual({label: "DOSE", a: "18 g", b: "18 g", shared: true});
        expect(grind).toEqual({label: "GRIND", a: "58", b: "62", shared: false});
    });

    it("omits a row neither brew recorded", () => {
        const c = compareBrews(
            {record: brew(), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "GRIND")).toBeUndefined();
    });

    it("keeps a row only one brew recorded, and says the other is unknown", () => {
        const c = compareBrews(
            {record: brew({grindSize: 58}), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "GRIND"))
            .toEqual({label: "GRIND", a: "58", b: "not recorded", shared: false});
    });

    it("puts the drawdown beside the figures it is read against", () => {
        // The fixture is zeroed at 10 s and ends at 150 s, so a bed left to
        // finish at 110 s drew down for 30 and one left at 120 s for 20. Two
        // brews of one recipe with the same water and different drawdowns is
        // the comparison this table exists to make.
        const c = compareBrews(
            {record: brew({drawdownAt: 110_000}), samples: []},
            {record: brew({id: "b", drawdownAt: 120_000}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "DRAWDOWN"))
            .toEqual({label: "DRAWDOWN", a: "30 s", b: "20 s", shared: false});
    });

    it("omits the drawdown when neither brew measured one", () => {
        // Two records from before the boundary was kept, or two interrupted
        // brews. An empty row would say the drawdown was compared and found
        // equal, which is the one thing that did not happen.
        const c = compareBrews(
            {record: brew(), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "DRAWDOWN")).toBeUndefined();
    });

    it("includes fermentation with the other bean descriptors", () => {
        const c = compareBrews(
            {record: brew({fermentation: "Anaerobic"}), samples: []},
            {record: brew({id: "b", fermentation: "Lactic"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "FERMENT"))
            .toEqual({label: "FERMENT", a: "Anaerobic", b: "Lactic", shared: false});
    });

    it("resolves pod origin and process when the brew has no user bean values", () => {
        const c = compareBrews(
            {
                record: brew({
                    coffee: {
                        name: "House pod",
                        origin: "Huila",
                        processing: "Washed"
                    }
                }),
                samples: []
            },
            {
                record: brew({
                    id: "b",
                    coffee: {
                        name: "House pod",
                        origin: "Huila",
                        processing: "Washed"
                    }
                }),
                samples: []
            }
        );

        expect(c.rows.find((row) => row.label === "ORIGIN"))
            .toEqual({label: "ORIGIN", a: "Huila", b: "Huila", shared: true});
        expect(c.rows.find((row) => row.label === "PROCESS"))
            .toEqual({label: "PROCESS", a: "Washed", b: "Washed", shared: true});
    });

    it("does not split matching drawn plans over legacy zero-default fields", () => {
        const legacy = {
            ...stage(), flowRate: undefined, pauseTime: undefined
        } as unknown as PlanStage;
        const c = compareBrews(
            {record: brew({plan: [legacy]}), samples: []},
            {record: brew({id: "b", plan: [stage({flowRate: 0, pauseTime: 0})]}), samples: []}
        );

        expect(c.drift).toEqual({grade: "none", fields: []});
    });

    it("words the outcome, rather than showing the stored value", () => {
        const c = compareBrews(
            {record: brew({outcome: "endedOnMachine"}), samples: []},
            {record: brew({id: "b", outcome: "cancelled"}), samples: []}
        );
        const outcome = c.rows.find((row) => row.label === "OUTCOME");
        expect(outcome?.a).toBe("ended on the machine");
        expect(outcome?.b).toBe("cancelled");
    });

    it("times the pour from the first drop, and says so in the label", () => {
        const c = compareBrews(
            {record: brew({startedAt: 0, pouringAt: 10_000, endedAt: 150_000}), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "TIME")).toBeUndefined();
        expect(c.rows.find((row) => row.label === "POUR")?.a).toBe("2:20");
    });

    it("leaves a hand logged brew's machine figures unrecorded, not zero", () => {
        const c = compareBrews(
            {record: brew(), samples: []},
            {
                record: brew({
                    id: "b", watched: false, waterTotal: 0, cupTotal: 0, endedAt: 0
                }),
                samples: []
            }
        );
        for (const label of ["POUR", "WATER", "CUP"]) {
            expect(c.rows.find((row) => row.label === label)?.b).toBe("not recorded");
        }
        expect(c.rows.find((row) => row.label === "WATER")?.a).toBe("250 ml");
    });

    // The cup is weighed, not measured. WATER sits directly above it and is
    // genuinely millilitres, so the two rows must not share a unit.
    it("weighs the cup in grams, the way the rest of the app does", () => {
        const c = compareBrews(
            {record: brew({cupTotal: 244}), samples: []},
            {record: brew({id: "b", cupTotal: 231}), samples: []}
        );
        const cup = c.rows.find((row) => row.label === "CUP");
        expect(cup?.a).toBe("244 g");
        expect(cup?.b).toBe("231 g");
    });

    it("still compares what a hand logged brew does know", () => {
        const c = compareBrews(
            {record: brew({rating: 4}), samples: []},
            {record: brew({id: "b", watched: false, rating: 4}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "RATING"))
            .toEqual({label: "RATING", a: "4 of 5", b: "4 of 5", shared: true});
    });

    // Shared means the two brews read the same, not that they are the same to
    // the last decimal: a row the user cannot see a difference in is a row
    // they should not be asked to read twice.
    it("shares a row whose values differ only below what is shown", () => {
        const c = compareBrews(
            {record: brew({waterTotal: 250.4}), samples: []},
            {record: brew({id: "b", waterTotal: 249.6}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "WATER"))
            .toEqual({label: "WATER", a: "250 ml", b: "250 ml", shared: true});
    });

    it("carries the verdict, the drift and the gap", () => {
        const c = compareBrews(
            {record: brew(), samples: stream([0, 0], [10, 100])},
            {record: brew({id: "b"}), samples: stream([0, 0], [10, 50])}
        );
        expect(c.pour.verdict).toBe("same");
        expect(c.drift.grade).toBe("none");
        expect(c.cupGap.length).toBeGreaterThan(0);
        expect(c.subject.id).toBe("a");
        expect(c.reference.id).toBe("b");
    });
});

describe("compareAxis pause intervals", () => {
    const stream = (lastAt: number): BrewSample[] => [
        {at: 0, water: 0, cup: 0, pour: 1},
        {at: lastAt, water: 100, cup: 90, pour: 1}
    ];
    const early = [{from: 10_000, to: 20_000, pour: 1, reason: "overflow" as const}];
    const late = [
        {from: 30_000, to: 45_000, pour: 1, reason: "manual" as const},
        {from: 60_000, to: 95_000, pour: 1, reason: "overflow" as const}
    ];

    it("gives each lane its own intervals and spans both extents", () => {
        const axis = compareAxis(
            {record: brew({pauseIntervals: early}), samples: stream(40_000)},
            {record: brew({id: "b", pauseIntervals: late}), samples: stream(50_000)}
        );

        expect(axis.maxT).toBe(95);
        expect(axis.subjectPauses).toEqual(early);
        expect(axis.referencePauses).toEqual(late);
    });

    it("lets the other lane's pause stretch the axis without appearing on this lane", () => {
        const axis = compareAxis(
            {record: brew(), samples: stream(40_000)},
            {record: brew({id: "b", pauseIntervals: late}), samples: stream(50_000)}
        );

        expect(axis.maxT).toBe(95);
        expect(axis.subjectPauses).toEqual([]);
    });

    it("does not let a record with no stream stretch the axis or carry a band", () => {
        const swept = brew({id: "b", hasStream: false, pauseIntervals: late});
        const axis = compareAxis(
            {record: brew(), samples: stream(40_000)},
            {record: swept, samples: []}
        );

        expect(axis.maxT).toBe(40);
        expect(axis.referencePauses).toEqual([]);
        expect(swept.pauseIntervals).toEqual(late);
    });
});
