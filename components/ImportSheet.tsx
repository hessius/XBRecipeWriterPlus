import * as Clipboard from "expo-clipboard";
import React, {useEffect, useRef, useState} from "react";
import {Keyboard, TextInput} from "react-native";
import {Input, Spinner, Text, XStack, YStack} from "tamagui";
import type {ColorTokens} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import ImportResult from "@/components/ImportResult";
import PasteOverlay from "@/components/PasteOverlay";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {RecipeImport} from "@/hooks/useRecipeImport";

const FIELD_LABEL = "Share link or pod code";
const FORMAT_HINT = "Paste an xBloom share link, or a pod code like ETH120.";

/**
 * The app's own face for the paste affordance.
 *
 * One definition, drawn on both platforms. On iOS 16+ `PasteOverlay` lays an
 * invisible `UIPasteControl` over it so the tap pastes with no prompt;
 * everywhere else the wrapper's `getStringAsync` fallback handles the tap. Both
 * routes show this same dot-matrix `PASTE`, so the sheet never renders an
 * obvious system control beside its own language.
 */
function PasteFace() {
    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            paddingVertical="$3"
            borderRadius="$6"
            backgroundColor={palette.raised}
            borderWidth={1}
            borderColor={palette.line}>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5} color={palette.text}>
                PASTE
            </DotMatrixText>
        </XStack>
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importer: RecipeImport;
};

/**
 * The one import sheet, reached from three doors.
 *
 * Layout only. Every rule about when a lookup starts, whether it navigates,
 * whether the field is drawn and what is said when it fails belongs to
 * `useRecipeImport`.
 */
