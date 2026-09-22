/**
 * Plain-text brew summary for export into Beanconqueror under XBRW++'s name.
 *
 * The result is user-facing copy, not a debug dump, so missing stage number,
 * volume or temperature, corrupt stored rows and future firmware values are
 * rendered neutrally instead of leaking internals. Each stage stays on one
 * compact line because Beanconqueror once rendered notes in a narrow
 * no-wrap <pre>, where aligned columns overflowed and left continuation
 * indents stranded.
 */
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {grinderRan, numeric, type BrewRecord, type PlanStage} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";
import type {BackfilledField} from "@/library/brew/handoff/backfill";

function stageHead(stage: PlanStage, index: number): string[] {
    const stageNumber = numeric(stage.pourNumber) ? stage.pourNumber : index + 1;
    // A missing volume or temperature is dropped rather than printed as a bare
    // unit: "#1 ·  ml" reads as a bug, where "#1" simply reads as unrecorded.
    return [
        `#${stageNumber}`,
        ...(numeric(stage.volume) ? [`${stage.volume} ml`] : []),
        ...(numeric(stage.temperature) ? [`${stage.temperature}°C`] : [])
    ];
}

function agitationPhrase(agitation: number): string | undefined {
    switch (agitation) {
        case AGITATION.BEFORE_ON_AFTER_OFF:
            return "agitate before";
        case AGITATION.BEFORE_OFF_AFTER_ON:
            return "agitate after";
        case AGITATION.BEFORE_ON_AFTER_ON:
            return "agitate before and after";
        default:
            return undefined;
    }
}

function patternWord(pattern: number): string {
    switch (pattern) {
        case POUR_PATTERN.CENTERED:
            return "centred";
        case POUR_PATTERN.CIRCULAR:
            return "circular";
        case POUR_PATTERN.SPIRAL:
            return "spiral";
        default:
            return "pour";
    }
}

function descriptorParts(stage: PlanStage): string[] {
    const parts = [patternWord(stage.pourPattern)];
    const agitation = agitationPhrase(stage.agitation);
    if (agitation !== undefined) parts.push(agitation);
    if (stage.pauseTime > 0) parts.push(`wait ${stage.pauseTime} s`);
    return parts;
}

function stageLine(stage: PlanStage, index: number): string {
    return [...stageHead(stage, index), ...descriptorParts(stage)].join(" · ");
}

function numberPart(value: unknown, label: string): string | undefined {
    if (!numeric(value)) return undefined;
    return `${value} ${label}`;
}

function footer(record: BrewRecord): string {
    const parts = [
        numberPart(record.dose, "g"),
        numeric(record.ratio)
            ? `1:${record.ratio}`
            : undefined,
        grinderRan(record) ? `grind ${record.grindSize}` : undefined,
        numeric(record.pours) && record.pours > 0
            ? `${record.pours} ${record.pours === 1 ? "stage" : "stages"}`
            : undefined,
        DEVICE_NAME
    ];

    return parts.filter((part): part is string => part !== undefined).join(" · ");
}

function list(items: string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function backfillLine(filled: BackfilledField[]): string | undefined {
    const labels: string[] = [];
    if (filled.includes("dose")) labels.push("dose");
    if (filled.includes("ratio")) labels.push("ratio");
    // Grind size, RPM and whether the grinder ran are one grinder setting to a user.
    if (filled.some((field) => (
        field === "grindSize" || field === "grinderRpm" || field === "grinderUsed"
    ))) {
        labels.push("grinder");
    }
    if (labels.length === 0) return undefined;
    const subject = list(labels);
    return `${subject[0].toUpperCase()}${subject.slice(1)} read from the recipe, not this recording.`;
}

/**
 * What the user typed, first and clamped.
 *
 * First because a note the app wrote about its own stages is context for a
 * verdict somebody typed, not the other way round. Clamped because the brew
 * note field has no ceiling of its own, while the reader at the other end
 * refuses a note over its own limit outright -- an unclamped novel would not
 * arrive truncated, it would fail the whole hand-off.
 */
export const MAX_CARRIED_NOTE = 4000;

function typedNote(record: BrewRecord): string | undefined {
    const typed = (record.note ?? "").trim();
    return typed === "" ? undefined : typed.slice(0, MAX_CARRIED_NOTE);
}

/**
 * The recipe's name, heading the stages it produced.
 *
 * Beanconqueror files a brew under a bean and a preparation method, neither of
 * which is the recipe: two brews of the same beans on the same machine are
 * indistinguishable in a list without it. The name goes above the stages
 * rather than in the footer because it is what the stages are of, and a reader
 * scanning down wants to know that before reading them.
 */
function recipeHeading(record: BrewRecord): string | undefined {
    const name = (record.recipeName ?? "").trim();
    return name === "" ? undefined : name;
}

export function brewNote(record: BrewRecord, backfilled: BackfilledField[] = []): string {
    const foot = footer(record);
    const source = backfillLine(backfilled);
    const footerWithSource = source === undefined ? foot : `${foot}\n${source}`;
    const typed = typedNote(record);
    const heading = recipeHeading(record);
    const stages = !Array.isArray(record.plan) || record.plan.length === 0
        ? undefined
        : record.plan.map((stage, index) => stageLine(stage, index)).join("\n");
    // The heading belongs to the stages, so it is dropped with them: a lone
    // name above a footer would look like a section that had lost its contents.
    const body = stages === undefined
        ? footerWithSource
        : [heading, stages].filter((part) => part !== undefined).join("\n")
            + `\n\n${footerWithSource}`;
    return typed === undefined ? body : `${typed}\n\n${body}`;
}
