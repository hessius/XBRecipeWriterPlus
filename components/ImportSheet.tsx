import * as Clipboard from "expo-clipboard";
import React, {useEffect, useState} from "react";
import {Input, Spinner, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import ImportResult from "@/components/ImportResult";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {RecipeImport} from "@/hooks/useRecipeImport";

const FIELD_LABEL = "Share link or pod code";
const FORMAT_HINT = "Paste an xBloom share link, or a pod code like ETH120.";

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
                            value={value}
                            onChangeText={onChangeText}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            autoFocus
                            backgroundColor={palette.raised}
                            borderColor={palette.line}
                            color={palette.text}/>

                        {/* Not disguised, unlike the tile: in here the paste is
                            the action the user came for, so it says so. On iOS
                            16+ with something to paste it is the real system
                            control, promoted to the primary action -- which
                            also means no prompt. Everywhere else it is a house
                            button calling `getStringAsync`, where Android's
                            system toast fires on a tap the user just made. */}
                        {nativePaste ? (
                            <Clipboard.ClipboardPasteButton
                                testID="native-paste"
                                displayMode="iconAndLabel"
                                cornerStyle="capsule"
                                backgroundColor={palette.raised}
                                foregroundColor={palette.text}
                                onPress={(data) => onPastedText(data.type === "text" ? data.text : "")}
                                style={{height: 48, width: "100%"}}/>
                        ) : (
                            <XStack
                                accessible
                                accessibilityRole="button"
                                accessibilityLabel="Paste from clipboard"
                                onPress={paste}
                                alignItems="center"
                                justifyContent="center"
                                paddingVertical="$3"
                                borderRadius="$6"
                                backgroundColor={palette.raised}
                                borderWidth={1}
                                borderColor={palette.line}
                                pressStyle={{opacity: 0.7, scale: 0.99}}>
                                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                               color={palette.text}>
                                    PASTE
                                </DotMatrixText>
                            </XStack>
                        )}
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
                          accessibilityLiveRegion="polite">
                        {state.message}
                    </Text>
                )}

                {/* Guidance, not a validation failure, and deliberately not in
                    `danger`: nobody has done anything wrong, they have stopped.
                    Polite so a screen reader picks it up without interrupting. */}
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
