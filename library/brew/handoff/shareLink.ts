import {File as FSFile, Paths} from "expo-file-system";
import * as Sharing from "expo-sharing";

import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * Hands a generated Beanconqueror handoff URL to the share sheet as a file.
 *
 * A debugging aid, and a temporary one: it exists so sample links can be given
 * to Beanconqueror's maintainer for a testing document. It is deliberately not
 * a second way to send a brew — nothing here marks a record sent, because
 * writing a link to a file is not handing the brew over.
 *
 * A file rather than the clipboard because of the size. A batch link runs to
 * tens of thousands of characters and may reach `MAX_BATCH_URL_CHARS`, which
 * is 131,072; that is a miserable thing to paste into a message and an
 * unremarkable thing to attach to one.
 */

/**
 * The file holds the bare URL and nothing else.
 *
 * No header, no byte count, no commentary: whoever receives it should be able
 * to click or copy the whole file without first having to strip a preamble,
 * and a stray newline in the middle of a base64url payload is a corrupt
 * import. Everything a reader needs to tell one sample from another is in the
 * filename instead.
 */
export async function shareHandoffLink(url: string, filename: string): Promise<void> {
    try {
        // Checked before writing, as useBrewExport does, so we never leave a
        // file in the cache that nothing was ever going to read.
        if (!(await Sharing.isAvailableAsync())) return;
        // The cache directory is writable and the system may reclaim it when
        // space is short, which is exactly the lifetime a sample file wants.
        const file = new FSFile(Paths.cache, filename);
        file.write(url);
        await Sharing.shareAsync(file.uri, {
            mimeType: "text/plain",
            // iOS decides what the share sheet may offer from the UTI rather
            // than the MIME type; without it there is no "Save to Files".
            UTI:         "public.plain-text",
            dialogTitle: filename
        });
    } catch {
        // A share sheet can be cancelled, and a cancel is not a failure.
    }
}

/** `handoff-ethiopia-guji-2026-10-06.txt`, for one brew. */
export function handoffLinkFilename(
    record: Pick<StoredBrew, "recipeName" | "startedAt">
): string {
    return `handoff-${slug(record.recipeName)}-${day(record.startedAt)}.txt`;
}

/** `handoff-batch-7-brews-2026-10-06.txt`, for a selection. */
export function handoffBatchFilename(count: number, at: number = Date.now()): string {
    const brews = count === 1 ? "1-brew" : `${count}-brews`;
    return `handoff-batch-${brews}-${day(at)}.txt`;
}

function slug(name: string): string {
    const slugged = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slugged === "" ? "brew" : slugged;
}

function day(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}
