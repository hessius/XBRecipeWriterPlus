import React, {useId} from "react";
import {Pressable} from "react-native";
import Svg, {Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText}
    from "react-native-svg";
import {XStack, YStack} from "tamagui";

import {dotMatrixSvgProps, drawnFontSize} from "@/components/DotMatrixText";
import TraceLegendItem, {LEGEND_SIZE, rowHeight} from "@/components/TraceLegendItem";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {livePoints, pathLength, planPoints, splitAtPauses, stageSpans, toPath,
        traceAxisFor, traceTimeParts,
        type Box} from "@/library/brew/brewShape";
import type {BypassView} from "@/library/brew/bypassState";
import {intervalRects, type PauseInterval} from "@/library/brew/pauseIntervals";
import {tracePauseSpoken} from "@/constants/brewCopy";
import {stageAtX, stageBounds} from "@/library/brew/stagePick";
import {bandY, hasSetTemperature, temperatureBand,
        temperatureInBand, temperatureMarks} from "@/library/brew/tempBand";
import {channelStyle, type Role} from "@/library/brew/traceStyle";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    width: number;
    /** Total rendered height of the component. In non-compact mode this includes the legend row. */
    height: number;
    plannedSeconds: number;
    /**
     * An axis imposed from outside, overriding the self-sizing below.
     *
     * The comparison screen sets it so two stacked lanes share a scale: the
     * same 30 second mark has to be at the same x in both, and the same 200 ml
     * at the same y. `BrewSummary` also sets it so the trace and the rate chart
     * below it share the same real-seconds extent. Absent, the box is sized to
     * whichever of the plan, the run and the bypass box reaches furthest.
     *
     * Must be at least this lane's own extent in both dimensions. A smaller
     * axis clips at the viewport rather than rescaling, so the lane would lose
     * its tail with nothing on screen to say it had. `BrewSummary` meets that
     * by building it with `traceAxisFor`, the same derivation this lane falls
     * back to. The comparison screen cannot: it has to reconcile two lanes, so
     * `compareAxis` in `library/brew/compare.ts` builds its own and owes the
     * requirement above directly. It clears its lanes today because neither is
     * given a bypass, and a bypass box added to one would overflow it.
     *
     * Sharing an axis only makes two lanes comparable when both are `compact`:
     * the temperature band is not part of the axis, so two full size lanes
     * would still put the same temperature at different heights.
     */
    axis?: {maxT: number; maxV: number};
    /**
     * The pauses to shade, in water-relative milliseconds. Drawn behind the
     * channels, and the axis grows to include one still open.
     */
    pauseIntervals?: readonly PauseInterval[];
    /** Overflow protection has stopped the water. Turns the live line amber. */
    holding?: boolean;
    /** Which comparison role this compact lane carries. Defaults to the coloured subject. */
    role?: Role;
    /** Driven by the screen's phase animations; plain numbers keep this testable. */
    planOpacity?: number;
    planColor?: string;
    /** False once the recipe is in the machine and the dashes should fuse. */
    planDashed?: boolean;
    /** 0 to 1: how far the lit head has travelled. 1 means no head. */
    planHeadAt?: number;
    /** When true, render only the SVG at exactly width by height, no stage counter. */
    compact?: boolean;
    /** Keeps the legend aligned with text while the plot itself bleeds. */
    legendInset?: number;
    /**
     * The stages a tap resolves against. Defaults to `pours`.
     *
     * A summary hides the plan line by passing `pours={[]}`, which leaves the
     * chart with no stages to name, so it must say separately which stages
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
/** The gradient's opacity at the line and at the floor. */
const FILL_TOP = 0.28;
const FILL_BOTTOM = 0;
/**
 * A temperature mark is a thin T-bar: the stage-wide rule carries the setpoint
 * height, and the short centred stem makes that height legible without turning
 * it into a column. A column would encode temperature twice, as a height and as
 * a length, and length would shout while meaning nothing at all.
 */
const TEMP_BAR_STROKE = 1.25;
const TEMP_BAR_STEM = 6;

