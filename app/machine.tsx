import {router, useNavigation} from "expo-router";
import React, {useEffect, useState} from "react";
import {ScrollView, TextInput} from "react-native";
import * as Clipboard from "expo-clipboard";
import {Button, Input, Text, XStack, YStack} from "tamagui";
import type {ColorTokens} from "tamagui";

import ScreenHeader from "@/components/ScreenHeader";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {COMMANDS, type Command, type Tier} from "@/library/machine/commands";
import {
    buildType1, buildType1Bytes, buildType2, type Notification
} from "@/library/machine/protocol";

/**
 * The warning gate.
 *
 * Read once, not on every visit: a dialog somebody dismisses reflexively has
 * stopped being a warning. It names what the console can actually do so that the
 * acknowledgement is given against the hardware, not against the word "raw".
 */
const CONSOLE_WARNING =
    "This sends raw commands straight to your machine. It can start the grinder, " +
    "the water heater and the pouring arm. Nothing here is verified: most of it " +
    "was reverse-engineered from other people's captures of one firmware revision, " +
    "and some of it the sources disagree about. Read what each command says before " +
    "you send it.";

/** Tier colours, semantically. Danger for the commands nobody has resolved. */
const TIER_COLOUR: Record<Tier, string> = {
    inert:      palette.success,
    moves:      palette.warn,
    unresolved: palette.danger
};

const TIER_LABEL: Record<Tier, string> = {
    inert:      "INERT",
    moves:      "MOVES HARDWARE",
    unresolved: "UNRESOLVED"
};

/** Newest last. Capped, so a long session cannot exhaust memory. */
const LOG_LIMIT = 500;

type LogEntry = {at: string; direction: "→" | "←"; hex: string; reading: string};

/**
 * Parse a pasted frame, or null if it is not one.
 *
 * The CRC is deliberately **not** recomputed. A raw field that silently
 * rewrites what you pasted is not a raw field, and sending a deliberately
 * broken checksum is a legitimate thing to want to try.
 */
