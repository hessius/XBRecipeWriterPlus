import Pour, {AGITATION} from "@/library/Pour";
import {grinderRan, type BrewRecord, type PlanStage} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";

const WRAP_WIDTH = 72;
const DESCRIPTOR_COLUMN = 25;

function stageHead(stage: PlanStage, index: number): string {
    const stageNumber = Number.isFinite(stage.pourNumber) ? stage.pourNumber : index + 1;
    return `Stage ${stageNumber}${String(stage.volume).padStart(5)} ml`
        + `${String(stage.temperature).padStart(5)}°C   `;
}

function agitationPhrase(agitation: number): string | undefined {
    switch (agitation < 0 ? AGITATION.ALL_OFF : agitation) {
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

function descriptorParts(stage: PlanStage): string[] {
    const parts = [Pour.getPourPatternText(stage.pourPattern).toLowerCase()];
    const agitation = agitationPhrase(stage.agitation);
    if (agitation !== undefined) parts.push(agitation);
    if (stage.pauseTime > 0) parts.push(`then wait ${stage.pauseTime} s`);
    return parts;
}

function stageLine(stage: PlanStage, index: number): string {
    const head = stageHead(stage, index);
    const continuation = " ".repeat(DESCRIPTOR_COLUMN);
    const lines = [head + descriptorParts(stage)[0]];

    for (const part of descriptorParts(stage).slice(1)) {
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

function numberPart(value: number | undefined, label: string): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return `${value} ${label}`;
}

function footer(record: BrewRecord): string {
    const parts = [
        numberPart(record.dose, "g"),
        typeof record.ratio === "number" && Number.isFinite(record.ratio)
            ? `1:${record.ratio}`
            : undefined,
        grinderRan(record) ? `grind ${record.grindSize}` : undefined,
        typeof record.pours === "number" && Number.isFinite(record.pours) && record.pours > 0
            ? `${record.pours} ${record.pours === 1 ? "stage" : "stages"}`
            : undefined,
        DEVICE_NAME
    ];

    return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function brewNote(record: BrewRecord): string {
    const foot = footer(record);
    if (record.plan === undefined) return foot;

    const ladder = record.plan.map((stage, index) => stageLine(stage, index)).join("\n");
    return `${ladder}\n\n${foot}`;
}
