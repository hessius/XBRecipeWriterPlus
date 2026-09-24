import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {PixelRatio, processColor, StyleSheet} from "react-native";
import type {ReactTestRendererJSON} from "react-test-renderer";

import BrewTrace from "@/components/BrewTrace";
import {drawnFontSize} from "@/components/DotMatrixText";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {BAND_FLOOR, BAND_TOP} from "@/library/brew/tempBand";
import Pour from "@/library/Pour";
import {accents, cupLineFor, palette} from "@/constants/colors";

import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
const fourPours = [
    new Pour(1, 40, 93, 40, 0, 0, 20),
    new Pour(2, 60, 92, 40, 0, 0, 0),
    new Pour(3, 50, 92, 40, 0, 0, 0),
    new Pour(4, 50, 92, 40, 0, 0, 0),
];

function samples(...rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at, water, cup, pour: 1}));
}

async function draw(props: Partial<React.ComponentProps<typeof BrewTrace>> = {}) {
    return renderWithProviders(
        <BrewTrace
            pours={pours}
            samples={[]}
            accent={TEST_ACCENT}
            width={300}
            height={140}
            plannedSeconds={70}
            {...props}
        />
    );
}

function renderedNodes(
    node: ReactTestRendererJSON | ReactTestRendererJSON[] | null
): ReactTestRendererJSON[] {
    if (node === null) return [];
    if (Array.isArray(node)) return node.flatMap(renderedNodes);
    return [
        node,
        ...(node.children ?? []).flatMap((child) =>
            typeof child === "string" ? [] : renderedNodes(child)
        )
    ];
}

function svgTextContent(node: {props: {children?: unknown}}): string | undefined {
    const child = node.props.children;
    if (typeof child === "string") return child;
    if (React.isValidElement<{children?: string}>(child)) return child.props.children;
    return undefined;
}

function svgScalar(value: number | number[]): number {
    return Array.isArray(value) ? value[0] : value;
}

function expectRuleLabelAttached(
    rule: {props: Record<string, unknown>},
    label: {props: Record<string, unknown>}
) {
    expect(typeof rule.props.y1).toBe("number");
    const ruleY = rule.props.y1 as number;
    const labelY = svgScalar(label.props.y as number | number[]);
    expect(ruleY - labelY).toBeCloseTo(4, 1);
}

function expectTempLabelStyle(label: {props: Record<string, unknown>}) {
    expect(label.props.fill).toEqual(
        expect.objectContaining({payload: processColor(palette.dim)})
    );
    expect(label.props.font).toEqual(
        expect.objectContaining({fontFamily: "Doto-Bold"})
    );
}

