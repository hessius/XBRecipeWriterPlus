import {resolveAccent} from "./accent";
import type Pour from "./Pour";
import {POUR_PATTERN} from "./Pour";
import Recipe, {CUP_TYPE, DEFAULT_GRIND_SIZE} from "./Recipe";

/**
 * The recipe as xBloom's cloud wants it.
 *
 * This is the exact inverse of what `XBloomRecipe.getRecipe()` reads, and the
 * two files have to be changed together. The names are xBloom's, not ours;
 * `grandWater` in particular is the *ratio*, not a water volume.
 *
 * The auth boilerplate (`memberId`, `token`, `skey`, ...) is deliberately not
 * here. It belongs to the mint function, which holds the credentials; the app
 * never sees it.
 */
export type SharePayload = {
    theName: string;
    theColor: string;
    theSubsetId: number;
    dose: number;
    grandWater: number;
    grinderSize: number;
    isSetGrinderSize: number;
    rpm: number;
    cupType: number;
    bypassTemp: number;
    bypassVolume: number;
    subSetType: number;
    appPlace: number[];
    isShortcuts: number;
    isEnableBypassWater: number;
    adaptedModel: number;
    pourCount: number;
    pourDataJSONStr: string;
};

/**
 * The host xBloom serves share links from.
 *
 * The minted URL is `https://share-h5.xbloom.com/?id=<opaque token>`. Pinned
 * because a stored share URL is handed to the system share sheet verbatim, so
 * an untrusted one is a link the app would vouch for without ever having asked
 * the mint service for it. The *importer* deliberately accepts any host, which
 * is a different question: there it only ever extracts the id and calls
 * xBloom's own API with it.
 */
export const XBLOOM_SHARE_HOST = "share-h5.xbloom.com";

/** Why a recipe cannot be shared. Empty when it can. */
export type ShareBlockReason = "noPours" | "volumeMismatch" | "incomplete";

/**
 * Cloud cup types are 1-based and reordered, not shifted.
 *
 * Local `OMNI` is 2 and cloud Omni is 2 by coincidence; local `OTHER` is 1 and
 * cloud Other is 3. A `+1` would silently turn every Other recipe into an Omni
 * one, which changes overflow protection.
 */
function cloudCupType(cupType: number): number {
    switch (cupType) {
        case CUP_TYPE.XPOD:  return 1;
        case CUP_TYPE.OMNI:  return 2;
        case CUP_TYPE.OTHER: return 3;
        case CUP_TYPE.TEA:   return 4;
        default:             return 1;
    }
}

/** Reordered the same way, and for the same reason. See `XBloomRecipe`. */
function cloudPattern(pattern: number): number {
    switch (pattern) {
        case POUR_PATTERN.CENTERED: return 1;
        case POUR_PATTERN.SPIRAL:   return 2;
        case POUR_PATTERN.CIRCULAR: return 3;
        default:                    return 3;
    }
}

/** 1 is on, 2 is off. There is no 0 on this API. */
function enabled(on: boolean): number {
    return on ? 1 : 2;
}

function cloudPour(pour: Pour, index: number) {
    return {
        theName:                 index === 0 ? "Bloom" : `Pour ${index + 1}`,
        volume:                  pour.volume,
        temperature:             pour.temperature,
        // The importer reads this as `flowRate * 10`, so the wire unit is ml/s
        // and ours is tenths. Skipping the divide asks the machine for 35 ml/s.
        flowRate:                pour.flowRate / 10,
        pattern:                 cloudPattern(pour.pourPattern),
        pausing:                 pour.pauseTime,
        isEnableVibrationBefore: enabled(pour.getAgitationBefore()),
        isEnableVibrationAfter:  enabled(pour.getAgitationAfter())
    };
}

/**
 * Build the payload for a recipe.
 *
 * Tea is a first-class case rather than a patch at the end: the machine ignores
 * the grinder for tea, and sending a live grind size with `cupType: 4` produces
 * a recipe the official app renders with a grinder setting the machine will not
 * honour.
 */
export function buildSharePayload(recipe: Recipe): SharePayload {
    const tea = recipe.cupType === CUP_TYPE.TEA;
    return {
        theName:             recipe.displayName(),
        theColor:            resolveAccent(recipe),
        theSubsetId:         0,
        dose:                recipe.dosage,
        // Not a volume. xBloom stores the ratio under this name.
        grandWater:          recipe.ratio,
        grinderSize:         tea ? DEFAULT_GRIND_SIZE : recipe.grindSize,
        isSetGrinderSize:    tea ? 2 : enabled(recipe.grinder),
        rpm:                 tea ? 60 : recipe.grindRPM,
        cupType:             cloudCupType(recipe.cupType),
        bypassTemp:          85,
        // Cosmetic while `isEnableBypassWater` is 2, but 0 is the honest value.
        bypassVolume:        0,
        subSetType:          2,
        appPlace:            [4],
        isShortcuts:         2,
        isEnableBypassWater: 2,
        // Load-bearing: this value partitions the account's library, and the
        // mint function looks the new row up in the `adaptedModel: 1` list.
        adaptedModel:        1,
        pourCount:           recipe.pours.length,
        pourDataJSONStr:     JSON.stringify(recipe.pours.map(cloudPour))
    };
}

/**
 * A stable string for a payload, used to decide whether a recipe still matches
 * the link that was minted for it.
 *
 * Key-sorted, because `JSON.stringify` follows insertion order and a payload
 * rebuilt through a spread would otherwise compare unequal to itself.
 *
 * Note what is *not* in here: `createTimeStamp`. The mint function adds it. If
 * it were part of the payload the snapshot would differ on every press and
 * every share would mint a duplicate recipe in the service account.
 */
export function canonicalSnapshot(payload: SharePayload): string {
    const keys = Object.keys(payload).sort();
    return JSON.stringify(payload, keys);
}

/**
 * Whether this recipe can be shared at all.
 *
 * These are the same invariants the machine enforces. Minting a recipe that
 * fails one of them produces a link that opens to something unbrewable, and the
 * link cannot be withdrawn afterwards.
 */
export function shareBlockReason(recipe: Recipe): ShareBlockReason | null {
    if (recipe.pours.length === 0) {
        return "noPours";
    }
    if (recipe.dosage <= 0 || recipe.ratio <= 0) {
        return "incomplete";
    }
    if (!recipe.isPourVolumeValid()) {
        return "volumeMismatch";
    }
    return null;
}