/**
 * The reading above each rule.
 *
 * Eleven is Doto's floor, which is also the smallest this reads at arm's length
 * on a phone. The label is allowed to overhang a very short rule: the space
 * beside it is a pause and is empty by construction, so there is nothing to
 * collide with. At the plot edges it anchors inward instead: overhang outside
 * the SVG would be clipped, and trading the degree sign for width would cost
 * more than it saves.
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
const NO_INTERVALS: readonly PauseInterval[] = [];
const PAUSE_OPACITY = 0.18;
const PAUSE_FILL = {manual: palette.dim, overflow: palette.warnMuted} as const;

/** Minimum rendered bypass box size on the volume axis, unrelated to temperature mark width. */
const BYPASS_BOX_MIN = 2;

/** The lit head's length, as a fraction of the curve. */
const LIT = 0.12;

function tempLabelY(ruleY: number): number {
    return ruleY - TEMP_LABEL_GAP;
}

function bypassBoxLabelY(y: number, height: number, svgHeight: number): number {
    const centred = y + height / 2 + drawnFontSize(TEMP_LABEL) / 3;
    if (centred >= drawnFontSize(TEMP_LABEL) && centred <= svgHeight) return centred;
    if (centred < drawnFontSize(TEMP_LABEL)) {
        return Math.min(y + height + TEMP_LABEL_GAP + drawnFontSize(TEMP_LABEL), svgHeight);
    }
    return Math.max(y - TEMP_LABEL_GAP, drawnFontSize(TEMP_LABEL));
}

const TEMP_LABEL_EDGE_PAD = 2;

function visibleMinimumRectX(x: number, rectWidth: number, plotWidth: number): number {
    return Math.max(0, Math.min(x, plotWidth - rectWidth));
}

function estimatedTempLabelWidth(label: string): number {
    const tracking = label.length > 1 ? (label.length - 1) * 0.5 : 0;
    return label.length * drawnFontSize(TEMP_LABEL) * 0.75 + tracking;
}

function tempLabelX(center: number, label: string, plotWidth: number) {
    const labelWidth = estimatedTempLabelWidth(label);
    if (center - labelWidth / 2 < 0) {
        return {x: TEMP_LABEL_EDGE_PAD, textAnchor: "start" as const};
    }
    if (center + labelWidth / 2 > plotWidth) {
        return {x: plotWidth - TEMP_LABEL_EDGE_PAD, textAnchor: "end" as const};
    }
    return {x: center, textAnchor: "middle" as const};
}

/** One spoken description for the thermal shape encoded by height in the chart. */
function temperatureAccessibilityLabel(marks: {temperature: number}[]): string {
    if (marks.length === 0) return "Brew trace";
    return `Brew trace, ${marks.map((mark) => mark.temperature).join(" then ")} degrees`;
}

/** what was asked for, what the machine did, what landed
 * in the cup.
 *
 * KEEP IN STEP WITH: `components/CompareTrace.tsx` and
 * `components/__tests__/traceGrammar.test.tsx`. The two charts share their
 * appearance through `library/brew/traceStyle.ts`; nothing in this file should
 * set a stroke width or a dash pattern for a shared channel on its own.
 *
 * The axis is sized to the longer of the plan and the run, so a brew held by
 * overflow protection ends right of its plan by exactly the time it lost and
 * the chart records the hold for free. Squeezing the run back onto the plan's
 * axis would erase the one thing worth seeing.
 */