describe("BrewTrace", () => {
    it("draws the plan dashed", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeTruthy();
    });

    it("draws no live line before any water has moved", async () => {
        // An empty path attribute and a path of one point both render as
        // artefacts. Before the first sample there is simply no line.
        const {queryByTestId} = await draw();
        expect(queryByTestId("trace-water")).toBeNull();
        expect(queryByTestId("trace-cup")).toBeNull();
    });

    it("draws the water line in the accent", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        expect(getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(TEST_ACCENT)})
        );
    });

    it("draws the cup line dotted and beneath", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        const cup = getByTestId("trace-cup");
        expect(cup.props.strokeDasharray).toBeTruthy();
        // Same x, lower value, so a larger y. Screen coordinates run downward.
        const lastY = (path: string) => Number(path.split(" ").pop());
        expect(lastY(cup.props.d)).toBeGreaterThan(lastY(getByTestId("trace-water").props.d));
    });

    it("keeps the axis at the plan while the brew is on time", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [70_000, 200, 190])});
        // The plan fills the full width: nothing overran it.
        expect(getByTestId("trace-plan").props.d).toContain("300");
    });

    it("stretches the axis when the brew overran, and labels the gap", async () => {
        const {getByText} = await draw({samples: samples([0, 0, 0], [84_000, 200, 190])});
        expect(getByText("+14 S")).toBeTruthy();
    });

    it("says nothing about a gap the user cannot see", async () => {
        // A second of overrun is a rounding artefact, not a hold.
        const {queryByText} = await draw({samples: samples([0, 0, 0], [71_000, 200, 190])});
        expect(queryByText("+1 S")).toBeNull();
    });

    it("turns the water line amber while the machine is holding", async () => {
        const {getByTestId} = await draw({
            samples: samples([0, 0, 0], [5000, 20, 12]),
            holding: true
        });
        expect(getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(palette.warn)})
        );
    });

    it("survives a recipe with no pours", async () => {
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-plan")).toBeNull();
    });

    it("compact draws the chart and nothing else", async () => {
        const {queryByText, getByTestId} = await draw({
            compact: true,
            samples: samples([0, 0, 0], [84_000, 200, 190]),
            plannedSeconds: 70,
        });
        // The overrun label must not appear in compact mode.
        expect(queryByText("+14 S")).toBeNull();
        // The chart itself must still render.
        expect(getByTestId("trace-water")).toBeTruthy();
    });

    it("a plan of no seconds cannot be overrun", async () => {
        const {queryByText} = await draw({
            pours: [],
            plannedSeconds: 0,
            samples: samples([0, 0, 0], [10_000, 50, 40]),
        });
        // Overrun label must not appear when there is no plan.
        expect(queryByText(/^\+/)).toBeNull();
    });

    it("gives the overrun label a row tall enough to hold it", async () => {
        // A 16 pt row cropped the descenders off "+96 S" on a real brew. Doto's
        // line box is about 1.35em, so twelve-point text needs seventeen — and
        // more again for a user with text sizing turned up, which is why the
        // row measures the size the glyphs are *drawn* at rather than the size
        // it asked for.
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [84_000, 200, 190])});
        const row = StyleSheet.flatten(getByTestId("trace-overrun-row").props.style);
        expect(row.height).toBeGreaterThanOrEqual(drawnFontSize(12) * 1.35);
    });

    it("gives the legend a row tall enough to hold it", async () => {
        // The legend asks for nine point, but DotMatrixText will not draw Doto
        // below eleven, so a row sized from the nine crops it.
        const {getByTestId} = await draw({});
        const row = StyleSheet.flatten(getByTestId("trace-legend-row").props.style);
        expect(row.height).toBeGreaterThanOrEqual(drawnFontSize(9) * 1.35);
    });

    it("the plot fits inside the height it was given", async () => {
        const knownHeight = 140;
        // Non-compact, the legend and overrun rows take their height first.
        // Not pinned to a literal: both rows scale with the OS text size, and
        // jest-expo does not run at the device default.
        const chrome = Math.ceil(drawnFontSize(12) * 1.35)
                     + Math.ceil(drawnFontSize(9) * 1.35);
        const {getByLabelText: getLabelA} = await draw({height: knownHeight, compact: false});
        const {getByLabelText: getLabelB} = await draw({height: knownHeight, compact: true});

        const label = "Brew trace, 93 then 92 degrees";
        expect(getLabelA(label).props.height).toBe(knownHeight - chrome);
        expect(getLabelB(label).props.height).toBe(knownHeight);
    });

    it("fuses the dashes when told to", async () => {
        const {getByTestId} = await draw({planDashed: false});
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeUndefined();
    });

    it("draws a travelling head part-way through, and none at the end", async () => {
        const travelling = await draw({planHeadAt: 0.4});
        expect(travelling.getByTestId("trace-head")).toBeTruthy();
        const arrived = await draw({planHeadAt: 1});
        expect(arrived.queryByTestId("trace-head")).toBeNull();
    });

    it("draws the cup line in the accent's derived colour, not in muted", async () => {
        const {getByTestId} = await draw({
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        const cup = getByTestId("trace-cup");
        // react-native-svg processes hex strings through processColor; compare via payload.
        expect(cup.props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor(TEST_ACCENT))})
        );
        expect(cup.props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(palette.muted)})
        );
    });

    it("moves the cup line with the accent", async () => {
        // Sky is the one accent whose complement the amber guard pushes.
        const {getByTestId} = await draw({
            accent: "#9FC3F0",
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        expect(getByTestId("trace-cup").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor("#9FC3F0"))})
        );
    });

    it("draws the cup line in that colour in compact mode too", async () => {
        const {getByTestId} = await draw({
            compact: true,
            height: 80,
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        expect(getByTestId("trace-cup").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor(TEST_ACCENT))})
        );
    });

    it("draws a rule per stage, descending with the temperature", async () => {
        const descending = [
            new Pour(1, 40, 94, 40, 0, 0, 30),
            new Pour(2, 100, 92, 40, 0, 0, 20),
            new Pour(3, 100, 90, 40, 0, 0, 0)
        ];
        const {getByTestId} = await draw({pours: descending, plannedSeconds: 110});
        const y = (i: number) => getByTestId(`trace-temp-${i}`).props.y1;
        // Screen coordinates run downward, so a cooler stage sits lower.
        expect(y(1)).toBeGreaterThan(y(0));
        expect(y(2)).toBeGreaterThan(y(1));
    });

    it("draws a flat recipe as one height", async () => {
        const flat = [
            new Pour(1, 40, 93, 40, 0, 0, 30),
            new Pour(2, 100, 93, 40, 0, 0, 0)
        ];
        const {getByLabelText, getByTestId} = await draw({pours: flat, plannedSeconds: 65});
        const y = getByTestId("trace-temp-0").props.y1;
        expect(getByTestId("trace-temp-1").props.y1).toBeCloseTo(y);

        const svgHeight = getByLabelText(
            "Brew trace, 93 then 93 degrees"
        ).props.height;
        expect(y).toBeGreaterThan(svgHeight * BAND_TOP);
        expect(y).toBeLessThan(svgHeight * BAND_FLOOR);
    });

    it("stops a rule at the end of its pour", async () => {
        // Stage 1 pours 40 ml at 4 ml/s, so 10 s of a 40 s stage. A rule that
        // ran to the stage boundary would cover the 30 s pause.
        const {getByTestId} = await draw({
            pours: [new Pour(1, 40, 94, 40, 0, 0, 30), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 65,
            width: 260
        });
        const rule = getByTestId("trace-temp-0");
        // 10 s of 65 s across 260 px is 40 px. The stage ends at 40 s, 160 px.
        expect(rule.props.x2).toBeCloseTo(40, 0);
    });

    it("keeps a rinse pour visible", async () => {
        const {getByTestId} = await draw({
            pours: [new Pour(1, 2, 94, 40, 0, 0, 290), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 315,
            width: 260
        });
        const rule = getByTestId("trace-temp-0");
        expect(rule.props.x2 - rule.props.x1).toBeGreaterThanOrEqual(2);
    });

    it("draws the rules in the label grey and no fill or hue", async () => {
        const {getByTestId} = await draw();
        const rule = getByTestId("trace-temp-0");
        expect(rule.props.stroke).toEqual(
            expect.objectContaining({payload: processColor(palette.dim)})
        );
        expect(rule.props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(TEST_ACCENT)})
        );
        expect(rule.props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(palette.warn)})
        );
        expect(rule.props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(palette.danger)})
        );
        expect(rule.props.fill).toBeNull();
    });

    it("links each temperature fade to its own absolute gradient", async () => {
        const {getByTestId, toJSON} = await draw();
        const fade = getByTestId("trace-temp-fade-0");
        const gradient = renderedNodes(toJSON())
            .find((node) => node.props.name === "tempFade-0");

        expect(gradient).toBeTruthy();
        expect(fade.props.fill.brushRef).toBe(gradient!.props.name);
        expect(fade.props.height).toBe(16);
        // react-native-svg renders userSpaceOnUse as its native enum value.
        expect(gradient!.props.gradientUnits).toBe(1);
        expect(gradient!.props.y1).toBe(fade.props.y);
        expect(gradient!.props.y2).toBe(fade.props.y + fade.props.height);
    });

    it("prints every stage's temperature, repeating a flat one", async () => {
        const flat = [
            new Pour(1, 40, 93, 40, 0, 0, 30),
            new Pour(2, 100, 93, 40, 0, 0, 0)
        ];
        const {getByTestId} = await draw({pours: flat, plannedSeconds: 65});
        // Two stages at one temperature print two labels. The repetition is
        // honest and reads as "flat" instantly.
        expect(svgTextContent(getByTestId("trace-temp-label-0"))).toBe("93°");
        expect(svgTextContent(getByTestId("trace-temp-label-1"))).toBe("93°");
    });

    it("keeps each reading above its own rule", async () => {
        const close = [
            new Pour(1, 40, 93, 40, 0, 0, 20),
            new Pour(2, 40, 85, 40, 0, 0, 0)
        ];
        const {getByTestId} = await draw({pours: close, height: 250, plannedSeconds: 40});
        const label0 = getByTestId("trace-temp-label-0");
        const label1 = getByTestId("trace-temp-label-1");

        expectRuleLabelAttached(getByTestId("trace-temp-0"), label0);
        expectRuleLabelAttached(getByTestId("trace-temp-1"), label1);
        expect(svgScalar(label0.props.y)).toBeLessThan(svgScalar(label1.props.y));
        expect(svgScalar(label0.props.y)).toBeGreaterThanOrEqual(drawnFontSize(11));
    });

    it("reserves absolute headroom for the hottest label at normal and capped font scale", async () => {
        for (const scale of [1, 1.4]) {
            const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(scale);
            const view = await draw({
                pours: [
                    new Pour(1, 40, 100, 40, 0, 0, 20),
                    new Pour(2, 40, 90, 40, 0, 0, 0)
                ],
                height: 100,
                plannedSeconds: 40
            });
            const rule = view.getByTestId("trace-temp-0");
            const label = view.getByTestId("trace-temp-label-0");

            expectRuleLabelAttached(rule, label);
            expect(svgScalar(label.props.y)).toBeGreaterThanOrEqual(drawnFontSize(11));
            expect(rule.props.y1).toBeCloseTo(drawnFontSize(11) + 4, 1);
            scaleSpy.mockRestore();
        }
    });

    it("uses the proportional band top on a tall chart", async () => {
        const {getByTestId, getByLabelText} = await draw({
            pours: [new Pour(1, 40, 100, 40, 0, 0, 0)],
            height: 1200,
            plannedSeconds: 10
        });
        const svgHeight = getByLabelText("Brew trace, 100 degrees").props.height;
        const rule = getByTestId("trace-temp-0");
        expect(rule.props.y1).toBeCloseTo(svgHeight * BAND_TOP, 1);
        expect(rule.props.y1 - svgScalar(getByTestId("trace-band-max").props.y))
            .toBeCloseTo(4, 1);
    });

    it("centres a stage label on its own rule", async () => {
        const {getByTestId} = await draw();
        const rule = getByTestId("trace-temp-0");
        const label = getByTestId("trace-temp-label-0");
        expect(svgScalar(label.props.x)).toBeCloseTo((rule.props.x1 + rule.props.x2) / 2);
    });

    it("prints both ends of the band, since heights are not comparable between recipes", async () => {
        const {getByTestId} = await draw({
            pours: [new Pour(1, 40, 94, 40, 0, 0, 0), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 35
        });
        expect(svgTextContent(getByTestId("trace-band-max"))).toBe("100");
        expect(svgTextContent(getByTestId("trace-band-min"))).toBe("85");
        expect(svgScalar(getByTestId("trace-band-max").props.y))
            .toBe(drawnFontSize(11));
        expect(svgScalar(getByTestId("trace-band-min").props.y))
            .toBeGreaterThan(svgScalar(getByTestId("trace-band-max").props.y));
        expect(svgScalar(getByTestId("trace-band-max").props.x)).toBe(298);
        expect(svgScalar(getByTestId("trace-band-min").props.x)).toBe(298);
    });

    it("keeps a cool rule label clear of the band minimum readout", async () => {
        const {getByTestId} = await draw({
            pours: [new Pour(1, 40, 85, 40, 0, 0, 0)],
            height: 250,
            plannedSeconds: 10
        });
        const labelY = svgScalar(getByTestId("trace-temp-label-0").props.y);
        const bandMinY = svgScalar(getByTestId("trace-band-min").props.y);
        expect(labelY + drawnFontSize(11)).toBeLessThan(bandMinY);
    });

    it("keeps the band minimum readout inside a short plot", async () => {
        const {getByTestId, getByLabelText} = await draw({
            pours: [new Pour(1, 40, 85, 40, 0, 0, 0)],
            height: 120,
            plannedSeconds: 10
        });
        const svgHeight = getByLabelText("Brew trace, 85 degrees").props.height;
        expect(svgScalar(getByTestId("trace-band-min").props.y)).toBeLessThanOrEqual(svgHeight);
    });

    it("prints no band edges when there is nothing to scale", async () => {
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-band-max")).toBeNull();
    });

    it("compact prints no readings", async () => {
        const {queryByTestId} = await draw({compact: true});
        expect(queryByTestId("trace-temp-label-0")).toBeNull();
    });

    it("draws every rule before any water has moved", async () => {
        // Live, the whole temperature plan is known the moment the recipe is
        // sent, and is drawn from t=0 exactly as the plan line is. Nobody reads
        // the plan line as having happened, so a grey mark ahead of the water
        // already means intent in this chart.
        const {getByTestId} = await draw({
            pours: [
                new Pour(1, 40, 94, 40, 0, 0, 30),
                new Pour(2, 100, 90, 40, 0, 0, 0)
            ],
            samples: [],
            plannedSeconds: 65
        });
        expect(getByTestId("trace-temp-1")).toBeTruthy();
    });

    it("draws no rules for a record with no stages", async () => {
        // A brew written before `plan` existed. It draws as it always did.
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-temp-0")).toBeNull();
    });

    it("compact draws no temperature at all", async () => {
        const {queryByTestId} = await draw({compact: true});
        expect(queryByTestId("trace-temp-0")).toBeNull();
    });

    it("reads the temperature from the stages when there is no plan", async () => {
        // A summary hides the plan line by passing `pours={[]}` and supplies
        // `stages` separately. Reading `pours` alone would silently draw
        // nothing in history, which is the main place this is for.
        const {getByTestId} = await draw({
            pours: [],
            stages: [new Pour(1, 40, 94, 40, 0, 0, 0)],
            samples: samples([0, 0, 0], [10_000, 40, 20]),
            plannedSeconds: 0
        });
        expect(getByTestId("trace-temp-0")).toBeTruthy();
    });

    const brewing = [
        new Pour(1, 40, 94, 40, 0, 0, 30),
        new Pour(2, 100, 90, 40, 0, 0, 0)
    ];

    it("gives a bypass inside the band the same mark as a stage", async () => {
        const {getByTestId, queryByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 88, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(getByTestId("trace-temp-bypass")).toBeTruthy();
        expect(svgTextContent(getByTestId("trace-temp-label-bypass"))).toBe("88°");
        expect(queryByTestId("trace-bypass-temp")).toBeNull();
    });

    it("draws the bypass mark at the bypass temperature", async () => {
        const {getByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 88, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        // 88 is cooler than the second brew stage's 90, so it sits lower.
        expect(getByTestId("trace-temp-bypass").props.y1)
            .toBeGreaterThan(getByTestId("trace-temp-1").props.y1);
    });

    it("keeps bypass fade ids in step with their fills", async () => {
        const {getByTestId, toJSON} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 88, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        const fade = getByTestId("trace-temp-fade-bypass");
        const gradient = renderedNodes(toJSON())
            .find((node) => node.props.name === "tempFade-bypass");

        expect(gradient).toBeTruthy();
        expect(fade.props.fill.brushRef).toBe(gradient!.props.name);
        expect(gradient!.props.y1).toBe(fade.props.y);
        expect(gradient!.props.y2).toBe(fade.props.y + fade.props.height);
    });

    it("draws bypass marks at both band edges with the same label styling", async () => {
        for (const temperature of [85, 100]) {
            const view = await draw({
                pours: brewing,
                plannedSeconds: 65,
                bypass: {volume: 60, temperature, delivered: 60,
                         startedAt: 65, state: "done"}
            });
            const label = view.getByTestId("trace-temp-label-bypass");
            expect(view.getByTestId("trace-temp-bypass")).toBeTruthy();
            expect(svgTextContent(label)).toBe(`${temperature}°`);
            expectTempLabelStyle(label);
            expect(svgScalar(label.props.y)).toBeGreaterThanOrEqual(drawnFontSize(11));
            expect(view.queryByTestId("trace-bypass-temp")).toBeNull();
        }
    });

    it("draws no rule for a bypass the band cannot hold", async () => {
        // 55 degrees against an 85..100 band. Widening to fit it would put the
        // brew's own rules about five pixels apart.
        const {queryByTestId, getByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 55, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(queryByTestId("trace-temp-bypass")).toBeNull();
        // It still says how hot it was, in the box it already owns.
        expect(svgTextContent(getByTestId("trace-bypass-temp"))).toBe("55°");
    });

    it("does not print an unset bypass temperature", async () => {
        const {queryByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: -1, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(queryByTestId("trace-temp-bypass")).toBeNull();
        expect(queryByTestId("trace-bypass-temp")).toBeNull();
    });

    it("keeps an out-of-band bypass reading visible near the plot edge", async () => {
        const {getByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 4, temperature: 55, delivered: 4,
                     startedAt: 65, state: "done"}
        });

        expect(svgScalar(getByTestId("trace-bypass-temp").props.y))
            .toBeGreaterThanOrEqual(drawnFontSize(11));
        expect(svgScalar(getByTestId("trace-bypass-temp").props.y))
            .toBeGreaterThan(
                getByTestId("trace-bypass").props.y + getByTestId("trace-bypass").props.height
            );
        expect(svgScalar(getByTestId("trace-bypass-temp").props.y)).toBeCloseTo(
            getByTestId("trace-bypass").props.y
            + getByTestId("trace-bypass").props.height
            + 4
            + drawnFontSize(11),
            1
        );
    });

    it("keeps a tiny bypass box at the volume-axis minimum", async () => {
        const {getByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 360,
            bypass: {volume: 0.1, temperature: 55, delivered: 0.1,
                     startedAt: 360, state: "done"}
        });
        expect(getByTestId("trace-bypass").props.width).toBe(2);
        expect(getByTestId("trace-bypass").props.height).toBe(2);
    });

    it("never widens the band to admit a bypass", async () => {
        const cold = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 55, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(svgTextContent(cold.getByTestId("trace-band-min"))).toBe("85");
    });

    it("says the stage temperature run out loud", async () => {
        const {getByLabelText} = await draw({
            pours: [
                new Pour(1, 40, 94, 40, 0, 0, 30),
                new Pour(2, 100, 90, 40, 0, 0, 0)
            ],
            plannedSeconds: 65
        });
        expect(getByLabelText("Brew trace, 94 then 90 degrees")).toBeTruthy();
    });

    it("does not say unset stage temperatures out loud", async () => {
        const {getByLabelText} = await draw({
            pours: [
                new Pour(1, 40, -1, 40, 0, 0, 30),
                new Pour(2, 100, 90, 40, 0, 0, 0)
            ],
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: -1, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(getByLabelText("Brew trace, 90 degrees")).toBeTruthy();
    });

    it("does not say bypass temperatures out loud", async () => {
        const inside = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 88, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        const outside = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 55, delivered: 60,
                     startedAt: 65, state: "done"}
        });

        expect(inside.getByLabelText("Brew trace, 94 then 90 degrees")).toBeTruthy();
        expect(outside.getByLabelText("Brew trace, 94 then 90 degrees")).toBeTruthy();
    });

    it("says nothing when no temperature rule can be drawn", async () => {
        const {getByLabelText} = await draw({
            pours: [new Pour(1, 40, 94, 40, 0, 0, 30)],
            plannedSeconds: 0
        });
        expect(getByLabelText("Brew trace")).toBeTruthy();
    });

    it("says only what it is when there is no temperature to say", async () => {
        const {getByLabelText} = await draw({pours: [], plannedSeconds: 0});
        expect(getByLabelText("Brew trace")).toBeTruthy();
    });
});

