import React from "react";
import {Pressable} from "react-native";
import Svg, {Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText}
    from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotMatrixText, {dotMatrixSvgProps, drawnFontSize} from "@/components/DotMatrixText";
import {cupLineFor, palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {bypassSeconds, livePoints, pathLength, planPoints, stageSpans, toPath,
        type Box} from "@/library/brew/brewShape";
import type {BypassView} from "@/library/brew/bypassState";
import {stageAtX, stageBounds} from "@/library/brew/stagePick";
import {bandY, BAND_FLOOR, hasSetTemperature, temperatureBand,
        temperatureInBand, temperatureMarks} from "@/library/brew/tempBand";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    width: number;
    /** Total rendered height of the component. In non-compact mode this includes the legend and overrun rows. */
    height: number;
    plannedSeconds: number;
    /** Overflow protection has stopped the water. Turns the live line amber. */
    holding?: boolean;
    /** Driven by the screen's phase animations; plain numbers keep this testable. */
    planOpacity?: number;
    planColor?: string;
    /** False once the recipe is in the machine and the dashes should fuse. */
    planDashed?: boolean;
    /** 0 to 1: how far the lit head has travelled. 1 means no head. */
    planHeadAt?: number;
    /** When true, render only the SVG at exactly width × height — no stage counter, no overrun label. */
    compact?: boolean;
    /**
     * The stages a tap resolves against. Defaults to `pours`.
     *
     * A summary hides the plan line by passing `pours={[]}`, which leaves the
     * chart with no stages to name — so it must say separately which stages
     * the run actually had.
     */
    stages?: Pour[];
    /** The stage whose detail is open, shaded on the chart. */
    selectedIndex?: number | null;
    /**
     * Absent leaves the chart inert. The live screen and the export pass
     * nothing, so neither gains a tap target it has no panel to answer with.
     */
    onSelectStage?: (index: number) => void;
    /**
     * The bypass, drawn as a dashed box sitting **on top of** the target.
     *
     * On top, not inside: the water target stays at the sum of the pours, and
     * the box rises above it. That is the same story the editor tells, so the
     * two screens do not disagree about what a bypass is.
     */
    bypass?: BypassView;
};

/** Point size of the overrun label, and of the legend's labels. */
const OVERRUN_SIZE = 12;
const LEGEND_SIZE = 9;

/**
 * The height a row of dot-matrix text needs.
 *
 * Doto's line box is close to 1.35em, the same ratio `DigitRoll` uses, applied
 * to the size the glyphs are actually *drawn* at rather than the size asked
 * for. Both halves matter here. Sixteen points was a point short of twelve
 * point text even at the default text size, so a real brew's `+96 S` lost its
 * descenders; and `DotMatrixText` will not draw Doto below eleven points
 * however small a size a call site asks for, so the nine-point legend needs a
 * fifteen-point row rather than a fourteen-point one. Accessibility text
 * sizing widens both gaps.
 */
function rowHeight(fontSize: number): number {
    return Math.ceil(drawnFontSize(fontSize) * 1.35);
}

/** The gradient's opacity at the line and at the floor. */
const FILL_TOP = 0.28;
const FILL_BOTTOM = 0;

/**
 * The fade beneath a temperature rule, and its opacity at the rule.
 *
 * A bare rule reads as a boundary; a rule with a little weight under it reads
 * as a body of water at a temperature. Short enough never to reach the water
 * fill, so the grey and the accent never mix.
 *
 * Not a filled column: a column encodes temperature twice, as a height and as
 * an area, and area is the louder of the two while meaning nothing at all. A
 * hot stage is not a bigger stage.
 */
const TEMP_FADE = 16;
const TEMP_FADE_TOP = 0.38;

/**
 * The reading above each rule, and the band's own edge labels.
 *
 * Eleven is Doto's floor, which is also the smallest this reads at arm's length
 * on a phone. The label is allowed to overhang a very short rule: the space
 * beside it is a pause and is empty by construction, so there is nothing to
 * collide with, and trading the degree sign for width would cost more than it
 * saves.
 *
 * They are `palette.dim`. `palette.muted` is 4.12:1 on `base`, under AA, and
 * the palette documents it as not a text colour.
 */
