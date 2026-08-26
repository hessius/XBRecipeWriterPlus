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

        // create()/write() are synchronous in this SDK's File API and throw
        // rather than reject, so they share one try/catch with no `await`.
        const file = new File(Paths.document, fileNameForToday());
        try {
            file.create();
            file.write(buildBackup(recipes, settings, appVersion));
        } catch {
            return {ok: false, reason: "The backup could not be written to this device."};
        }

        try {
            await Sharing.shareAsync(file.uri, {
                mimeType: "application/json",
                dialogTitle: "Back up your recipes",
                UTI: "public.json"
            });
        } catch {
            return {ok: false, reason: "The backup was made but could not be shared."};
        }

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
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }

        if (picked.canceled) return {cancelled: true};

        const uri = picked.assets?.[0]?.uri;
        if (uri === undefined) {
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }

        try {
            const text = await new File(uri).text();
            return {cancelled: false, result: parseBackup(text)};
        } catch {
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }
    }

    return {exportBackup, pickBackup};
}