export default function ImportSheet({open, onOpenChange, importer}: Props) {
    // `showField` and `focusField` are the hook's, not props: whether the field
    // is drawn and whether it grabs focus both follow from the import intent,
    // which only the hook knows, so they live in exactly one place. `showField`
    // is false while a share intent or the tile's shortcut resolves (nothing to
    // type beside a running lookup) and true otherwise, including when a shortcut
    // degrades to the found panel; `focusField` gates the field's focus so
    // a failed share intent can restore the field without raising the keyboard.
    const {state, value, showField, focusField, hint, onChangeText, onPastedText, openFound} = importer;
    const [nativePaste, setNativePaste] = useState(false);
    const [wasOpen, setWasOpen] = useState(open);

    // Reset when the sheet closes, in render rather than from the effect below.
    // The lint rule forbids a synchronous `setState` in an effect body, and
    // this is the same adjust-state-during-render pattern `XbrwSheet` uses.
    // Without it the stale `true` from the last session survives the close and
    // flashes the native control for a tick on reopen, before the async
    // presence check has resolved.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (!open) setNativePaste(false);
    }

    // Dismiss the keyboard when a *typed* lookup lands on the found panel.
    //
    // A typed value resolves without navigating precisely so the user can read
    // the panel first -- but the keyboard is still up from typing and covers the
    // panel it exists to be read. Reaching found is the moment to drop it.
    //
    // This is a side effect, not a state change, so it belongs in an effect and
    // *not* in the render-phase adjust-state block above: the lint rule that
    // block satisfies forbids a synchronous `setState` in an effect, but says
    // nothing about a plain imperative call, and a side effect must never run
    // during render. It lives in the sheet, not the hook: `useRecipeImport` owns
    // the import *rules* and holds no React Native import, and which control has
    // focus is presentation.
    //
    // The transition is detected against the previous render, so the dismiss
    // fires once per resolution rather than on every repaint while found. It is
    // gated on the field having been on screen *before* this render, which is
    // true only of the typed path: a share intent or the tile shortcut resolves
    // with the field hidden (`showField` false), so its keyboard was never up,
    // and a degrading shortcut restores the field at found and the focus effect
    // below raises the keyboard on purpose -- dismissing there would fight it.
    // The error state is excluded for free by keying on found, which is right: a
    // mistyped code needs the keyboard kept up to be corrected.
    const previous = useRef({status: state.status, showField});
    useEffect(() => {
        const enteredFound =
            state.status === "found" && previous.current.status !== "found";
        const fromTypedPath = previous.current.showField;
        if (enteredFound && fromTypedPath) {
            Keyboard.dismiss();
        }
        previous.current = {status: state.status, showField};
    }, [state.status, showField]);

    // Raise the keyboard when the field comes on screen, unless the hook vetoes
    // it. This is the imperative replacement for `autoFocus`: `autoFocus` fires
    // on every remount, and a share intent hides the field then remounts it on
    // failure, which would raise the keyboard on someone whose attention is
    // still in the app they shared from. So focus is driven here, on the
    // false->true edge of the field being shown, and gated on `focusField` --
    // which the hook drops to false only for that one case. A plain open, a
    // shortcut degrade and a shortcut failure all keep `focusField` true and so
    // still focus; the typed and in-field-paste paths never hide the field, so
    // there is no edge and their keyboard is left exactly as the user left it.
    // Focus lives in the sheet, not the hook: `useRecipeImport` owns the import
    // rules and holds no React Native import, and which control has focus is
    // presentation. A programmatic `focus()` does not fire `onFocus` under the
    // test renderer, which is why the tests spy on `TextInput.prototype.focus`.
    const inputRef = useRef<React.ElementRef<typeof Input>>(null);
    const fieldWasShown = useRef(false);
    useEffect(() => {
        const shown = open && showField;
        if (shown && !fieldWasShown.current && focusField) {
            // The cast matches `editRecipe.tsx`: Tamagui types the ref as its own
            // element, but an `Input`'s node is the RN `TextInput` underneath.
            (inputRef.current as TextInput | null)?.focus();
        }
        fieldWasShown.current = shown;
    }, [open, showField, focusField]);

    useEffect(() => {
        if (!open || !Clipboard.isPasteButtonAvailable) {
            return;
        }
        let cancelled = false;
        // The presence check, which is silent on both platforms. Whether the
        // clipboard holds an xBloom link cannot be known without reading it,
        // and reading it is what costs a prompt -- so this only decides which
        // affordance to draw.
        void Clipboard.hasStringAsync().then((has) => {
            if (!cancelled) setNativePaste(has);
        });
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function paste() {
        // Contents are read only here, on a tap the user just made. Reading on
        // open would prompt on iOS every single time the sheet was opened,
        // including the times someone came to type a pod code.
        onPastedText(await Clipboard.getStringAsync());
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Import" prewarm>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {showField && (
                    <>
                        <Input
                            ref={inputRef}
                            accessibilityLabel={FIELD_LABEL}
                            placeholder={FIELD_LABEL}
                            // The palette is a plain module of raw strings, not
                            // Tamagui tokens, because roughly half the app's
                            // colour call sites are plain RN/SVG props that
                            // cannot take a `$token`; the cast reconciles that
                            // with Tamagui typing this prop as `ColorTokens`.
                            // `dim`, not `muted`: the placeholder is the field's
                            // only visible label, so it must clear AA, and
                            // Tamagui sets no default, leaving the unreadable
                            // platform placeholder colour on this dark surface.
                            placeholderTextColor={palette.dim as ColorTokens}
                            value={value}
                            onChangeText={onChangeText}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            backgroundColor={palette.raised}
                            borderColor={palette.line}
                            color={palette.text}/>

                        {/* One paste face on both platforms, not two lookalikes.
                            On iOS 16+ with text on the clipboard `PasteOverlay`
                            lays the real `UIPasteControl` over it invisibly, so
                            the tap pastes with no prompt; everywhere else the
                            wrapper's `getStringAsync` fallback runs, where
                            Android's system toast fires on a tap the user just
                            made. Either way the sheet shows its own dot-matrix
                            `PASTE`, not an obvious system control. */}
                        <PasteOverlay
                            native={nativePaste}
                            accessibilityLabel="Paste from clipboard"
                            onPress={paste}
                            onPaste={onPastedText}
                            controlTestID="native-paste"
                            faceTestID="import-paste-face">
                            <PasteFace/>
                        </PasteOverlay>
                    </>
                )}

                {state.status === "resolving" && (
                    <XStack testID="import-resolving" alignItems="center" gap="$3"
                            paddingVertical="$3">
                        <Spinner color={palette.dim}/>
                        <Text color={palette.dim} fontSize={14}>Looking it up…</Text>
                    </XStack>
                )}

                {state.status === "error" && (
                    // Inline, under the field that caused it. The sheet is
                    // already open and holding the input, so this is where the
                    // reader is looking -- and the app's vocabulary has no
                    // native alert in it.
                    <Text color={palette.danger} fontSize={13}
                          // `alert` as well as the live region: the region is
                          // Android-only, so without the role an iOS VoiceOver
                          // user who mistypes a code is told nothing, which
                          // defeats the point of naming the failure. `alert` is
                          // the repo's cross-platform announcement -- see
                          // `XbrwToast` -- and interrupting is right here,
                          // because a lookup that failed is worth interrupting.
                          accessibilityRole="alert"
                          accessibilityLiveRegion="polite">
                        {state.message}
                    </Text>
                )}

                {/* Guidance, not a validation failure, and deliberately not in
                    `danger`: nobody has done anything wrong, they have stopped.
                    Polite so a screen reader picks it up without interrupting,
                    and deliberately not `accessibilityRole="alert"`: unlike the
                    error, this is guidance rather than a failure, so
                    interrupting whatever the reader is doing would be wrong. The
                    cost is that iOS says nothing, which is acceptable for a hint
                    that only repeats what the empty field already implies. */}
                {hint && state.status === "idle" && (
                    <Text color={palette.dim} fontSize={13}
                          accessibilityLiveRegion="polite">
                        {FORMAT_HINT}
                    </Text>
                )}

                {state.status === "found" && (
                    <ImportResult preview={state.preview} onOpen={openFound}/>
                )}
            </YStack>
        </XbrwSheet>
    );
}
