import router from "@/hooks/steadyRouter";
import React, {useEffect, useRef, useState} from "react";
import {ScrollView, TextInput} from "react-native";
import * as Clipboard from "expo-clipboard";
import {Button, Input, Text, XStack, YStack} from "tamagui";
import type {ColorTokens} from "tamagui";

import ScreenHeader from "@/components/ScreenHeader";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import MachineSpikeSection from "@/components/MachineSpikeSection";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import XbrwSheet from "@/components/XbrwSheet";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import BrewDatabase, {type StoredFrameLogSummary} from "@/library/BrewDatabase";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {COMMANDS, type Command, frameFor, type Tier} from "@/library/machine/commands";
import type {SpikeFrame} from "@/library/machine/spikeFrames";
import {
    frameLogText, readingOf, stateName, toHex
} from "@/library/machine/frameLog";
import type {MachineInfo, Notification} from "@/library/machine/protocol";

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

/** Newest last. Telemetry is summarized, so 500 meaningful frames fits safely. */
const LOG_LIMIT = 500;
const TELEMETRY_FLUSH_MS = 250;

type LogEntry = {at: string; direction: string; hex: string; reading: string};
type MachineStateReading = {value: number; changed: boolean; at: string};
type TelemetrySnapshot = {
    suppressed: number;
    waterWeight?: number;
    cupWeight?: number;
    info?: MachineInfo;
    // Counted, not just kept. Whether the machine volunteers the info blob or
    // only answers when asked is an open question, and a reading on its own
    // cannot tell the two apart — a count that stops at one can.
    infoSeen: number;
};

const INITIAL_TELEMETRY: TelemetrySnapshot = {suppressed: 0, infoSeen: 0};

/**
 * Parse a pasted frame, or null if it is not one.
 *
 * The CRC is deliberately **not** recomputed. A raw field that silently
 * rewrites what you pasted is not a raw field, and sending a deliberately
 * broken checksum is a legitimate thing to want to try.
 */
export function rawFrameProblem(input: string): string | null {
    const cleaned = input.replace(/[\s:]/g, "");
    if (cleaned.length === 0) return "nothing to send";
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        const bad = Array.from(new Set(cleaned.replace(/[0-9a-fA-F]/g, ""))).join(" ");
        return `not hex: ${bad}`;
    }
    if (cleaned.length % 2 !== 0) return `odd number of digits: ${cleaned.length}`;
    return null;
}

