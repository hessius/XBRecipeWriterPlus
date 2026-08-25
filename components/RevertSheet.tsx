import React, {useRef, useState} from "react";
import {ActivityIndicator, Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";

export type RevertSourceId = "card" | "saved" | "xid" | "share";

/**
 * Every place a recipe can be restored from, in the order they are offered.
 *
 * Fixed and exhaustive on purpose. The old dialog listed only the sources it
 * happened to have, so a recipe with none opened an empty box, and one with one
 * gave no hint that three others existed. Naming all four and greying the
 * missing ones turns "restore" from a guess into a choice.
 */
export const REVERT_SOURCES = [
    {
        id:     "card" as const,
        label:  "THE CARD'S OWN BACKUP",
        note:   "The bytes read off the card the last time it was scanned.",
        needs:  "OFFLINE" as const,
        absent: "This recipe has never been read from a card."
    },
    {
        id:     "saved" as const,
        label:  "THE SAVED COPY",
        note:   "The recipe as xBloom published it, cached on this device.",
        needs:  "OFFLINE" as const,
        absent: "No copy was cached for this recipe."
    },
    {
        id:     "xid" as const,
        label:  "XBLOOM, BY RECIPE ID",
        note:   "Fetch the published recipe again using its ID.",
        needs:  "ONLINE" as const,
        absent: "This recipe has no xBloom recipe ID."
    },
    {
        id:     "share" as const,
        label:  "XBLOOM, BY SHARE LINK",
        note:   "Fetch it again from the link it was imported from.",
        needs:  "ONLINE" as const,
        absent: "This recipe was not imported from a share link."
    }
] as const;

export type RevertSource = {
    id: RevertSourceId;
    label: string;
    note: string;
    needs: "OFFLINE" | "ONLINE";
    absent: string;
    available: boolean;
    action: () => Promise<void>;
};

type Props = {
    open: boolean;
    sources: RevertSource[];
    onOpenChange: (open: boolean) => void;
    /** Called once a revert has finished, successfully or not. */
    onReverted: () => void;
};

/**
 * Undo, with the four things it could undo to spelled out.
 *
 * A source it cannot use is dimmed by dropping its label from `text` to `dim`,
 * never by an opacity on the row. Group opacity multiplies whatever is under
 * it, and the reason a row is unavailable is the one string on that row that
 * has to be read — an earlier version put it at 1.56:1 against the sheet.
 */
export default function RevertSheet({open, sources, onOpenChange, onReverted}: Props) {
    const [running, setRunning] = useState<RevertSourceId | null>(null);
    // State alone does not close the door: two taps inside one frame both read
    // the pre-commit `running`, and both fetch. The same stale-closure bug was
    // fixed the same way in the stepper's hold-to-repeat.
    const runningRef = useRef<RevertSourceId | null>(null);

    async function run(source: RevertSource) {
        if (!source.available || runningRef.current !== null) return;
        runningRef.current = source.id;
        setRunning(source.id);
        try {
            await source.action();
        } catch (error) {
            notify({tone: "error", message: String(error)});
        } finally {
            runningRef.current = null;
            setRunning(null);
            onOpenChange(false);
            onReverted();
        }
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="REVERT TO">
            <YStack gap="$2" paddingBottom="$4">
                {sources.map((source) => (
                    <Pressable key={source.id} accessibilityRole="button"
                               accessibilityLabel={source.label}
                               accessibilityState={{disabled: !source.available}}
                               accessibilityHint={source.available ? source.note : source.absent}
                               onPress={() => run(source)}>
                        <YStack backgroundColor={palette.raised} borderRadius="$4"
                                padding="$3" gap="$1">
                            <XStack alignItems="center" gap="$2">
                                <Text fontSize={11} letterSpacing={1.6}
                                      color={source.available ? palette.text : palette.dim}>
                                    {source.label}
                                </Text>
                                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                               color={source.needs === "ONLINE" ? palette.info : palette.dim}>
                                    {source.needs}
                                </DotMatrixText>
                                {running === source.id && (
                                    <ActivityIndicator size="small" color={palette.dim}/>
                                )}
                            </XStack>
                            <Text fontSize={12} lineHeight={17} color={palette.dim}>
                                {source.available ? source.note : source.absent}
                            </Text>
                        </YStack>
                    </Pressable>
                ))}
            </YStack>
        </XbrwSheet>
    );
}
