import * as Clipboard from "expo-clipboard";
import React, {useEffect, useState} from "react";
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
    /**
     * Whether there is anything to type.
     *
     * False for a share intent and for the tile's paste shortcut: both deliver
     * a complete value in one event, so a field would be an empty box beside a
     * lookup already running. This is the only branch in the sheet, and it is
     * exactly the atomic/deliberate distinction that also decides whether the
     * hook navigates on its own.
     */
    showField: boolean;
    importer: RecipeImport;
};

/**
 * The one import sheet, reached from three doors.
 *
 * Layout only. Every rule about when a lookup starts, whether it navigates and
 * what is said when it fails belongs to `useRecipeImport`.
 */
export default function ImportSheet({open, onOpenChange, showField, importer}: Props) {
    const {state, value, hint, onChangeText, onPastedText, openFound} = importer;
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
                            // Only when open: `prewarm` renders these real
                            // children in a hidden view while the sheet is
                            // closed, and a mounted `TextInput` calls `focus()`
                            // regardless of layout, so an unconditional
                            // `autoFocus` would raise the keyboard on the home
                            // screen with no visible field.
                            autoFocus={open}
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
