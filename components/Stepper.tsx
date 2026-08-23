import React, {useEffect, useRef, useState} from "react";
import {Pressable} from "react-native";
import {Input, XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/** Delay before a held button starts repeating, and the fastest it repeats. */
const REPEAT_START_MS = 200;
const REPEAT_MIN_MS = 30;

/** Hold a value inside a range. */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * One step in a direction, clamped.
 *
 * Rounded to the decimals the step implies, because floating-point addition
 * does not respect a step of 0.1: 3.2 + 0.1 is 3.3000000000000003, which then
 * fails an equality assertion and, worse, is written to a card as a value the
 * machine did not expect.
 */
export function stepped(
    value: number, step: number, direction: 1 | -1, min: number, max: number
): number {
    const decimals = (String(step).split(".")[1] ?? "").length;
    const next = value + step * direction;
    const rounded = Number(next.toFixed(decimals));
    return clamp(rounded, min, max);
}

type Props = {
    /** Spoken name of the value. Not rendered — `FieldRow` draws the label. */
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** Draw the number in the recipe's accent. For dose and ratio. */
    accent?: string;
    /** Appended to the spoken value, e.g. "g". */
    unit?: string;
    onChange: (value: number) => void;
};

/**
 * A number you can nudge or type.
 *
 * Replaces the slider that used to sit under every numeric field. The slider
 * was the reason the editor kept a map of ScrollView refs: dragging one had to
 * switch the surrounding scroll off, and the two still fought. A stepper covers
 * the common case — a nudge of one — without touching the scroll at all, and
 * typing covers the jump.
 *
 * The typed value is held locally until it is committed, so a half-finished
 * entry is not clamped out from under the cursor. Typing "9" on the way to "95"
 * must not become "9" the moment it is entered.
 */
export default function Stepper({label, value, min, max, step, accent, unit, onChange}: Props) {
    // null means the Doto readout is showing; a string means the field is
    // open and holds the in-progress text.
    const [draft, setDraft] = useState<string | null>(null);
    // Tracks the last `value` the draft was derived from, so a change coming
    // from outside — auto fix rewrites every stage volume at once — is
    // noticed and re-synced during render rather than via an effect, which
    // would cost an extra commit for every external update.
    const [syncedValue, setSyncedValue] = useState(value);
    const repeat = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The repeat loop's tick reads this instead of closing over `value`, so a
    // change from outside mid-hold — an auto fix, a clamping parent — is the
    // base the next tick steps from, rather than being overwritten by it.
    const latestValue = useRef(value);

    if (value !== syncedValue) {
        setSyncedValue(value);
        setDraft(null);
    }

    useEffect(() => {
        latestValue.current = value;
    }, [value]);

    useEffect(() => () => {
        if (repeat.current) clearTimeout(repeat.current);
    }, []);

    function nudge(direction: 1 | -1) {
        const next = stepped(value, step, direction, min, max);
        if (next !== value) onChange(next);
    }

    function startRepeating(direction: 1 | -1) {
        let delay = REPEAT_START_MS;
        const tick = () => {
            const current = latestValue.current;
            const next = stepped(current, step, direction, min, max);
            if (next === current) return;
            onChange(next);
            delay = Math.max(REPEAT_MIN_MS, delay * 0.82);
            repeat.current = setTimeout(tick, delay);
        };
        repeat.current = setTimeout(tick, delay);
    }

    function stopRepeating() {
        if (repeat.current) {
            clearTimeout(repeat.current);
            repeat.current = null;
        }
    }

    function commit() {
        if (draft === null) return;
        const parsed = Number(draft);
        setDraft(null);
        if (draft.trim() === "" || Number.isNaN(parsed)) return;
        const next = clamp(parsed, min, max);
        if (next !== value) onChange(next);
    }

    const editing = draft !== null;

    return (
        <XStack alignItems="center" gap="$2"
                accessibilityRole="adjustable"
                accessibilityLabel={`${label}, ${value}${unit ? ` ${unit}` : ""}`}
                accessibilityValue={{min, max, now: value}}
                accessibilityActions={[{name: "increment"}, {name: "decrement"}]}
                onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === "increment") {
                        nudge(1);
                    } else if (event.nativeEvent.actionName === "decrement") {
                        nudge(-1);
                    }
                }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}
                       onPress={() => nudge(-1)}
                       onLongPress={() => startRepeating(-1)}
                       // Fires on every release, not only after a hold; calling
                       // stopRepeating on a plain tap is intentional and safe —
                       // it is a no-op when no repeat timer is pending.
                       onPressOut={stopRepeating}
                       style={stepStyle}>
                <DotIcon name="minus" size={16} color={palette.dim}/>
            </Pressable>

            {/* Two modes rather than a permanently editable field. Doto is a
                display face and this app renders it only through
                DotMatrixText, which enforces its size floor and its weight;
                a TextInput cannot go through that component, so the readout
                is Doto and the brief editing state is the body font. Only one
                of the two is ever mounted, so a screen reader is not offered
                a text field that is not on screen. */}
            <XStack alignItems="center" justifyContent="center" minWidth={54}>
                {editing ? (
                    // A whole-number step gets the numeric pad; a fractional
                    // one gets the decimal pad, which is the only one with a
                    // separator on it. Stage flow rate steps by 0.1, so under
                    // a plain numeric keyboard the tap-to-type path this
                    // control advertises could not enter 3.2 at all.
                    <Input unstyled autoFocus accessibilityLabel={label}
                           inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
                           testID="stepper-input"
                           value={draft ?? ""}
                           onChangeText={setDraft}
                           onBlur={commit}
                           onSubmitEditing={commit}
                           textAlign="center" minWidth={54} fontSize={20}
                           color={accent ?? palette.text}/>
                ) : (
                    <Pressable accessibilityRole="button"
                               accessibilityLabel={`Edit ${label}`}
                               onPress={() => setDraft(String(value))}>
                        <DotMatrixText testID="stepper-value" fontSize={22}
                                       weight="extrabold" color={accent ?? palette.text}
                                       style={{minWidth: 54, textAlign: "center"}}>
                            {String(value)}
                        </DotMatrixText>
                    </Pressable>
                )}
            </XStack>

            <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`}
                       onPress={() => nudge(1)}
                       onLongPress={() => startRepeating(1)}
                       onPressOut={stopRepeating}
                       style={stepStyle}>
                <DotIcon name="plus" size={16} color={palette.dim}/>
            </Pressable>
        </XStack>
    );
}

const stepStyle = {
    width:           32,
    height:          32,
    borderRadius:    10,
    alignItems:      "center" as const,
    justifyContent:  "center" as const,
    backgroundColor: palette.raised
};
