import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {LinkStatus} from "@/hooks/useMachine";

/** What the popover shows, copied out of the machine's info blob. */
export type MachineVitals = {
    waterEnough: boolean;
    mode: "PRO" | "EASY";
    grindSize: number;
    /** When the blob was asked for, in wall-clock milliseconds. */
    askedAt: number;
};

type Props = {
    open: boolean;
    status: LinkStatus;
    accent: string;
    /** Null whenever the machine has not answered — connecting, or away. */
    vitals: MachineVitals | null;
    /** Injected so the age is testable without a fake clock. */
    now: number;
    onRefreshWater: () => void;
    onConnect: () => void;
    onClose: () => void;
};

/** `4 MIN AGO`. Minutes only: seconds would change while it was being read. */
function age(askedAt: number, now: number): string {
    const minutes = Math.floor(Math.max(0, now - askedAt) / 60_000);
    if (minutes < 1) return "JUST NOW";
    return `${minutes} MIN AGO`;
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <XStack alignItems="center" justifyContent="space-between" paddingVertical="$1.5">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap="$2">{children}</XStack>
        </XStack>
    );
}

/**
 * The machine status popover.
 *
 * Shows only what changes: water level with its age and a refresh shortcut,
 * mode, and grind size. No MACHINE SETTINGS button — the gear is twenty pixels
 * away in the same header and leads to the same place.
 *
 * TRY NOW appears only when the machine is out of range. The refresh affordance
 * lives on the water row rather than among the buttons, because it acts on one
 * row and should not read as an equally important action.
 *
 * Driven by `open` and `onClose`, presented as a bottom sheet via `XbrwSheet`.
 */
export default function MachinePopover({
    open, status, accent, vitals, now, onRefreshWater, onConnect, onClose
}: Props) {
    let body: React.ReactNode;

    if (status === "connected" && vitals !== null) {
        body = (
            <YStack gap="$1">
                <Row label="WATER">
                    <DotMatrixText fontSize={13} weight="bold"
                                   color={vitals.waterEnough ? palette.text : palette.warn}>
                        {vitals.waterEnough ? "OK" : "LOW"}
                    </DotMatrixText>
                    <DotMatrixText fontSize={10} color={palette.muted}>
                        {age(vitals.askedAt, now)}
                    </DotMatrixText>
                    {/* On the row, because it acts on the row. Beside TRY NOW
                        it would read as an equally important thing to do. */}
                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Refresh the water reading"
                               onPress={onRefreshWater}>
                        <DotIcon name="refresh" size={12}
                                 color={vitals.waterEnough ? accent : palette.warn} />
                    </Pressable>
                </Row>
                {!vitals.waterEnough && (
                    <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                   color={palette.warn}>
                        FILL THE TANK, THEN REFRESH
                    </DotMatrixText>
                )}
                <Row label="MODE">
                    <DotMatrixText fontSize={13} weight="bold"
                                   color={vitals.mode === "EASY" ? palette.warn : palette.text}>
                        {vitals.mode}
                    </DotMatrixText>
                </Row>
                <Row label="GRIND">
                    <DotMatrixText fontSize={13} weight="bold" color={palette.text}>
                        {String(vitals.grindSize)}
                    </DotMatrixText>
                </Row>
            </YStack>
        );
    } else if (status === "connecting") {
        body = (
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                CONNECTING…
            </DotMatrixText>
        );
    } else {
        body = (
            <YStack gap="$2">
                <DotMatrixText fontSize={11} color={palette.dim}>
                    {vitals === null
                        ? "Not in range. It will reconnect by itself when it is."
                        : `Last seen ${age(vitals.askedAt, now)}. `
                          + "It will reconnect by itself when it is in range."}
                </DotMatrixText>
                <Pressable accessibilityRole="button" accessibilityLabel="Try now"
                           onPress={onConnect}>
                    <YStack alignItems="center" paddingVertical="$2.5" borderRadius="$4"
                            borderWidth={1} borderColor={accent}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                       color={accent}>
                            TRY NOW
                        </DotMatrixText>
                    </YStack>
                </Pressable>
            </YStack>
        );
    }

    return (
        <XbrwSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}
                   title="Machine" showTitle={false} heightPercent={40}>
            <YStack paddingBottom="$2">
                {body}
            </YStack>
        </XbrwSheet>
    );
}