const TEMP_LABEL = 11;
/** Clearance between a reading's baseline and the rule it labels. */
const TEMP_LABEL_GAP = 4;

function tempLabelHeadroom(): number {
    return drawnFontSize(TEMP_LABEL) + TEMP_LABEL_GAP;
}

/** Minimum SVG plot height in pixels. Prevents zero or negative dimensions when height is very small. */
const PLOT_FLOOR = 10;

/** Minimum rendered bypass box size on the volume axis, unrelated to temperature mark width. */
const BYPASS_BOX_MIN = 2;

/** Below this an overrun is rounding, not a hold worth naming. */
const GAP_FLOOR_SECONDS = 2;

/** The lit head's length, as a fraction of the curve. */
const LIT = 0.12;

function tempLabelY(ruleY: number): number {
    return ruleY - TEMP_LABEL_GAP;
}

function bandMaxLabelY(ruleY: number): number {
    return tempLabelY(ruleY);
}

function bandMinLabelY(svgHeight: number): number {
    return Math.min(svgHeight * BAND_FLOOR + drawnFontSize(TEMP_LABEL), svgHeight);
}

function bypassBoxLabelY(y: number, height: number, svgHeight: number): number {
    const centred = y + height / 2 + drawnFontSize(TEMP_LABEL) / 3;
    if (centred >= drawnFontSize(TEMP_LABEL) && centred <= svgHeight) return centred;
    if (centred < drawnFontSize(TEMP_LABEL)) {
        return Math.min(y + height + TEMP_LABEL_GAP + drawnFontSize(TEMP_LABEL), svgHeight);
    }
    return Math.max(y - TEMP_LABEL_GAP, drawnFontSize(TEMP_LABEL));
}

/** One spoken description for the thermal shape encoded by height in the chart. */
function temperatureAccessibilityLabel(marks: {temperature: number}[]): string {
    if (marks.length === 0) return "Brew trace";
    return `Brew trace, ${marks.map((mark) => mark.temperature).join(" then ")} degrees`;
}

/** what was asked for, what the machine did, what landed
 * in the cup.
 *
 * The axis is sized to the longer of the plan and the run, so a brew held by
 * overflow protection ends right of its plan by exactly the time it lost and
 * the chart records the hold for free. Squeezing the run back onto the plan's
 * axis would erase the one thing worth seeing.
 */