export function parseRawFrame(input: string): Uint8Array | null {
    const cleaned = input.replace(/[\s:]/g, "");
    if (rawFrameProblem(input) !== null) return null;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function isTelemetry(parsed: Notification): boolean {
    return parsed.kind === "waterWeight"
        || parsed.kind === "cupWeight"
        || parsed.kind === "info";
}

function telemetryText(snapshot: TelemetrySnapshot): string {
    const parts = [`suppressed ${snapshot.suppressed}`];
    parts.push(`water ${snapshot.waterWeight === undefined ? "n/a" : `${snapshot.waterWeight.toFixed(1)} g`}`);
    parts.push(`cup ${snapshot.cupWeight === undefined ? "n/a" : `${snapshot.cupWeight.toFixed(1)} g`}`);
    parts.push(`info ${snapshot.info === undefined
        ? "n/a"
        : `${snapshot.info.model} ${snapshot.info.firmware} ${snapshot.info.mode}`
          + ` water ${snapshot.info.waterFeed === "tap"
              ? "plumbed"
              : snapshot.info.waterEnough ? "ok" : "low"}`} ×${snapshot.infoSeen}`);
    return parts.join(" · ");
}

function stateText(state: MachineStateReading | null): string {
    if (state === null) return "Machine state: none yet";
    const hex = `0x${state.value.toString(16).padStart(2, "0")}`;
    return `Machine state: ${hex} ${stateName(state.value)} · ${state.changed ? "changed" : "repeated"} ${state.at}`;
}

function storedLogWhen(log: StoredFrameLogSummary): string {
    return `${formatBrewDate(log.startedAt)} · ${formatBrewTime(log.startedAt)}`;
}

function appendLog(
    setLog: React.Dispatch<React.SetStateAction<LogEntry[]>>,
    direction: string,
    frame: Uint8Array,
    reading: string
) {
    const at = new Date().toISOString().slice(11, 23);
    setLog((prev) => {
        const next = [...prev, {at, direction, hex: toHex(frame), reading}];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    });
}

function flushTelemetry(
    telemetryRef: {current: TelemetrySnapshot},
    telemetryTimerRef: {current: ReturnType<typeof setTimeout> | null},
    setTelemetry: React.Dispatch<React.SetStateAction<TelemetrySnapshot>>
) {
    telemetryTimerRef.current = null;
    setTelemetry({...telemetryRef.current});
}

function scheduleTelemetryFlush(
    telemetryRef: {current: TelemetrySnapshot},
    telemetryTimerRef: {current: ReturnType<typeof setTimeout> | null},
    setTelemetry: React.Dispatch<React.SetStateAction<TelemetrySnapshot>>
) {
    if (telemetryTimerRef.current !== null) return;
    telemetryTimerRef.current = setTimeout(
        () => flushTelemetry(telemetryRef, telemetryTimerRef, setTelemetry),
        TELEMETRY_FLUSH_MS
    );
}

function recordTelemetry(
    parsed: Notification,
    frame: Uint8Array,
    telemetryRef: {current: TelemetrySnapshot},
    telemetryTimerRef: {current: ReturnType<typeof setTimeout> | null},
    setTelemetry: React.Dispatch<React.SetStateAction<TelemetrySnapshot>>
) {
    const next = {...telemetryRef.current, suppressed: telemetryRef.current.suppressed + 1};
    switch (parsed.kind) {
        case "waterWeight":
            next.waterWeight = parsed.grams;
            break;
        case "cupWeight":
            next.cupWeight = parsed.grams;
            break;
        case "info":
            next.info = parsed;
            next.infoSeen += 1;
            break;
        default:
            break;
    }
    telemetryRef.current = next;
    scheduleTelemetryFlush(telemetryRef, telemetryTimerRef, setTelemetry);
}

function recordMachineState(
    parsed: Notification,
    lastStateRef: {current: number | null},
    setMachineState: React.Dispatch<React.SetStateAction<MachineStateReading | null>>
) {
    if (parsed.kind !== "status") return;
    const at = new Date().toISOString().slice(11, 23);
    const changed = lastStateRef.current !== parsed.state;
    lastStateRef.current = parsed.state;
    setMachineState({value: parsed.state, changed, at});
}

function clearTelemetryTimer(telemetryTimerRef: {current: ReturnType<typeof setTimeout> | null}) {
    if (telemetryTimerRef.current === null) return;
    clearTimeout(telemetryTimerRef.current);
    telemetryTimerRef.current = null;
}

/** The bypass temperature scaling is unconfirmed; a thermometer settles it. */
const BYPASS_TEMP_OPTIONS = [
    {value: "scaled", label: "x10"},
    {value: "plain",  label: "Degrees"}
] as const;

type CommandRowProps = {
    command: Command;
    onSend: (command: Command, values: number[]) => void;
};

/**
 * A frame waiting on a confirmation, from the catalogue or from the spike
 * section. The frame is built at confirm time rather than held, so cancelling
 * costs nothing and a stale frame cannot be sent.
 */
type Pending = {
    name: string;
    tier: Tier;
    /** The contradiction or the hazard. Shown in danger colour when present. */
    warning?: string;
    build: () => Uint8Array;
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

            {command.args.map((arg, index) => (
                <Input key={`${arg.label}-${index}`} size="$3" backgroundColor={palette.raised}
                       color={palette.text} placeholderTextColor={palette.muted as ColorTokens}
                       keyboardType={arg.kind === "float32" ? "decimal-pad" : "numeric"}
                       placeholder={arg.label}
                       accessibilityLabel={`${command.name}, ${arg.label}`}
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
    const {machine, status, connect} = useMachine();
    const [brewDatabase] = useState(() => new BrewDatabase());
    const [acknowledged, setAcknowledged] = useSetting("machineConsoleAcknowledged");
    const [confirmations, setConfirmations] = useSetting("machineConsoleConfirmations");
    const [bypassTempEncoding, setBypassTempEncoding] = useSetting("bypassTempEncoding");

    const [log, setLog] = useState<LogEntry[]>([]);
    const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);
    const telemetryRef = useRef<TelemetrySnapshot>(INITIAL_TELEMETRY);
    const telemetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showTelemetry, setShowTelemetry] = useState(false);
    const showTelemetryRef = useRef(showTelemetry);
    const [machineState, setMachineState] = useState<MachineStateReading | null>(null);
    const lastStateRef = useRef<number | null>(null);
    const [rawText, setRawText] = useState("");
    const [rawProblem, setRawProblem] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);

    useEffect(() => {
        return machine.onFrame((direction, frame, parsed, source) => {
            if (direction === "received") recordMachineState(parsed, lastStateRef, setMachineState);
            if (direction === "received" && isTelemetry(parsed) && !showTelemetryRef.current) {
                recordTelemetry(parsed, frame, telemetryRef, telemetryTimerRef, setTelemetry);
                return;
            }
            // The channel is named on the arrow rather than in the reading,
            // so a frame from `ffe3` is obvious at a glance in a log that is
            // otherwise all `ffe2`.
            const arrow = direction === "sent"
                ? "→"
                : source === undefined ? "←" : `←${source}`;
            appendLog(setLog, arrow, frame, direction === "sent" ? "" : readingOf(parsed));
        });
    }, [machine]);

    useEffect(() => {
        return () => {
            clearTelemetryTimer(telemetryTimerRef);
        };
    }, []);

    async function dispatch(frame: Uint8Array) {
        // No `append` here: `machine.send` announces the frame to every
        // subscriber, including the one above. A failed send is logged, because
        // this log is the evidence a protocol report is built from and it must
        // not show a command as sent when the radio refused it.
        try {
            await machine.send(frame);
        } catch (e) {
            appendLog(setLog, "→", frame, `not sent: ${(e as Error).message}`);
        }
    }

    function onSend(command: Command, values: number[]) {
        ask({
            name: command.name,
            tier: command.tier,
            warning: command.tier === "unresolved" ? command.contradiction : undefined,
            build: () => frameFor(command, values)
        });
    }

    /**
     * A spike frame is not a catalogue row, but it reaches the same machine, so
     * it asks the same question. A hazard is treated as an `unresolved`
     * contradiction is: always shown, never silenced by the toggle, because a
     * warning the user can switch off is no use on the one frame that abandons
     * a running brew.
     */
    function onSendSpike(spike: SpikeFrame) {
        ask({
            name: spike.label,
            tier: spike.hazard === undefined ? "moves" : "unresolved",
            warning: spike.hazard,
            build: spike.build
        });
    }

    function ask(next: Pending) {
        // An unresolved command always confirms. The toggle is there to stop
        // the console nagging about commands whose effect is known; it is not
        // a way to switch off the warning that the sources disagree about what
        // this one does, which is the only warning that can cost anything.
        const needsConfirm = next.tier === "unresolved"
            || (confirmations && next.tier !== "inert");
        if (needsConfirm) {
            setPending(next);
            return;
        }
        void dispatch(next.build());
    }

    function confirmPending() {
        if (pending === null) return;
        void dispatch(pending.build());
        setPending(null);
    }

    function sendRaw() {
        // A silent return reads exactly like a dead button, which cost a
        // hardware session. The field says why instead.
        const problem = rawFrameProblem(rawText);
        if (problem !== null) {
            setRawProblem(problem);
            return;
        }
        const frame = parseRawFrame(rawText);
        if (frame === null) return;
        setRawProblem(null);
        void dispatch(frame);
    }

    function changeShowTelemetry(next: boolean) {
        showTelemetryRef.current = next;
        setShowTelemetry(next);
    }

    /** The link history, as lines. Oldest first, same clock as the frame log. */
    const connectionLines = machine.linkHistory.map(
        (event) => `${new Date(event.at).toISOString().slice(11, 23)}  ${event.text}`
    );

    function copyLog() {
        // Built from the machine's always-on history, not the live `log`: the
        // live log only holds what arrived while this screen was mounted, but a
        // brew is watched from the brew sheet with the console closed, so its
        // frames are only here. The weight stream is absent by design (see
        // `retainFrame`); everything diagnostic, states, events, the recipe
        // send and anything unknown, is present and spans the whole session.
        const block = [
            "This session machine log",
            "",
            ...connectionLines,
            "",
            frameLogText(machine.frameHistory)
        ].join("\n");
        void Clipboard.setStringAsync(block).then(() => notify({
            tone:    "success",
            message: "Session log copied"
        }));
    }

    function copyStoredLog(summary: StoredFrameLogSummary) {
        const frames = brewDatabase.frames(summary.brewId);
        if (frames.length === 0) return;
        const block = [
            "Last recorded brew frame log",
            `Brew: ${summary.recipeName}`,
            `When: ${storedLogWhen(summary)}`,
            `Record: ${summary.brewId}`,
            "",
            frames
        ].join("\n");
        void Clipboard.setStringAsync(block).then(() => notify({
            tone:    "success",
            message: "Stored brew log copied"
        }));
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

    const storedLog = brewDatabase.latestFrameLogSummary();

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Machine console" onBack={() => router.back()}/>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 48}}>
                <YStack gap="$2" padding="$4" borderRadius="$5"
                        borderColor={machineState === null ? palette.warn : palette.success}
                        borderWidth={1} backgroundColor={palette.surface}>
                    <Text accessibilityLabel="Machine state" fontSize={18} fontWeight="700"
                          color={machineState === null ? palette.warn : palette.text}>
                        {stateText(machineState)}
                    </Text>
                    <Text accessibilityLabel="Telemetry summary" fontSize={12} color={palette.dim}>
                        {telemetryText(telemetry)}
                    </Text>
                    {status !== "connected" && (
                        // The console is where a user is sent when the link is
                        // the problem, so it is the last screen that should
                        // assume the link is already up.
                        <Button size="$3" marginTop="$2" accessibilityRole="button"
                                accessibilityLabel={status === "connecting"
                                    ? "Connecting to the machine"
                                    : "Connect to the machine"}
                                disabled={status === "connecting"}
                                borderColor={palette.line} borderWidth={1}
                                backgroundColor={palette.raised} color={palette.text}
                                onPress={() => void connect()}>
                            {status === "connecting" ? "Connecting…" : "Connect"}
                        </Button>
                    )}
                </YStack>

                <SettingsSection title="Session">
                    <SettingsToggleRow
                        label="Confirm before sending"
                        description="For the one session spent working through the hardware checklist, where confirming forty sends is its own hazard."
                        value={confirmations}
                        onChange={setConfirmations}/>
                    <SettingsToggleRow
                        label="Show telemetry"
                        description="Log the weight and tank-volume streams, and the info blob, instead of summarising them in place. The info blob is not a stream: it answers when asked, inside a fresh session."
                        value={showTelemetry}
                        onChange={changeShowTelemetry}/>
                    <SettingsChoiceRow
                        label="Bypass temperature"
                        description="The command carries the bypass temperature multiplied by ten, or so the argument name suggests. A thermometer in the cup settles it."
                        value={bypassTempEncoding}
                        options={BYPASS_TEMP_OPTIONS}
                        onChange={(value) => setBypassTempEncoding(value === "plain" ? "plain" : "scaled")}/>
                </SettingsSection>

                <MachineSpikeSection onSend={onSendSpike}/>

                <SettingsSection title="Raw frame">
                    <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                        <Text fontSize={12} color={palette.dim}>
                            An undocumented code is a paste away. The checksum is sent exactly
                            as typed, never recomputed.
                        </Text>
                        <Input size="$3" backgroundColor={palette.raised} color={palette.text}
                               placeholderTextColor={palette.muted as ColorTokens} autoCapitalize="none"
                               autoCorrect={false} placeholder="58 01 01 …"
                               accessibilityLabel="Raw frame"
                               value={rawText}
                               onChangeText={(text) => {
                                   setRawText(text);
                                   setRawProblem(null);
                               }}
                               fontFamily="monospace"/>
                        {rawProblem !== null && (
                            // `alert` plus the live region, which is the
                            // repo's cross-platform pattern -- see
                            // `ImportSheet`. The region is Android-only, so
                            // without the role an iOS VoiceOver user who
                            // mistypes a frame still meets a button that does
                            // nothing, which is the whole defect this message
                            // was added to fix.
                            <Text testID="raw-frame-problem" fontSize={12} color={palette.danger}
                                  accessibilityRole="alert" accessibilityLiveRegion="polite">
                                {rawProblem}
                            </Text>
                        )}
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
                        <CommandRow key={`${command.code}-${command.name}`} command={command} onSend={onSend}/>
                    ))}
                </SettingsSection>

                <SettingsSection title="Connection">
                    <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                        <Button size="$3" accessibilityRole="button"
                                accessibilityLabel="Describe the radio"
                                borderColor={palette.line} borderWidth={1}
                                backgroundColor={palette.raised} color={palette.text}
                                onPress={() => void machine.describeRadio()}>
                            Describe the radio
                        </Button>
                        {connectionLines.length === 0 ? (
                            <Text fontSize={12} color={palette.dim}>
                                Nothing yet. This records every attempt at a link, including
                                the ones that fail before a single frame is exchanged.
                            </Text>
                        ) : (
                            <TextInput multiline editable={false}
                                       accessibilityLabel="Connection log"
                                       style={{color: palette.text, fontFamily: "monospace", fontSize: 11}}
                                       value={connectionLines.join("\n")}/>
                        )}
                    </YStack>
                </SettingsSection>

                <SettingsSection title="Session log">
                    <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                        <Button size="$3" accessibilityRole="button" accessibilityLabel="Copy session log"
                                borderColor={palette.line} borderWidth={1}
                                backgroundColor={palette.raised} color={palette.text}
                                onPress={copyLog}>
                            Copy session log
                        </Button>
                        {log.length === 0 ? (
                            <Text fontSize={12} color={palette.dim}>Nothing sent or received this session.</Text>
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

                {storedLog !== null && (
                    <SettingsSection title="Stored brew log">
                        <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
                            <Text fontSize={12} color={palette.dim}>
                                This copies saved frames from the last recorded brew. The log above
                                is only this session.
                            </Text>
                            <Text fontSize={12} color={palette.dim}>
                                {`${storedLog.recipeName} · ${storedLogWhen(storedLog)}`}
                            </Text>
                            <Button size="$3" accessibilityRole="button"
                                    accessibilityLabel="Copy last recorded brew log"
                                    borderColor={palette.line} borderWidth={1}
                                    backgroundColor={palette.raised} color={palette.text}
                                    onPress={() => copyStoredLog(storedLog)}>
                                Copy last recorded brew log
                            </Button>
                        </YStack>
                    </SettingsSection>
                )}
            </ScrollView>

            <XbrwSheet open={pending !== null} onOpenChange={(next) => {if (!next) setPending(null);}}
                       title="Confirm send" heightPercent={pending?.warning !== undefined ? 60 : 42}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        {pending?.tier === "unresolved"
                            ? "This one costs something, or nobody agrees what it does:"
                            : "This starts a motor, a heater, or rewrites a machine setting."}
                    </Text>
                    {pending?.warning !== undefined && (
                        <Text fontSize={13} color={palette.danger}>{pending.warning}</Text>
                    )}
                    <Button accessibilityRole="button"
                            accessibilityLabel={`Confirm send ${pending?.name ?? ""}`}
                            borderColor={pending === null ? palette.line : TIER_COLOUR[pending.tier]}
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