export default function BrewTrace({
    pours, samples, accent, width, height, plannedSeconds,
    axis, pauseIntervals = NO_INTERVALS,
    holding = false, role = "subject", planOpacity = 1, planColor = palette.muted,
    planDashed = true, planHeadAt = 1,
    compact = false, legendInset = 0, stages, selectedIndex = null, onSelectStage, bypass
}: Props) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const waterFillId = `trace-water-fill-${id}`;
    const plan = planPoints(pours);
    const water = livePoints(samples, "water");
    const cup = livePoints(samples, "cup");

    const times = traceTimeParts(plannedSeconds, samples, bypass, pauseIntervals);
    const {bypassMl, bypassWide, bypassFrom} = times;
    // The plan's final water level: where the target line ends, and the floor
    // the bypass box is stacked on.
    const planTop = plan.length > 0 ? plan[plan.length - 1].v : 0;
    const extent = axis ?? traceAxisFor(pours, samples, plannedSeconds, bypass, pauseIntervals);
    // In compact mode the SVG fills the full height; otherwise the legend row
    // takes its height first.
    const svgHeight = compact
        ? height
        : Math.max(height - rowHeight(LEGEND_SIZE), PLOT_FLOOR);
    const box: Box = {
        width,
        height: svgHeight,
        maxT: extent.maxT,
        maxV: extent.maxV
    };

    const planPath = toPath(plan, box);
    // The dash pattern below is measured along the line, not across the box.
    const planLength = pathLength(plan, box);
    // A line is broken across an automatic pause rather than joined through it.
    const waterRuns = splitAtPauses(water, pauseIntervals);
    const waterPath = waterRuns.map((run) => toPath(run, box)).filter((d) => d !== "").join(" ");
    const cupPath = splitAtPauses(cup, pauseIntervals)
        .map((run) => toPath(run, box)).filter((d) => d !== "").join(" ");
    // Derived here rather than at each use so the compact render, the full
    // render and the legend cannot drift apart. From `traceStyle` rather than
    // inline so that `CompareTrace` cannot drift from either.
    const waterStyle = channelStyle("water", {accent, holding, role});
    const cupStyle = channelStyle("cup", {accent, role});
    const planStyle = channelStyle("plan", {
        accent, dashed: planDashed, planColour: planColor
    });
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
    const pauseBands = intervalRects(pauseIntervals, box.width, box.maxT);
    const accessibilityLabel = [
        temperatureAccessibilityLabel(marks),
        ...pauseBands.map(({interval}) =>
            tracePauseSpoken(interval.reason, (interval.to - interval.from) / 1000))
    ].join(", ");
    // The water line, carried down to the floor and back, so it can be filled.
    // Built here rather than by setting `fill` on the line itself: an open
    // path fills between its endpoints and cuts the corner off the curve.
    const waterFill = waterRuns
        .map((run) => ({d: toPath(run, box), last: run[run.length - 1]}))
        .filter(({d}) => d !== "")
        .map(({d, last}, i) => `${d} L${round(box.width * (last.t / Math.max(box.maxT, 1)))} `
            + `${svgHeight} L${i === 0 ? 0 : firstX(d)} ${svgHeight} Z`)
        .join(" ");

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

    // Sized in the box's own units, so it moves with the axis rather than
    // needing its own scale.
    const bypassBox = bypass === undefined || bypassMl <= 0 || box.maxT <= 0
                      || box.maxV <= 0
        ? undefined
        : (() => {
            const boxWidth = Math.min(
                Math.max((bypassWide / box.maxT) * box.width, BYPASS_BOX_MIN),
                box.width
            );
            return {
                x: visibleMinimumRectX((bypassFrom / box.maxT) * box.width, boxWidth, box.width),
                width: boxWidth,
                y: svgHeight - ((planTop + bypassMl) / box.maxV) * svgHeight,
                height: Math.max((bypassMl / box.maxV) * svgHeight, BYPASS_BOX_MIN)
            };
          })();

    if (compact) {
        return (
            <Svg width={width} height={height} accessibilityRole="image"
                 accessibilityLabel={accessibilityLabel}>
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        strokeOpacity={planOpacity}
                        fill="none"
                        {...planStyle}
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        fill="none"
                        {...cupStyle}
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        fill="none"
                        {...waterStyle}
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
            lineTestID: `trace-temp-${i}`,
            stemTestID: `trace-temp-stem-${i}`,
            labelTestID: `trace-temp-label-${i}`
        })),
        ...(bypassMark === undefined ? [] : [{
            ...bypassMark,
            key: "bypass",
            lineTestID: "trace-temp-bypass",
            stemTestID: "trace-temp-stem-bypass",
            labelTestID: "trace-temp-label-bypass"
        }])
    ];

    const chart = (
        <Svg width={width} height={svgHeight} accessibilityRole="image"
             accessibilityLabel={accessibilityLabel}>
                <Defs>
                    <LinearGradient id={waterFillId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity={FILL_TOP} />
                        <Stop offset="1" stopColor={accent} stopOpacity={FILL_BOTTOM} />
                    </LinearGradient>
                </Defs>
                {selectionBand && (
                    <Rect
                        testID="trace-band"
                        x={selectionBand.x} y={0} width={selectionBand.width} height={svgHeight}
                        fill={palette.raised}
                    />
                )}
                {pauseBands.map(({x, width: bandWidth, interval}, i) => (
                    <Rect
                        key={`pause-${i}`}
                        testID={`trace-pause-${interval.reason}-${i}`}
                        x={x} y={0} width={bandWidth} height={svgHeight}
                        fill={PAUSE_FILL[interval.reason]}
                        fillOpacity={PAUSE_OPACITY}
                    />
                ))}
                {boundaries.map((x, i) => (
                    <Line
                        key={`gridline-${i}`}
                        testID={`trace-gridline-${i}`}
                        x1={x} y1={0} x2={x} y2={svgHeight}
                        stroke={palette.line}
                        strokeWidth={1}
                    />
                ))}
                {waterFill !== "" && (
                    <Path testID="trace-water-fill" d={waterFill} fill={`url(#${waterFillId})`}
                          stroke="none" />
                )}
                {tempDraws.map((mark) => {
                    const label = `${mark.temperature}°`;
                    const labelPosition = tempLabelX(mark.x + mark.width / 2, label, width);
                    const stemX = mark.x + mark.width / 2;
                    return (
                        <React.Fragment key={`temp-${mark.key}`}>
                            <Line
                                testID={mark.lineTestID}
                                x1={mark.x} y1={mark.y}
                                x2={mark.x + mark.width} y2={mark.y}
                                stroke={palette.dim}
                                strokeWidth={TEMP_BAR_STROKE}
                                strokeLinecap="round"
                                fill="none"
                            />
                            <Line
                                testID={mark.stemTestID}
                                x1={stemX} y1={mark.y}
                                x2={stemX} y2={mark.y + TEMP_BAR_STEM}
                                stroke={palette.dim}
                                strokeWidth={TEMP_BAR_STROKE}
                                strokeLinecap="round"
                                fill="none"
                            />
                            <SvgText
                                testID={mark.labelTestID}
                                x={labelPosition.x}
                                y={tempLabelY(mark.y)}
                                textAnchor={labelPosition.textAnchor}
                                fill={palette.dim}
                                {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                            >
                                {label}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
                {bypassBox && bypass && bypassMark === undefined && tempBand !== undefined
                 && hasSetTemperature(bypass.temperature) && (
                    (() => {
                        const label = `${bypass.temperature}°`;
                        const labelPosition = tempLabelX(
                            bypassBox.x + bypassBox.width / 2,
                            label,
                            width
                        );
                        return (
                            <SvgText
                                testID="trace-bypass-temp"
                                x={labelPosition.x}
                                y={bypassBoxLabelY(bypassBox.y, bypassBox.height, svgHeight)}
                                textAnchor={labelPosition.textAnchor}
                                fill={palette.dim}
                                {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                            >
                                {label}
                            </SvgText>
                        );
                    })()
                )}
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        strokeOpacity={planOpacity}
                        fill="none"
                        {...planStyle}
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
                        fill="none"
                        {...cupStyle}
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        fill="none"
                        {...waterStyle}
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
                    alignItems="center" gap="$3" paddingHorizontal={legendInset}>
                <TraceLegendItem colour={waterStyle.stroke} label="WATER" />
                <TraceLegendItem colour={cupStyle.stroke} label="CUP" dotted />
                {plan.length > 0 && planOpacity > 0 && (
                    <TraceLegendItem colour={planStyle.stroke} label="PLAN" dashed />
                )}
            </XStack>
        </YStack>
    );
}

/** The x a path starts at, so a fill can close back to it. */
function firstX(d: string): string {
    return d.slice(1).split(" ")[0];
}

/** One decimal, as in `toPath`. Long SVG paths are mostly noise. */
function round(n: number): number {
    return Math.round(n * 10) / 10;
}