export default function BrewTrace({
    pours, samples, accent, width, height, plannedSeconds,
    holding = false, planOpacity = 1, planColor = palette.muted,
    planDashed = true, planHeadAt = 1,
    compact = false, stages, selectedIndex = null, onSelectStage, bypass
}: Props) {
    const plan = planPoints(pours);
    const water = livePoints(samples, "water");
    const cup = livePoints(samples, "cup");

    const ranTo = water.length > 0 ? water[water.length - 1].t : 0;
    // The plan's final water level: where the target line ends, and the floor
    // the bypass box is stacked on.
    const planTop = plan.length > 0 ? plan[plan.length - 1].v : 0;
    const bypassMl = bypass === undefined ? 0 : Math.max(bypass.volume, 0);
    const bypassWide = bypassSeconds(bypassMl);
    // With no real start time the box tracks the later of the plan and now, so
    // it visibly slides right while the machine waits for the dripper instead
    // of sitting at a plan time that has already gone past.
    const bypassFrom = bypass === undefined ? 0
        : bypass.startedAt !== null ? bypass.startedAt
        : Math.max(plannedSeconds, ranTo);
    // In compact mode the SVG fills the full height; otherwise the legend row
    // and the overrun row take theirs first.
    const svgHeight = compact
        ? height
        : Math.max(height - rowHeight(OVERRUN_SIZE) - rowHeight(LEGEND_SIZE), PLOT_FLOOR);
    const box: Box = {
        width,
        height: svgHeight,
        maxT: Math.max(plannedSeconds, ranTo, bypassFrom + bypassWide),
        maxV: Math.max(
            planTop,
            water.length > 0 ? water[water.length - 1].v : 0,
            planTop + bypassMl
        )
    };

    const planPath = toPath(plan, box);
    // The dash pattern below is measured along the line, not across the box.
    const planLength = pathLength(plan, box);
    const waterPath = toPath(water, box);
    const cupPath = toPath(cup, box);
    // Derived here rather than at each use so the compact render, the full render
    // and the legend cannot drift apart.
    const cupColour = cupLineFor(accent);
    // The stages a temperature belongs to. `stages ?? pours` is the same
    // fallback the tap bounds use: a summary passes `pours={[]}` and supplies
    // `stages`, so reading `pours` alone would draw nothing in history.
    const tempStages = stages ?? pours;
    // Hoisted above the compact return so thumbnails say the same thermal
    // shape as the full chart, while still deriving speech from marks that
    // would really be drawn. The original plan's snippet sat below this return.
    const tempBand = temperatureBand(tempStages.map((pour) => pour.temperature));
    const tempHeadroom = tempLabelHeadroom();
    const marks = tempBand === undefined
        ? []
        : temperatureMarks(tempStages, tempBand, box, tempHeadroom);
    const accessibilityLabel = temperatureAccessibilityLabel(marks);
    // The water line, carried down to the floor and back, so it can be filled.
    // Built here rather than by setting `fill` on the line itself: an open
    // path fills between its endpoints and cuts the corner off the curve.
    const waterFill = waterPath === ""
        ? ""
        : `${waterPath} L${round(box.width * (ranTo / Math.max(box.maxT, 1)))} `
          + `${svgHeight} L0 ${svgHeight} Z`;

    // Where each stage ends, as a fraction of the axis. The last boundary is
    // the right-hand edge of the chart and is not drawn.
    const boundaries = stageSpans(pours)
        .slice(0, -1)
        .map((span) => (span.end / Math.max(box.maxT, 1)) * box.width);

    // The stages' real extents, so a tap and the shading both resolve against
    // what the brew did rather than against what it was told to do. Derived
    // here from the same `samples` and `box` the lines are drawn from: handing
    // them in as a prop would let the shading drift off the chart it shades.
    const bounds = stageBounds(samples, stages ?? pours);
    const selected = selectedIndex !== null ? bounds[selectedIndex] : undefined;
    const selectionBand = selected && box.maxT > 0 ? {
        x: (selected.start / box.maxT) * box.width,
        width: Math.max(((selected.end - selected.start) / box.maxT) * box.width, 1)
    } : undefined;

    // Only meaningful when there is an actual plan; a plan of nothing cannot be overrun.
    const overrun = plannedSeconds > 0 ? Math.round(ranTo - plannedSeconds) : 0;

    // Sized in the box's own units, so it moves with the axis rather than
    // needing its own scale.
    const bypassBox = bypass === undefined || bypassMl <= 0 || box.maxT <= 0
                      || box.maxV <= 0
        ? undefined
        : {
            x: (bypassFrom / box.maxT) * box.width,
            width: Math.max((bypassWide / box.maxT) * box.width, BYPASS_BOX_MIN),
            y: svgHeight - ((planTop + bypassMl) / box.maxV) * svgHeight,
            height: Math.max((bypassMl / box.maxV) * svgHeight, BYPASS_BOX_MIN)
          };

    if (compact) {
        return (
            <Svg width={width} height={height} accessibilityRole="image"
                 accessibilityLabel={accessibilityLabel}>
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray={planDashed ? "4 4" : undefined}
                        fill="none"
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        stroke={cupColour}
                        strokeWidth={2}
                        strokeDasharray="1 3"
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        stroke={holding ? palette.warn : accent}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                )}
            </Svg>
        );
    }

    /**
     * The bypass's own mark, when the band can hold it.
     *
     * The band is never widened to admit it: bypass water is usually far cooler
     * than brew water, and a 55 degree bypass would stretch the band enough to
     * put the brew's rules about five pixels apart. A rule whose whole meaning
     * is its height cannot be drawn off the scale, so when it does not fit it is
     * not drawn and the temperature is printed in the box instead.
     */
    const bypassMark = tempBand === undefined || bypass === undefined
                       || bypassBox === undefined
                       || !temperatureInBand(bypass.temperature, tempBand)
        ? undefined
        : {
            x: bypassBox.x,
            width: bypassBox.width,
            y: bandY(bypass.temperature, tempBand, svgHeight, tempHeadroom),
            temperature: bypass.temperature
          };
    const tempDraws = [
        ...marks.map((mark, i) => ({
            ...mark,
            key: `${i}`,
            gradientId: `tempFade-${i}`,
            fadeTestID: `trace-temp-fade-${i}`,
            lineTestID: `trace-temp-${i}`,
            labelTestID: `trace-temp-label-${i}`
        })),
        ...(bypassMark === undefined ? [] : [{
            ...bypassMark,
            key: "bypass",
            gradientId: "tempFade-bypass",
            fadeTestID: "trace-temp-fade-bypass",
            lineTestID: "trace-temp-bypass",
            labelTestID: "trace-temp-label-bypass"
        }])
    ];

    const chart = (
        <Svg width={width} height={svgHeight} accessibilityRole="image"
             accessibilityLabel={accessibilityLabel}>
                <Defs>
                    <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity={FILL_TOP} />
                        <Stop offset="1" stopColor={accent} stopOpacity={FILL_BOTTOM} />
                    </LinearGradient>
                    {/*
                      userSpaceOnUse encodes absolute y and SVG ids are
                      module-global; a duplicated id in a second chart would
                      move the fade vertically, not only recolour it.
                    */}
                    {tempDraws.map((mark) => (
                        <LinearGradient
                            key={mark.gradientId}
                            id={mark.gradientId}
                            gradientUnits="userSpaceOnUse"
                            x1="0" y1={mark.y} x2="0" y2={mark.y + TEMP_FADE}
                        >
                            <Stop offset="0" stopColor={palette.dim}
                                  stopOpacity={TEMP_FADE_TOP} />
                            <Stop offset="1" stopColor={palette.dim} stopOpacity={0} />
                        </LinearGradient>
                    ))}
                </Defs>
                {selectionBand && (
                    <Rect
                        testID="trace-band"
                        x={selectionBand.x} y={0} width={selectionBand.width} height={svgHeight}
                        fill={palette.raised}
                    />
                )}
                {boundaries.map((x, i) => (
                    <Line
                        key={`gridline-${i}`}
                        testID={`trace-gridline-${i}`}
                        x1={x} y1={0} x2={x} y2={svgHeight}
                        stroke={palette.line}
                        strokeWidth={1}
                    />
                ))}
                {tempDraws.map((mark) => (
                    <React.Fragment key={`temp-${mark.key}`}>
                        <Rect
                            testID={mark.fadeTestID}
                            x={mark.x} y={mark.y}
                            width={mark.width} height={TEMP_FADE}
                            fill={`url(#${mark.gradientId})`}
                        />
                        <Line
                            testID={mark.lineTestID}
                            x1={mark.x} y1={mark.y}
                            x2={mark.x + mark.width} y2={mark.y}
                            stroke={palette.dim}
                            strokeWidth={2}
                            strokeLinecap="round"
                            fill="none"
                        />
                        <SvgText
                            testID={mark.labelTestID}
                            x={mark.x + mark.width / 2}
                            y={tempLabelY(mark.y)}
                            textAnchor="middle"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                        >
                            {`${mark.temperature}°`}
                        </SvgText>
                    </React.Fragment>
                ))}
                {tempBand !== undefined && (
                    <React.Fragment>
                        <SvgText
                            testID="trace-band-max"
                            x={width - 2}
                            y={bandMaxLabelY(
                                bandY(tempBand.max, tempBand, svgHeight, tempHeadroom)
                            )}
                            textAnchor="end"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                        >
                            {`${tempBand.max}`}
                        </SvgText>
                        <SvgText
                            testID="trace-band-min"
                            x={width - 2}
                            y={bandMinLabelY(svgHeight)}
                            textAnchor="end"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                        >
                            {`${tempBand.min}`}
                        </SvgText>
                    </React.Fragment>
                )}
                {bypassBox && bypass && bypassMark === undefined && tempBand !== undefined
                 && hasSetTemperature(bypass.temperature) && (
                    <SvgText
                        testID="trace-bypass-temp"
                        x={bypassBox.x + bypassBox.width / 2}
                        y={bypassBoxLabelY(bypassBox.y, bypassBox.height, svgHeight)}
                        textAnchor="middle"
                        fill={palette.dim}
                        {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                    >
                        {`${bypass.temperature}°`}
                    </SvgText>
                )}
                {waterFill !== "" && (
                    <Path testID="trace-water-fill" d={waterFill} fill="url(#waterFill)"
                          stroke="none" />
                )}
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray={planDashed ? "4 4" : undefined}
                        fill="none"
                    />
                )}
                {planPath !== "" && planHeadAt < 1 && (
                    <Path
                        testID="trace-head"
                        d={planPath}
                        stroke={accent}
                        strokeWidth={2}
                        strokeDasharray={`${planLength * LIT} ${planLength}`}
                        strokeDashoffset={-planHeadAt * planLength * (1 + LIT)}
                        fill="none"
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        stroke={cupColour}
                        strokeWidth={2}
                        strokeDasharray="1 3"
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        stroke={holding ? palette.warn : accent}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                )}
                {bypassBox && (
                    <Rect
                        testID="trace-bypass"
                        x={bypassBox.x} y={bypassBox.y}
                        width={bypassBox.width} height={bypassBox.height}
                        fill="none"
                        stroke={bypass?.state === "pending" ? palette.line : accent}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                    />
                )}
        </Svg>
    );

    return (
        <YStack width={width}>
            {onSelectStage ? (
                <Pressable
                    testID="trace-tap"
                    accessibilityRole="button"
                    accessibilityLabel={`${accessibilityLabel}. Tap a stage`}
                    onPress={(e) => {
                        const index = stageAtX(bounds, e.nativeEvent.locationX, width, box.maxT);
                        if (index !== null) onSelectStage(index);
                    }}
                >
                    {chart}
                </Pressable>
            ) : chart}
            <XStack testID="trace-legend-row" height={rowHeight(LEGEND_SIZE)}
                    alignItems="center" gap="$3">
                <LegendItem colour={holding ? palette.warn : accent} label="WATER" />
                <LegendItem colour={cupColour} label="CUP" dotted />
                {plan.length > 0 && planOpacity > 0 && (
                    <LegendItem colour={planColor} label="PLAN" dashed />
                )}
            </XStack>
            <XStack testID="trace-overrun-row" justifyContent="flex-end"
                    alignItems="center" height={rowHeight(OVERRUN_SIZE)}>
                {overrun >= GAP_FLOOR_SECONDS && (
                    <DotMatrixText fontSize={OVERRUN_SIZE} weight="bold" letterSpacing={1.4}
                                   color={palette.warn}>
                        {`+${overrun} S`}
                    </DotMatrixText>
                )}
            </XStack>
        </YStack>
    );
}

/** One decimal, as in `toPath`. Long SVG paths are mostly noise. */
function round(n: number): number {
    return Math.round(n * 10) / 10;
}

/**
 * One entry in the legend.
 *
 * Beneath the graph rather than over it. Top-left is clear at the end of a
 * brew but sits on the plan dashes at the start, so overlaying it trades one
 * legibility problem for another; a dedicated row costs 14 pt and never
 * collides with anything.
 */
function LegendItem({colour, label, dashed = false, dotted = false}: {
    colour: string; label: string; dashed?: boolean; dotted?: boolean;
}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Svg width={14} height={6}>
                <Line
                    x1={0} y1={3} x2={14} y2={3}
                    stroke={colour}
                    strokeWidth={2}
                    strokeDasharray={dashed ? "3 3" : dotted ? "1 3" : undefined}
                />
            </Svg>
            <DotMatrixText fontSize={LEGEND_SIZE} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}