describe("the trace as it was drawn", () => {
    it("fills beneath the water line", async () => {
        const {getByTestId} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        expect(getByTestId("trace-water-fill")).toBeTruthy();
    });

    it("marks where each stage ends", async () => {
        const {getAllByTestId} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        // Three internal boundaries on four stages; the last one is the edge.
        expect(getAllByTestId(/^trace-gridline-/)).toHaveLength(3);
    });

    it("names its three lines in a row beneath the graph", async () => {
        const {getByText} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("CUP")).toBeTruthy();
        expect(getByText("PLAN")).toBeTruthy();
    });

    it("draws neither fill nor legend in the bar", async () => {
        const {queryByTestId, queryByText} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 86,
            height: 34,
            plannedSeconds: 80,
            compact: true,
        });

        expect(queryByTestId("trace-water-fill")).toBeNull();
        expect(queryByText("WATER")).toBeNull();
    });

    it("does not name a plan line that is not drawn", async () => {
        const {queryByText, getByText} = await draw({
            pours: [],
            samples: [],
            accent: palette.brand,
            width: 300,
            height: 160,
            plannedSeconds: 60,
            planOpacity: 0,
        });

        expect(queryByText("PLAN")).toBeNull();
        expect(getByText("WATER")).toBeTruthy();
    });
});

