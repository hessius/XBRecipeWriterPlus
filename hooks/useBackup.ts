import * as DocumentPicker from "expo-document-picker";
import {File, Paths} from "expo-file-system";
import * as Sharing from "expo-sharing";

import {buildBackup, parseBackup, type BackupSettings, type ParseResult}
    from "@/library/backup";
import type Recipe from "@/library/Recipe";

export type ExportOutcome = {ok: true} | {ok: false; reason: string};

export type PickOutcome =
    | {cancelled: true}
    | {cancelled: false; result: ParseResult};

export type BackupActions = {
    exportBackup: (recipes: readonly Recipe[], settings: BackupSettings, appVersion?: string)
        => Promise<ExportOutcome>;
    pickBackup: () => Promise<PickOutcome>;
};

function fileNameForToday(): string {
    return `xbrw-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Best-effort removal of a file the user was never given.
 *
 * A failed export must not leave a truncated backup lying around: the next
 * export would either trip over it or, worse, a user browsing the cache would
 * find a file that looks like a backup and is not a whole one. Nothing useful
 * can be done if the deletion itself fails, and saying so would replace the real
 * failure with a less interesting one, so it is swallowed deliberately.
 */
function discard(file: File): void {
    try {
        file.delete();
    } catch {
        // Deliberately ignored; see above.
    }
}

/**
 * A failure the user can act on, rather than one shape for three problems.
 *
 * "No file browser could be opened", "nothing came back" and "the file itself
 * would not read" call for different next moves, and collapsing them into one
 * sentence leaves the user retrying the one thing that cannot work.
 */
function unreadable(reason: string): PickOutcome {
    return {cancelled: false, result: {ok: false, reason}};
}

/**
 * Writing a backup out and reading one back in.
 *
 * The file and share-sheet side, kept out of the screen for the reason
 * useRecipeEditor and useRecipeLibrary exist: a route file should stay close to
 * layout. Every function answers a result rather than throwing, so the screen
 * has one shape to handle and no failure can reach the user as a crash.
 */
export function useBackup(): BackupActions {
    async function exportBackup(
        recipes: readonly Recipe[],
        settings: BackupSettings,
        appVersion?: string
    ): Promise<ExportOutcome> {
        // Checked before anything is written, so a device that cannot share does
        // not leave a file behind that the user was never offered.
        const canShare = await Sharing.isAvailableAsync().catch(() => false);
        if (!canShare) {
            return {ok: false, reason: "This device cannot share files, so the backup was not made."};
        }

        // The cache directory, not the document one: this file exists only long
        // enough to be handed to the share sheet, and the user's chosen
        // destination is the real copy. Left in the document directory it would
        // be a permanent second copy of the whole library, swept into the
        // device's own cloud backup, that the app never shows and never prunes.
        //
        // create()/write() are synchronous in this SDK's File API and throw
        // rather than reject, so they share one try/catch with no `await`.
        // overwrite is required: create() throws on an existing path, and the
        // name is per-day, so without it the second export of any day fails and
        // blames the device for a file this app wrote an hour ago.
        const file = new File(Paths.cache, fileNameForToday());
        try {
            file.create({overwrite: true});
            file.write(buildBackup(recipes, settings, appVersion));
        } catch {
            discard(file);
            return {ok: false, reason: "The backup could not be written to this device."};
        }

        try {
            await Sharing.shareAsync(file.uri, {
                mimeType: "application/json",
                dialogTitle: "Back up your recipes",
                UTI: "public.json"
            });
        } catch {
            discard(file);
            return {ok: false, reason: "The backup was made but could not be shared."};
        }

        // `shareAsync` resolves once the share sheet has finished with the file,
        // so the copy the user chose to keep has already been written elsewhere
        // and this one has no further job. Discarding only on the failure paths
        // meant every successful export left a full copy of the library behind
        // -- and because the name carries the date, a new one each day, none of
        // which the app ever showed or pruned.
        discard(file);
        return {ok: true};
    }

    async function pickBackup(): Promise<PickOutcome> {
        let picked;
        try {
            picked = await DocumentPicker.getDocumentAsync({
                // Not restricted to application/json: a backup that has been
                // through mail or a chat app frequently arrives typed as
                // text/plain or octet-stream, and a picker that greys it out
                // looks like the app rejecting a file it can read perfectly.
                type: "*/*",
                copyToCacheDirectory: true
            });
        } catch {
            return unreadable("No file browser could be opened on this device.");
        }

        if (picked.canceled) return {cancelled: true};

        const uri = picked.assets?.[0]?.uri;
        if (uri === undefined) {
            return unreadable("No file came back from the file browser.");
        }

        // `copyToCacheDirectory` means the picker has already made an app-owned
        // copy of whatever was chosen, and that copy is ours to clean up. Held
        // in a variable so both exits can reach it: a restore that failed to
        // parse leaves a complete backup file behind just as surely as one that
        // succeeded, and a user restoring repeatedly accumulates them.
        const copy = new File(uri);
        try {
            const text = await copy.text();
            discard(copy);
            return {cancelled: false, result: parseBackup(text)};
        } catch {
            discard(copy);
            return unreadable("That file could not be read.");
        }
    }

    return {exportBackup, pickBackup};
}
