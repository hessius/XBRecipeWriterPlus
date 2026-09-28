import {useState} from "react";

import {COMPARE_PINNED} from "@/constants/brewCopy";
import {notify} from "@/components/XbrwToast";
import {sharedBrewDatabase, useBrewHistory, type JudgementStore} from "@/hooks/useBrewHistory";
import {
    compareAxis,
    compareBrews,
    hasTrace,
    planPath,
    type BrewUnderComparison
} from "@/library/brew/compare";
import {type Box} from "@/library/brew/brewShape";

export type CompareMode = "overlay" | "separate";

type Opened = ReturnType<ReturnType<typeof useBrewHistory>["open"]>;

type ReadyComparison = {
    state: "ready";
    mode: CompareMode;
    setMode: (mode: CompareMode) => void;
    swapped: boolean;
    swap: () => void;
    subject: BrewUnderComparison;
    reference: BrewUnderComparison;
    comparison: ReturnType<typeof compareBrews>;
    axis: ReturnType<typeof compareAxis>;
    subjectPlan: string;
    referencePlan: string | undefined;
    subjectHasTrace: boolean;
    referenceHasTrace: boolean;
    traceCount: number;
    survivingTrace: BrewUnderComparison | null;
    hasChart: boolean;
    canKeepTrace: boolean;
    keepSurvivingTrace: () => void;
};

type BlockedComparison =
    | {state: "missing"}
    | {state: "same"}
    | {state: "recipe"};

export type BrewComparison = ReadyComparison | BlockedComparison;

function underComparison(opened: NonNullable<Opened>): BrewUnderComparison {
    return {
        record: opened.record,
        samples: opened.record.hasStream ? opened.samples : []
    };
}

/**
 * State and comparison setup for the compare route.
 *
 * The expensive part is opening two history rows: each `open` does synchronous
 * SQLite reads and parses the stored stream, which can be hundreds of
 * kilobytes. Like `brewRecord.tsx`, this hook resolves the ids once in a lazy
 * initializer and keeps rendering pure after that. Mode is deliberately local
 * component state, not a persisted setting, because this is a viewing choice
 * inside one comparison rather than an app preference worth a settings key.
 */
export function useBrewComparison({
    a,
    b,
    chartWidth,
    chartHeight
}: {
    a?: string;
    b?: string;
    chartWidth: number;
    chartHeight: number;
}): BrewComparison {
    const {open} = useBrewHistory();
    const [mode, setMode] = useState<CompareMode>("overlay");
    const [swapped, setSwapped] = useState(false);
    const [keptTraceIds, setKeptTraceIds] = useState<ReadonlySet<string>>(() => new Set());
    const [opened] = useState<{a: Opened; b: Opened; sameId: boolean}>(() => ({
        a: a === undefined ? null : open(a),
        b: b === undefined ? null : open(b),
        sameId: a !== undefined && b !== undefined && a === b
    }));

    if (opened.sameId) return {state: "same"};
    if (opened.a === null || opened.b === null) return {state: "missing"};
    if (opened.a.record.recipeUuid !== opened.b.record.recipeUuid) return {state: "recipe"};

    const originalA = underComparison(opened.a);
    const originalB = underComparison(opened.b);
    const subject = swapped ? originalB : originalA;
    const reference = swapped ? originalA : originalB;
    const comparison = compareBrews(subject, reference);
    const axis = compareAxis(subject, reference);
    const planBox: Box = {
        width: chartWidth,
        height: chartHeight,
        maxT: axis.maxT,
        maxV: axis.maxV
    };
    const subjectPlan = planPath(subject.record, planBox);
    const referencePlan = comparison.drift.grade === "shape"
        ? planPath(reference.record, planBox)
        : undefined;
    const subjectHasTrace = hasTrace(subject);
    const referenceHasTrace = hasTrace(reference);
    const traceCount = (subjectHasTrace ? 1 : 0) + (referenceHasTrace ? 1 : 0);
    const survivingTrace = traceCount === 1
        ? subjectHasTrace ? subject : reference
        : null;
    const survivingId = survivingTrace?.record.id;
    const canKeepTrace = survivingId !== undefined && !keptTraceIds.has(survivingId);

    function keepSurvivingTrace(): void {
        if (survivingId === undefined) return;
        (sharedBrewDatabase() as Partial<JudgementStore>).setPinned?.(survivingId, true);
        setKeptTraceIds((was) => new Set(was).add(survivingId));
        notify({tone: "success", message: COMPARE_PINNED});
    }

    return {
        state: "ready",
        mode,
        setMode,
        swapped,
        swap: () => setSwapped((was) => !was),
        subject,
        reference,
        comparison,
        axis,
        subjectPlan,
        referencePlan,
        subjectHasTrace,
        referenceHasTrace,
        traceCount,
        survivingTrace,
        hasChart: traceCount > 0,
        canKeepTrace,
        keepSurvivingTrace
    };
}