export function parseRawFrame(input: string): Uint8Array | null {
    const cleaned = input.replace(/[\s:]/g, "");
    if (cleaned.length === 0 || cleaned.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function readingOf(parsed: Notification): string {
    switch (parsed.kind) {
        case "status":      return `state 0x${parsed.state.toString(16).padStart(2, "0")}`;
        case "event":       return `event ${parsed.code}` +
                                   (parsed.value === undefined ? "" : ` (${parsed.value})`);
        case "waterWeight": return `water ${parsed.grams.toFixed(1)} g`;
        case "cupWeight":   return `cup ${parsed.grams.toFixed(1)} g`;
        case "info":        return `${parsed.model} ${parsed.firmware} ${parsed.mode}`;
        default:            return "";
    }
}

function toHex(frame: Uint8Array): string {
    return Array.from(frame, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/** The tea steep encoding is a two-way disagreement a single stopwatch settles. */
const TEA_STEEP_OPTIONS = [
    {value: "homoland", label: "HomoLand"},
    {value: "saya6k",   label: "saya6k"}
] as const;

/** Build the wire frame for a catalogue command and its filled-in arguments. */
function frameFor(command: Command, values: number[]): Uint8Array {
    switch (command.packet) {
        case "type1":      return buildType1(command.code, values);
        case "type1Bytes": return buildType1Bytes(command.code, Uint8Array.from(values));
        case "type2":      return buildType2(command.code, Uint8Array.from(values));
    }
}

type CommandRowProps = {
    command: Command;
    onSend: (command: Command, values: number[]) => void;
};

/**
 * One catalogue row: name, code, packet type, tier badge, an argument field per
 * `args` entry, and a `Send <name>` button the tests address by that exact label.
 *
 * Declared at module scope, like everything else here — a component defined
 * inside the screen body is a new type on every render and loses its argument
 * state each time.
 */
function CommandRow({command, onSend}: CommandRowProps) {
    const [values, setValues] = useState<string[]>(() => command.args.map(() => ""));

    function setArg(index: number, text: string) {
        setValues((prev) => prev.map((value, i) => (i === index ? text : value)));
    }

    return (
        <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack flex={1} gap="$1">
                    <Text fontSize={15} color={palette.text}>{command.name}</Text>
                    <Text fontSize={12} color={palette.dim}>
                        {`${command.code} · ${command.packet}`}
                    </Text>
                </YStack>
                <Text fontSize={10} fontWeight="700" letterSpacing={1}
                      color={TIER_COLOUR[command.tier]}>
                    {TIER_LABEL[command.tier]}
                </Text>
            </XStack>

            {command.note !== undefined && (
                <Text fontSize={12} color={palette.dim}>{command.note}</Text>
            )}

            {command.args.map((label, index) => (
                <Input key={label} size="$3" backgroundColor={palette.raised}
                       color={palette.text} placeholderTextColor={palette.muted as ColorTokens}
                       keyboardType="numeric" placeholder={label}
                       accessibilityLabel={`${command.name} — ${label}`}
                       value={values[index]}
                       onChangeText={(text) => setArg(index, text)}/>
            ))}

            <Button size="$3" accessibilityRole="button"
                    accessibilityLabel={`Send ${command.name}`}
                    borderColor={TIER_COLOUR[command.tier]} borderWidth={1}
                    backgroundColor={palette.raised} color={palette.text}
                    onPress={() => onSend(command, values.map((value) => Number(value) || 0))}>
                SEND
            </Button>
        </YStack>
    );
}

/**
 * A console for the firmware we have not met.
 *
 * Its whole purpose is that a user whose brew will not start can otherwise
 * report only that it did not start. It offers the full catalogue — including
 * commands nobody understands — plus a raw hex field, and logs both directions
 * so the session can be pasted into a bug report.
 */
export default function MachineConsole() {
    const navigation = useNavigation();
    const {machine} = useMachine();
    const [acknowledged, setAcknowledged] = useSetting("machineConsoleAcknowledged");
    const [confirmations, setConfirmations] = useSetting("machineConsoleConfirmations");
    const [teaSteepEncoding, setTeaSteepEncoding] = useSetting("teaSteepEncoding");

    const [log, setLog] = useState<LogEntry[]>([]);
    const [rawText, setRawText] = useState("");
    const [pending, setPending] = useState<{command: Command; values: number[]} | null>(null);

    useEffect(() => {
        navigation.setOptions({headerShown: false});
    }, [navigation]);

    // Both directions land in the same log. Outgoing frames are recorded when
    // sent; incoming frames arrive through the machine's frame subscription.
    function append(direction: "→" | "←", frame: Uint8Array, reading: string) {
        const at = new Date().toISOString().slice(11, 23);
        setLog((prev) => {
            const next = [...prev, {at, direction, hex: toHex(frame), reading}];
            return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
        });
    }

    useEffect(() => {
        return machine.onFrame((frame, parsed) => append("←", frame, readingOf(parsed)));
    }, [machine]);

    function dispatch(frame: Uint8Array) {
        append("→", frame, "");
        void machine.send(frame);
    }

    function onSend(command: Command, values: number[]) {
        const needsConfirm = confirmations && command.tier !== "inert";
        if (needsConfirm) {
            setPending({command, values});
            return;
        }
        dispatch(frameFor(command, values));
    }

    function confirmPending() {
        if (pending === null) return;
        dispatch(frameFor(pending.command, pending.values));
        setPending(null);
    }

    function sendRaw() {
        const frame = parseRawFrame(rawText);
        if (frame === null) return;
        dispatch(frame);
    }

    function copyLog() {
        const block = log
            .map((entry) => `${entry.at}  ${entry.direction}  ${entry.hex}  ${entry.reading}`)
            .join("\n");
        void Clipboard.setStringAsync(block);
    }

    if (!acknowledged) {
        return (
            <YStack flex={1} backgroundColor={palette.base}>
                <ScreenHeader title="Machine console" onBack={() => router.back()}/>
                <YStack flex={1} gap="$4" padding="$4">
                    <Text fontSize={15} color={palette.text}>{CONSOLE_WARNING}</Text>
                    <Button accessibilityRole="button" accessibilityLabel="I understand"
                            borderColor={palette.warn} borderWidth={1}
                            backgroundColor={palette.raised} color={palette.text}
                            onPress={() => setAcknowledged(true)}>
                        I understand
                    </Button>
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Machine console" onBack={() => router.back()}/>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 48}}>
                <SettingsSection title="Session">
                    <SettingsToggleRow
                        label="Confirm before sending"
                        description="For the one session spent working through the hardware checklist, where confirming forty sends is its own hazard."
                        value={confirmations}
                        onChange={setConfirmations}/>
                    <SettingsChoiceRow
                        label="Tea steep encoding"
                        description="The two sources disagree; a single stopwatched sixty-second steep settles which is right."
                        value={teaSteepEncoding}
                        options={TEA_STEEP_OPTIONS}
                        onChange={(value) => setTeaSteepEncoding(value === "saya6k" ? "saya6k" : "homoland")}/>
                </SettingsSection>

                <SettingsSection title="Raw frame">
                    <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                        <Text fontSize={12} color={palette.dim}>
                            An undocumented code is a paste away. The checksum is sent exactly
                            as typed — never recomputed.
                        </Text>
                        <Input size="$3" backgroundColor={palette.raised} color={palette.text}
                               placeholderTextColor={palette.muted as ColorTokens} autoCapitalize="none"
                               autoCorrect={false} placeholder="58 01 01 …"
                               accessibilityLabel="Raw frame"
                               value={rawText} onChangeText={setRawText}
                               fontFamily="monospace"/>
                        <Button size="$3" accessibilityRole="button"
                                accessibilityLabel="Send raw frame"
                                borderColor={palette.line} borderWidth={1}
                                backgroundColor={palette.raised} color={palette.text}
                                onPress={sendRaw}>
                            Send raw frame
                        </Button>
                    </YStack>
                </SettingsSection>

                <SettingsSection title="Commands">
                    {COMMANDS.map((command) => (
                        <CommandRow key={command.code} command={command} onSend={onSend}/>
                    ))}
                </SettingsSection>

                <SettingsSection title="Log">
                    <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                        <Button size="$3" accessibilityRole="button" accessibilityLabel="Copy log"
                                borderColor={palette.line} borderWidth={1}
                                backgroundColor={palette.raised} color={palette.text}
                                onPress={copyLog}>
                            Copy log
                        </Button>
                        {log.length === 0 ? (
                            <Text fontSize={12} color={palette.dim}>Nothing sent or received yet.</Text>
                        ) : (
                            <TextInput multiline editable={false}
                                       accessibilityLabel="Frame log"
                                       style={{color: palette.text, fontFamily: "monospace", fontSize: 11}}
                                       value={log
                                           .map((entry) => `${entry.at}  ${entry.direction}  ${entry.hex}  ${entry.reading}`)
                                           .join("\n")}/>
                        )}
                    </YStack>
                </SettingsSection>
            </ScrollView>

            <XbrwSheet open={pending !== null} onOpenChange={(next) => {if (!next) setPending(null);}}
                       title="Confirm send" heightPercent={pending?.command.tier === "unresolved" ? 60 : 42}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        {pending?.command.tier === "unresolved"
                            ? "Nobody agrees what this does. What the sources actually observed:"
                            : "This starts a motor, a heater, or rewrites a machine setting."}
                    </Text>
                    {pending?.command.tier === "unresolved" && pending.command.contradiction !== undefined && (
                        <Text fontSize={13} color={palette.danger}>{pending.command.contradiction}</Text>
                    )}
                    <Button accessibilityRole="button"
                            accessibilityLabel={`Confirm send ${pending?.command.name ?? ""}`}
                            borderColor={pending === null ? palette.line : TIER_COLOUR[pending.command.tier]}
                            borderWidth={1} backgroundColor={palette.raised} color={palette.text}
                            onPress={confirmPending}>
                        Send it
                    </Button>
                    <Button accessibilityRole="button" accessibilityLabel="Cancel send"
                            chromeless color={palette.text} onPress={() => setPending(null)}>
                        Cancel
                    </Button>
                </YStack>
            </XbrwSheet>
        </YStack>
    );
}
