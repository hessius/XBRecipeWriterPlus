/**
 * Request validation for the mint function.
 *
 * This deliberately re-states the payload shape rather than importing
 * `library/shareLink.ts`. That module imports `Recipe`, which imports `NFC`,
 * which imports the native NFC package — a module that cannot exist
 * in a serverless bundle. The duplication is the price of that boundary, and it
 * has a second benefit: the function does not trust the client's idea of what a
 * valid recipe is.
 *
 * Every limit here is a real machine limit, not a guess. A payload that passes
 * this and still fails upstream is a bug worth knowing about; a payload that
 * fails here never reaches xBloom's servers under our account's name.
 */

/** Above this, refuse. Even a 31-pour recipe is well under 8 kB. */
const MAX_BYTES = 8_192;

/**
 * The card writes the pour count as `length << 3` in a single byte, so 31 is
 * the last count that fits, and the app allows every one of them. See
 * `library/cardLimits.ts` — the two numbers have to agree or a recipe this app
 * can write to a card is a recipe it cannot share.
 */
const MAX_POURS = 31;

const NUMBER_RANGES: Record<string, [number, number]> = {
    dose:                [1, 100],
    // The ratio, not a volume, and the bounds are the app's own RATIO limits
    // (library/cardLimits.ts). Anything tighter rejects tea: three 90 ml
    // steeps against a 5 g dose is a ratio of 54.
    grandWater:          [5, 100],
    // 81 is the grinder-off sentinel and a legitimate wire value: the importer
    // reads it back as "grinder disabled". Excluding it makes every
    // grinder-off recipe unshareable.
    grinderSize:         [0, 81],
    isSetGrinderSize:    [1, 2],
    rpm:                 [60, 120],
    cupType:             [1, 4],
    bypassTemp:          [0, 100],
    bypassVolume:        [0, 500],
    subSetType:          [0, 10],
    theSubsetId:         [0, 10_000_000],
    isShortcuts:         [1, 2],
    isEnableBypassWater: [1, 2],
    adaptedModel:        [1, 2],
    // 31, because the card writes the count as `length << 3` in one byte and
    // the app therefore allows that many. See library/cardLimits.ts.
    pourCount:           [1, 31]
};

const POUR_RANGES: Record<string, [number, number]> = {
    volume:                  [0, 1000],
    temperature:             [0, 100],
    flowRate:                [0, 10],
    pattern:                 [1, 3],
    pausing:                 [0, 3600],
    isEnableVibrationBefore: [1, 2],
    isEnableVibrationAfter:  [1, 2]
};

function isFinite_(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Returns a human-readable reason, or `null` when the payload is acceptable.
 *
 * A string rather than a thrown error so the handler decides the status code
 * and so the reason is trivially loggable without a stack.
 */
export function validateSharePayload(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return "payload must be an object";
    }
    const p = payload as Record<string, unknown>;

    if (JSON.stringify(p).length > MAX_BYTES) {
        return "payload is too large";
    }

    const name = p.theName;
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 120) {
        return "theName must be a non-empty string of at most 120 characters";
    }
    if (typeof p.theColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(p.theColor)) {
        return "theColor must be a #RRGGBB colour";
    }
    if (!Array.isArray(p.appPlace) || p.appPlace.some((v) => !isFinite_(v))) {
        return "appPlace must be an array of numbers";
    }

    for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
        const value = p[key];
        if (!isFinite_(value)) {
            return `${key} must be a finite number`;
        }
        if (value < min || value > max) {
            return `${key} is out of range`;
        }
    }

    if (typeof p.pourDataJSONStr !== "string") {
        return "pourDataJSONStr must encode an array of 1 to " + MAX_POURS + " pours";
    }
    let pours: unknown;
    try {
        pours = JSON.parse(p.pourDataJSONStr);
    } catch {
        return "pourDataJSONStr must encode an array of 1 to " + MAX_POURS + " pours";
    }
    if (!Array.isArray(pours) || pours.length < 1 || pours.length > MAX_POURS) {
        return "pourDataJSONStr must encode an array of 1 to " + MAX_POURS + " pours";
    }
    if (pours.length !== p.pourCount) {
        return "pourCount must match the number of pours";
    }

    for (let i = 0; i < pours.length; i++) {
        const pour = pours[i];
        if (typeof pour !== "object" || pour === null || Array.isArray(pour)) {
            return `pour ${i + 1}: must be an object`;
        }
        const q = pour as Record<string, unknown>;
        if (typeof q.theName !== "string" || q.theName.length > 60) {
            return `pour ${i + 1}: theName must be a string of at most 60 characters`;
        }
        for (const [key, [min, max]] of Object.entries(POUR_RANGES)) {
            const value = q[key];
            if (!isFinite_(value)) {
                return `pour ${i + 1}: ${key} must be a finite number`;
            }
            if (value < min || value > max) {
                return `pour ${i + 1}: ${key} is out of range`;
            }
        }
    }

    return null;
}
