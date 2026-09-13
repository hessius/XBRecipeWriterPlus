import type {BrewSample} from "./BrewRecord";
import type {StoredBrew} from "../BrewDatabase";

/** Bumped whenever the exported shape changes in a way a reader must notice. */
const EXPORT_VERSION = 1;

/**
 * A brew as a file.
 *
 * Times are carried twice — milliseconds for a program, ISO for a person who
 * opens the file in a text editor — and the whole thing is versioned, because
 * something else will read these one day and a file that cannot say what shape
 * it is in is a file nobody can safely parse.
 *
 * Keys are stable. Do not rename them without bumping EXPORT_VERSION.
 *
 * Shape:
 * ```json
 * {
 *   "version": 1,
 *   "brew": {
 *     "id": "...",
 *     "recipeUuid": "...",
 *     "recipeName": "Ethiopia Guji",
 *     "accent": "#C86A3B",
 *     "startedAt": 1725349320000,
 *     "startedAtISO": "2026-09-03T07:42:00.000Z",
 *     "endedAt": 1725349560000,
 *     "endedAtISO": "2026-09-03T07:46:00.000Z",
 *     "outcome": "done",
 *     "failure": null,
 *     "pours": 5,
 *     "waterTotal": 250,
 *     "cupTotal": 244,
 *     "heldSeconds": 14,
 *     "hasStream": true
 *   },
 *   "samples": [
 *     {"at": 0, "water": 0, "cup": 0, "pour": 1}
 *   ]
 * }
 * ```
 */
export function toExportJson(record: StoredBrew, samples: BrewSample[]): string {
    return JSON.stringify({
        version: EXPORT_VERSION,
        brew: {
            ...record,
            startedAtISO: new Date(record.startedAt).toISOString(),
            endedAtISO:   new Date(record.endedAt).toISOString()
        },
        samples
    });
}

/**
 * Returns `"ethiopia-guji-2026-09-03.json"`.
 *
 * A name of "···" would slug to nothing and produce a hidden file (".json"),
 * so the fallback is "brew".
 */
export function brewFilename(
    record: Pick<StoredBrew, "recipeName" | "startedAt">,
    extension: "json" | "png"
): string {
    const slug = record.recipeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const date = new Date(record.startedAt).toISOString().slice(0, 10);
    return `${slug === "" ? "brew" : slug}-${date}.${extension}`;
}
