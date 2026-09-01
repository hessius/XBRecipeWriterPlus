import React, {useState} from "react";
import {Pressable} from "react-native";
import {router} from "expo-router";
import {Text, XStack, YStack} from "tamagui";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";

/** How many taps on the firmware row open the console. */
const CONSOLE_TAPS = 7;

/** One label-and-value line of the machine's own vitals. */
function Vital({label, value}: {label: string; value: string}) {
    return (
        <XStack justifyContent="space-between" paddingVertical="$2" paddingHorizontal="$4">
            <Text color={palette.dim} fontSize={13}>{label}</Text>
            <Text color={palette.text} fontSize={13}>{value}</Text>
        </XStack>
    );
}

/**
 * Settings → Machine.
 *
 * Always rendered, paired or not. The editor only grows a BREW action once a
 * machine has been remembered, so without this section there would be nothing
 * anywhere in the app telling a new owner that pairing is possible — and a dead
 * BREW button on every recipe, for the users who will never own a J15, is the
 * worse trade.
 *
 * The firmware row is the console's hidden entry: seven taps.
 */
export default function MachineSection() {
    const {machine, status, error, remembered, connect, forget} = useMachine();
    const [taps, setTaps] = useState(0);
    const info = machine.info;

    function onFirmwarePress() {
        const next = taps + 1;
        setTaps(next);
        if (next >= CONSOLE_TAPS) {
            setTaps(0);
            router.push("/machine");
        }
    }

    return (
        <SettingsSection title="Machine">
            {status !== "connected" && (
                <YStack paddingVertical="$3" paddingHorizontal="$4">
                    <Text color={palette.dim} fontSize={13}>
                        {status === "connecting" ? "Connecting…" : "Not connected"}
                    </Text>
                    {error !== null && (
                        <Text color={palette.danger} fontSize={13} marginTop="$1">{error}</Text>
                    )}
                </YStack>
            )}

            <SettingsActionRow
                label={status === "connected" ? "Connected" : "Connect to my machine"}
                detail={status === "connected"
                    ? "The link is held while XBRW++ is open."
                    : "Your xBloom Studio has to be switched on and nearby."}
                onPress={() => {
                    // The throw is for the brew path, which needs the reason.
                    // Here the reason is already on screen, in `error`.
                    if (status !== "connected") connect().catch(() => {});
                }}/>

            {info !== null && (
                <YStack paddingVertical="$1">
                    <Vital label="Serial" value={info.serial}/>
                    <Vital label="Model" value={info.model}/>
                    <Pressable accessibilityRole="button"
                               accessibilityLabel={`Firmware, ${info.firmware}`}
                               onPress={onFirmwarePress}>
                        <Vital label="Firmware" value={info.firmware}/>
                    </Pressable>
                    <Vital label="Water" value={info.waterEnough ? "OK" : "Low"}/>
                    <Vital label="Grind size" value={String(info.grindSize)}/>
                    <Vital label="Mode" value={info.mode}/>
                </YStack>
            )}

            {remembered !== "" && (
                <SettingsActionRow label="Forget this machine" tone="danger"
                                   detail="XBRW++ will scan again next time."
                                   onPress={() => void forget()}/>
            )}
        </SettingsSection>
    );
}