describe("the travelling head", () => {
    it("sizes its dash along the line, not across the box", async () => {
        // A plan is a staircase, so its length is the width plus its whole
        // rise. The pattern used to be sized in `width`, which is shorter than
        // the line it runs along: it repeated, so a second lit head appeared,
        // and the real one reset before reaching the end.
        const {getByTestId} = await draw({planHeadAt: 0.5, width: 300});
        const dash = getByTestId("trace-head").props.strokeDasharray as string;
        const period = Number(String(dash).trim().split(/[\s,]+/)[1]);

        expect(period).toBeGreaterThan(300);
    });
});

describe("BrewTrace's stage selection", () => {
    it("stays inert for a caller that passes no handler", async () => {
        // The live screen and the export both draw this component and neither
        // has a panel to answer a tap with, so neither may get a tap target.
        const {queryByTestId} = await draw({selectedIndex: null});
        expect(queryByTestId("trace-tap")).toBeNull();
        expect(queryByTestId("trace-band")).toBeNull();
    });

    it("shades the selected stage across its own share of the axis", async () => {
        // Stage one is 40 ml at 4 ml/s = 10 s, then a 20 s rest: 0-30 s of a
        // 70 s axis on a 300 pt chart. So x = 0 and width = 300 * 30/70.
        const {getByTestId} = await draw({selectedIndex: 0, onSelectStage: jest.fn()});
        const band = getByTestId("trace-band");
        expect(band.props.x).toBe(0);
        expect(band.props.width).toBeCloseTo(128.57, 1);
    });

    it("shades a later stage away from the left edge", async () => {
        // Stage two starts at 30 s: 300 * 30/70 across.
        const {getByTestId} = await draw({selectedIndex: 1, onSelectStage: jest.fn()});
        expect(getByTestId("trace-band").props.x).toBeCloseTo(128.57, 1);
    });

    it("names the stage under the finger, not the one under the plan", async () => {
        // The run overran: stage one really ended at 50 s, not the planned 30.
        // A tap at 40 s belongs to stage one, and resolving against the plan
        // would blame stage two — the overrun being the very thing a user taps
        // a late stage to ask about.
        const onSelectStage = jest.fn();
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 50_000, water: 40, cup: 30, pour: 1},
                {at: 51_000, water: 41, cup: 31, pour: 2},
                {at: 90_000, water: 200, cup: 190, pour: 2}
            ],
            onSelectStage
        });
        // The axis now runs to 90 s, so 60 s is 300 * 60/90 = 200 pt across and
        // lands in stage two. Read against the 70 s plan the same 200 pt would
        // be 46.7 s, still inside stage one — so the two axes genuinely differ
        // here, which a tap earlier in the chart would not have shown.
        fireEvent.press(getByTestId("trace-tap"), {nativeEvent: {locationX: 200}});
        expect(onSelectStage).toHaveBeenCalledWith(1);
    });

    it("shades where the stage really ran, not where it was meant to", async () => {
        // Same overrun: stage one was planned to end at 30 s but ran to 50.
        // On the 90 s axis of a 300 pt chart that is 300 * 50/90 = 166.7 pt of
        // shading, against the 100 pt the plan alone would have given.
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 50_000, water: 40, cup: 30, pour: 1},
                {at: 51_000, water: 41, cup: 31, pour: 2},
                {at: 90_000, water: 200, cup: 190, pour: 2}
            ],
            selectedIndex: 0,
            onSelectStage: jest.fn()
        });
        expect(getByTestId("trace-band").props.width).toBeCloseTo(166.67, 1);
    });

    it("names the last stage for a tap out in the overrun", async () => {
        const onSelectStage = jest.fn();
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 20_000, water: 40, cup: 30, pour: 2}
            ],
            onSelectStage
        });
        fireEvent.press(getByTestId("trace-tap"), {nativeEvent: {locationX: 299}});
        expect(onSelectStage).toHaveBeenCalledWith(1);
    });
});

