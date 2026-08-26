import {AGITATION, POUR_PATTERN} from "./Pour";
import Recipe from "./Recipe";

/**
 * Whether a recipe can be written to a card, and why not.
 *
 * The single authority. Balance alone was the old test, and it is not enough:
 * `autoFixPourVolumes` will happily balance a one-stage recipe at 3100 ml, which
 * satisfies the sum and then goes into `Recipe.getData()` as one byte. Every
 * field written to the card has a range, and a recipe can reach this point from
 * an import, a restore or Auto fix without ever passing a stepper that would
 * have clamped it.
 *
 * Returns prose, in the order a reader would meet the fields on screen, and
 * collects every problem rather than stopping at the first — a recipe with two
 * bad fields should not have to be fixed twice to learn that.
 */

/** Inclusive bounds for one field, in the units the model stores. */
type Range = {min: number; max: number};

const RATIO: Range = {min: 5, max: 100};
const GRIND_SIZE: Range = {min: 40, max: 80};
const GRIND_RPM: Range = {min: 60, max: 120};
/** Exported for the test that keeps `library/units` in step with the card. */
export const TEMPERATURE: Range = {min: 39, max: 99};
/** Tenths of a millilitre per second: the byte 30 means 3.0 ml/s. */
const FLOW_RATE: Range = {min: 30, max: 35};
/** Derived from POUR_PATTERN enum: CENTERED=0, CIRCULAR=1, SPIRAL=2. */
const POUR_PATTERN_RANGE: Range = {
    min: Math.min(...Object.values(POUR_PATTERN)),
    max: Math.max(...Object.values(POUR_PATTERN)),
};
/** Derived from AGITATION enum: ALL_OFF=0 ... BEFORE_ON_AFTER_ON=3. */
const AGITATION_RANGE: Range = {
    min: Math.min(...Object.values(AGITATION)),
    max: Math.max(...Object.values(AGITATION)),
};

/**
 * The pour count is written as `pours.length << 3` in a single byte, so 31 is
 * the last count that does not overflow it.
 */
const MAX_POURS = 31;
/** The editor stops adding tea stages at three, and the card agrees. */
const MAX_TEA_POURS = 3;

function outside(value: number, range: Range): boolean {
    return !Number.isFinite(value) || value < range.min || value > range.max;
}

/**
 * Appends an integer-check problem if value is not a whole number.
 * Only called after outside() has already passed — a value within range but
 * fractional would be silently truncated by the card's byte encoding.
 */
function checkInteger(value: number, rangeMessage: string, problems: string[]): void {
    if (!Number.isInteger(value)) {
        problems.push(`${rangeMessage} It has to be a whole number.`);
    }
}

export function cardWriteProblems(recipe: Recipe): string[] {
    const problems: string[] = [];
    const tea = recipe.isTea();

    const maxDose = tea ? 10 : 31;
    if (outside(recipe.dosage, {min: 1, max: maxDose})) {
        problems.push(`The dose is ${recipe.dosage} g. The most is ${maxDose} g.`);
    }

    if (outside(recipe.ratio, RATIO)) {
        problems.push(`The ratio is 1:${recipe.ratio}. The range is 1:${RATIO.min}-1:${RATIO.max}.`);
    } else if (!Number.isInteger(recipe.ratio)) {
        // The card holds a whole number, and a half would be silently truncated.
        problems.push(`The ratio is 1:${recipe.ratio}. It has to be a whole number.`);
    }

    // Only when the grinder is on, and never on tea: a tea card always writes
    // the default grind size regardless of what the model holds.
    if (recipe.grinder && !tea) {
        const grindSizeMsg = `The grind size is ${recipe.grindSize}. The range is ${GRIND_SIZE.min}-${GRIND_SIZE.max}.`;
        if (outside(recipe.grindSize, GRIND_SIZE)) {
            problems.push(grindSizeMsg);
        } else {
            checkInteger(recipe.grindSize, grindSizeMsg, problems);
        }
        const grindRPMMsg = `The grind speed is ${recipe.grindRPM} rpm. The range is ${GRIND_RPM.min}-${GRIND_RPM.max} rpm.`;
        if (outside(recipe.grindRPM, GRIND_RPM)) {
            problems.push(grindRPMMsg);
        } else {
            checkInteger(recipe.grindRPM, grindRPMMsg, problems);
        }
    }

    const maxPours = tea ? MAX_TEA_POURS : MAX_POURS;
    if (recipe.pours.length < 1) {
        problems.push("The recipe has no stages.");
    } else if (recipe.pours.length > maxPours) {
        problems.push(`The recipe has ${recipe.pours.length} stages. The most is ${maxPours}.`);
    }

    const maxVolume = tea ? 90 : 240;
    const maxPause = tea ? 360 : 59;

    recipe.pours.forEach((pour, index) => {
        const stage = index + 1;

        const volMsg = `Stage ${stage} pours ${pour.volume} ml. The most is ${maxVolume} ml.`;
        if (outside(pour.volume, {min: 1, max: maxVolume})) {
            problems.push(volMsg);
        } else {
            checkInteger(pour.volume, volMsg, problems);
        }

        const tempMsg =
            `Stage ${stage} brews at ${pour.temperature} C. ` +
            `The range is ${TEMPERATURE.min}-${TEMPERATURE.max} C.`;
        if (outside(pour.temperature, TEMPERATURE)) {
            problems.push(tempMsg);
        } else {
            checkInteger(pour.temperature, tempMsg, problems);
        }

        const flowMsg =
            `Stage ${stage} flows at ${pour.flowRate / 10} ml/s. ` +
            `The range is ${FLOW_RATE.min / 10}-${FLOW_RATE.max / 10} ml/s.`;
        if (outside(pour.flowRate, FLOW_RATE)) {
            problems.push(flowMsg);
        } else {
            checkInteger(pour.flowRate, flowMsg, problems);
        }

        const pauseMsg = `Stage ${stage} waits ${pour.pauseTime} s. The most is ${maxPause} s.`;
        if (outside(pour.pauseTime, {min: 0, max: maxPause})) {
            problems.push(pauseMsg);
        } else {
            checkInteger(pour.pauseTime, pauseMsg, problems);
        }

        if (outside(pour.pourPattern, POUR_PATTERN_RANGE)) {
            problems.push(
                `Stage ${stage} uses pour pattern ${pour.pourPattern}. ` +
                `The range is ${POUR_PATTERN_RANGE.min}-${POUR_PATTERN_RANGE.max}.`
            );
        }
        if (outside(pour.agitation, AGITATION_RANGE)) {
            problems.push(
                `Stage ${stage} uses agitation ${pour.agitation}. ` +
                `The range is ${AGITATION_RANGE.min}-${AGITATION_RANGE.max}.`
            );
        }
    });

    // Last, because it is a property of the whole recipe rather than one field,
    // and because a reader who has just been told a stage is out of range does
    // not also need to be told the sum is therefore wrong first.
    if (!recipe.isPourVolumeValid()) {
        problems.push(
            `The stages pour ${recipe.getPourTotalVolume()} ml, ` +
            `but the dose and ratio ask for ${recipe.getTotalVolume()} ml.`
        );
    }

    return problems;
}

/** Whether the card can be written at all. */
export function canWriteToCard(recipe: Recipe): boolean {
    return cardWriteProblems(recipe).length === 0;
}
