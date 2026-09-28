import React, {useEffect, useState} from "react";
import {Pressable} from "react-native";
import router from "@/hooks/steadyRouter";
import {Text, XStack, YStack} from "tamagui";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {RATING_PROMPT_WINDOW_MS} from "@/library/brew/ratingPrompt";
import type {Settings} from "@/library/Settings";
import {MACHINE_MODELS, isMachineModel, type MachineModel} from "@/library/machine/machineModel";

/** How many taps on the firmware row open the console. */
const CONSOLE_TAPS = 7;

const RETENTION_OPTIONS = [
    {value: "10",  label: "10"},
    {value: "50",  label: "50"},
    {value: "200", label: "200"},
    {value: "0",   label: "Don't keep traces"}
] as const;

/**
 * What each model is called on screen.
 *
 * A `Record` rather than a hand-written option list, so adding a third machine
 * is a compile error here rather than a button that quietly never appears.
 * `SegmentOption.value` is a bare `string`, so restating the values would have
 * had no link to `MACHINE_MODELS` at all: a typo would compile, the guard below
 * would reject it, and the segment would simply do nothing.
 */
const MACHINE_MODEL_LABELS: Record<MachineModel, string> = {
    studio:   "Studio",
    original: "Original"
};

const MACHINE_MODEL_OPTIONS = MACHINE_MODELS.map(
    (value) => ({value, label: MACHINE_MODEL_LABELS[value]})
);

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
 * The console's hidden entry is seven taps: on the firmware row when a machine
 * is connected, on the status line when it is not. Both, because the console is
 * the only place a failed connection can be read about, and the firmware row is
 * not rendered when there is no connection to report the firmware of.
 */
export default function MachineSection({settings}: {settings?: Settings}) {
    // The injected store matters: the link writes `machineModel` through it
    // when it recognises a Studio, and a test that injected a store while the
    // hook wrote to the shared one would watch the correction land somewhere
    // this row cannot see.
    const {machine, status, error, remembered, connect, forget} = useMachine(undefined, {settings});
    const [autoStart, setAutoStart] = useSetting("machineAutoStart", settings);
    const [animateBrewChart, setAnimateBrewChart] = useSetting("animateBrewChart", settings);
    const [askForRatings, setAskForRatings] = useSetting("askForRatings", settings);
    const [brewTraceRetention, setBrewTraceRetention] = useSetting("brewTraceRetention", settings);
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
    const [taps, setTaps] = useState(0);
    const info = machine.info;
    const ratingPromptHours = Math.round(RATING_PROMPT_WINDOW_MS / (60 * 60 * 1000));
    const ratingPromptDescription =
        `On, the last brew XBRW++ watched can ask how it was along the bottom for up to ${ratingPromptHours} hours. `
        + "Off, ratings are only given on the brew itself.";

    /** What the section says when there is no live link. */
    const idleStatus = status === "connecting" ? "Connecting…"
        : remembered === "" ? "No machine paired"
            : status === "idle" ? `Not connected · ${remembered}`
                : `Not in range · ${remembered}`;

    // The vitals are a snapshot taken at connect. Left alone, a tank refilled
    // since then still reads Low here, and only a relaunch clears it.
    useEffect(() => {
        if (status !== "connected") return;
        machine.askHowItIsDoing().catch(() => {});
    }, [machine, status]);

    function onSecretPress() {
        const next = taps + 1;
        setTaps(next);
        if (next >= CONSOLE_TAPS) {
            setTaps(0);
            router.push("/machine");
        }
    }

    return (
        <SettingsSection title="Machine">
            <SettingsChoiceRow
                label="Your xBloom"
                description="The two machines grind on different scales, so a recipe written for one is wrong on the other. Pick yours and the app asks xBloom for the right version. Recipes already saved keep the numbers they were written with."
                value={machineModel}
                options={MACHINE_MODEL_OPTIONS}
                onChange={(value) => {
                    // Only the options above can arrive here, so a value that is
                    // not a model is a bug in this file rather than a stale
                    // preference to coerce. Hence the guard and not a fallback.
                    if (isMachineModel(value)) setMachineModel(value);
                }}/>

            {status !== "connected" && (
                <Pressable accessibilityRole="text"
                           accessibilityLabel={idleStatus}
                           onPress={onSecretPress}>
                    <YStack paddingVertical="$3" paddingHorizontal="$4">
                        <Text color={palette.dim} fontSize={13}>
                            {idleStatus}
                        </Text>
                        {error !== null && (
                            <Text color={palette.danger} fontSize={13} marginTop="$1">{error}</Text>
                        )}
                    </YStack>
                </Pressable>
            )}

            <SettingsActionRow
                label={status === "connected" ? "Connected" : "Connect to my machine"}
                detail={status === "connected"
                    ? "The link is held while XBRW++ is open."
                    // Naming the Studio to somebody who just said they own an
                    // original reads as if the app forgot. It is also the one
                    // place worth admitting that a scan will find their machine
                    // and the connection after it probably will not finish: the
                    // Bluetooth protocol here is the Studio's throughout, and
                    // nobody has had an original in front of them to check.
                    : machineModel === "original"
                        ? "Your xBloom has to be switched on and nearby. Only the Studio has been tested."
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
                               onPress={onSecretPress}>
                        <Vital label="Firmware" value={info.firmware}/>
                    </Pressable>
                    <Vital label="Water" value={info.waterFeed === "tap"
                        ? "Plumbed"
                        : info.waterEnough ? "OK" : "Low"}/>
                    <Vital label="Grind size" value={String(info.grindSize)}/>
                    <Vital label="Mode" value={info.mode}/>
                </YStack>
            )}

            <SettingsToggleRow
                label="Start brewing automatically"
                description="Off, BREW loads the recipe onto the machine and waits for you to press START. On, it starts grinding the moment the recipe lands."
                value={autoStart}
                onChange={setAutoStart}/>

            <SettingsToggleRow
                label="Animate the brew chart"
                description="When off, each phase change holds its end state immediately. The system Reduced Motion switch also disables animation independently."
                value={animateBrewChart}
                onChange={setAnimateBrewChart}/>

            <SettingsToggleRow
                label="Ask how a brew was"
                description={ratingPromptDescription}
                value={askForRatings} onChange={setAskForRatings}/>

            <SettingsChoiceRow
                label="Keep raw brew traces"
                description="How many past brews keep their full sample stream. Records are always kept; only the detail behind them expires."
                value={String(brewTraceRetention)}
                options={RETENTION_OPTIONS}
                onChange={(v) => setBrewTraceRetention(Number(v))}/>

            {remembered !== "" && (
                <SettingsActionRow label="Forget this machine" tone="danger"
                                   detail="XBRW++ will scan again next time."
                                   onPress={() => void forget()}/>
            )}
        </SettingsSection>
    );
}