const traceProps = {
    pours,
    samples: [] as BrewSample[],
    accent: TEST_ACCENT,
    width: 300,
    height: 140,
    plannedSeconds: 70,
};

describe("the bypass box", () => {
    it("draws a dashed box above the target for a bypass", async () => {
        await renderWithProviders(
            <BrewTrace
                {...traceProps}
                bypass={{volume: 5, temperature: 85, delivered: 5,
                         startedAt: 120, state: "done"}}
            />
        );
        const box = screen.getByTestId("trace-bypass");
        expect(box.props.fill).toBeNull();  // react-native-svg processes "none" → null
        expect(box.props.strokeDasharray).toEqual(["4", "4"]);
    });

    it("draws no box when there is no bypass", async () => {
        await renderWithProviders(<BrewTrace {...traceProps} />);
        expect(screen.queryByTestId("trace-bypass")).toBeNull();
    });

    it("slides the box to now while the machine is still waiting", async () => {
        // startedAt null and the run already past its plan: the box has no real
        // time to sit at, so it tracks the right-hand edge rather than pinning
        // itself to a plan time that has already gone by.
        await renderWithProviders(
            <BrewTrace
                {...traceProps}
                plannedSeconds={100}
                samples={[{at: 160_000, water: 240, cup: 200, pour: 3}]}
                bypass={{volume: 5, temperature: 85, delivered: 0,
                         startedAt: null, state: "waiting"}}
            />
        );
        const box = screen.getByTestId("trace-bypass");
        const pinned = Number(box.props.x);
        expect(pinned).toBeGreaterThan(0);
    });
});
