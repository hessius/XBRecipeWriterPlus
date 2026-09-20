/**
 * Plain-text brew summary for export into Beanconqueror under XBRW++'s name.
 *
 * The result is user-facing copy, not a debug dump, so missing stage number,
 * volume or temperature, corrupt stored rows and future firmware values are
 * rendered neutrally instead of leaking internals. The ladder is fixed-width so
 * wrapped descriptors line up in another app's plain text field.
 */
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {grinderRan, numeric, type BrewRecord, type PlanStage} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";

const WRAP_WIDTH = 72;
const DESCRIPTOR_COLUMN = 25;

function stageHead(stage: PlanStage, index: number): string {
    const stageNumber = numeric(stage.pourNumber) ? stage.pourNumber : index + 1;
    const volume = numeric(stage.volume) ? String(stage.volume) : "";
    const temperature = numeric(stage.temperature) ? String(stage.temperature) : "";
    return `Stage ${stageNumber}${volume.padStart(5)} ml`
        + `${temperature.padStart(5)}°C   `;
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
    if (stage.pauseTime > 0) parts.push(`then wait ${stage.pauseTime} s`);
    return parts;
}

function stageLine(stage: PlanStage, index: number): string {
    const head = stageHead(stage, index);
    const continuation = " ".repeat(DESCRIPTOR_COLUMN);
    const [first, ...rest] = descriptorParts(stage);
    const lines = [head + first];

    for (const part of rest) {
        const joined = `${lines[lines.length - 1]}, ${part}`;
        if (joined.length > WRAP_WIDTH) {
            lines[lines.length - 1] += ",";
            lines.push(continuation + part);
        } else {
            lines[lines.length - 1] = joined;
        }
    }

    return lines.join("\n");
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

export function brewNote(record: BrewRecord): string {
    const foot = footer(record);
    if (!Array.isArray(record.plan) || record.plan.length === 0) return foot;

    const ladder = record.plan.map((stage, index) => stageLine(stage, index)).join("\n");
    return `${ladder}\n\n${foot}`;
}
