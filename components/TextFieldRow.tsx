import React, {useEffect, useRef, useState} from "react";
import {Pressable, TextInput} from "react-native";

import FieldRow from "@/components/FieldRow";
import {palette} from "@/constants/colors";
import type {HelpTopic} from "@/constants/recipeHelp";

export type TextFieldRowProps = {
    topic: HelpTopic;
    label: string;
    initialValue: string;
    maxLength?: number;
    placeholder?: string;
    autoCapitalize?: "none" | "characters";
    showHint: boolean;
    onCommit: (value: string) => void;
    /**
     * Every keystroke, so the screen can flush an unblurred field.
     *
     * A `Pressable` does not blur a focused `TextInput`, so WRITE, SAVE, More
     * and Back can all fire while this row still holds a value the recipe has
     * never seen. The draft goes to a ref rather than to state: the recipe is
     * mutated in place and published by a key bump, so routing per keystroke
     * through state would re-render the row and fight the cursor for no gain.
     */
    onDraft?: (value: string) => void;
    /** Validates on every keystroke; false marks the field and reports up. */
    validate?: (value: string) => boolean;
    /** The reason shown while `validate` returns false. Prose, not a caption. */
    invalidReason?: string;
    /** Reports the field's validity so the write and save gates can honour it. */
    onInvalidChange?: (invalid: boolean) => void;
    /** Told when the input gains or loses focus, so a caller can defer work. */
    onFocusChange?: (focused: boolean) => void;
    /**
     * A live annotation on the field's own label, e.g. that an online lookup
     * failed. Passed straight to `FieldRow`; unlike `error` it does not gate any
     * button and is not styled as a validation failure.
     */
    note?: string;
};

/**
 * A `FieldRow` whose value is typed.
 *
 * Uncontrolled — the recipe is mutated in place and published by a key bump, so
 * feeding the input back a controlled `value` on every keystroke would fight the
 * cursor. It commits when editing ends, which is when the value is worth writing
 * back.
 *
 * The row keys on an external-replacement epoch at its call site, not on the
 * value it mirrors, so only a wholesale swap of the recipe (a revert) remounts
 * it and resets the visible text; an ordinary edit leaves it mounted. See the
 * key comment beside the call.
 *
 * A field may validate live: `validate` runs on every keystroke, not only on
 * commit, so a bad value closes the write and save gates before the field
 * blurs. Validity is reported up rather than kept here alone, because the gate
 * it feeds lives on the screen.
 *
 * Declared at module scope so it is not a fresh component type on every render
 * of the screen, which would remount it and drop the text mid-entry.
 */
export default function TextFieldRow({
    topic, label, initialValue, maxLength, placeholder, autoCapitalize,
    showHint, onCommit, onDraft,
    validate, invalidReason, onInvalidChange, onFocusChange, note
}: TextFieldRowProps) {
    const [invalid, setInvalid] = useState(() => validate ? !validate(initialValue) : false);
    // The whole row focuses this, so a short or empty value no longer leaves a
    // wide strip of the row looking tappable while only the input responds.
    const inputRef = useRef<TextInput>(null);

    // Reports validity on mount. The row is keyed on the external-replacement
    // epoch by its call site, so a revert remounts the whole row and both the
    // local `invalid` mark and the screen's gate are recomputed here from the
    // restored value. Keying only the inner input left this state behind: the
    // danger colour and the reason stayed on a field that now held something
    // valid.
    useEffect(() => {
        if (validate) onInvalidChange?.(!validate(initialValue));
    }, [initialValue, validate, onInvalidChange]);

    function onChangeText(value: string) {
        onDraft?.(value);
        if (!validate) return;
        const bad = !validate(value);
        setInvalid(bad);
        onInvalidChange?.(bad);
    }

    return (
        // The whole row is the touch target, not just the right-aligned input.
        // `accessible={false}` keeps this wrapper out of the accessibility tree
        // so the `Input` below stays the single announced element under its own
        // `label` -- the same one-announced-target rule `ImportTile` follows,
        // where the wrapper carries the label and the inner control is hidden.
        // This press only lives in `TextFieldRow`, not in `FieldRow`: a Stepper
        // or segmented row shares `FieldRow`, and a row-wide press there would
        // swallow the taps meant for the stepper's - and + controls.
        <Pressable accessible={false} testID={`field-row-${label}`}
                   onPress={() => inputRef.current?.focus()}>
            <FieldRow topic={topic} showHint={showHint} note={note}
                      error={invalid ? invalidReason : undefined}>
                {/* Not keyed here: the key belongs on the row, which is what owns
                    the `invalid` state this input feeds. */}
                <TextInput ref={inputRef} accessibilityLabel={label}
                           defaultValue={initialValue} maxLength={maxLength}
                           placeholder={placeholder} placeholderTextColor={palette.muted}
                           autoCapitalize={autoCapitalize} onChangeText={onChangeText}
                           onFocus={() => onFocusChange?.(true)}
                           onBlur={() => onFocusChange?.(false)}
                           onEndEditing={(event) => onCommit(event.nativeEvent.text)}
                           style={{
                               minWidth:          110,
                               textAlign:         "right",
                               fontSize:          16,
                               color:             invalid ? palette.danger : palette.text,
                               backgroundColor:   palette.raised,
                               borderColor:       palette.control,
                               borderWidth:       1,
                               borderRadius:      9,
                               paddingHorizontal: 11,
                               paddingVertical:   7
                           }}/>
            </FieldRow>
        </Pressable>
    );
}
