import React from "react";
import {Dimensions, Platform, Pressable, View} from "react-native";
import Animated, {FadeIn, FadeOut} from "react-native-reanimated";
import {Text, YStack} from "tamagui";

import DotBloom from "@/components/DotBloom";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {HOLD_CARD, NFC_DISABLED, NFC_UNSUPPORTED} from "@/constants/copy";
import {openNfcSettings, type NfcAvailability} from "@/library/NFC";
import {DURATION, useReducedMotion} from "@/constants/motion";

/**
 * How much of the screen CoreNFC's own scanning sheet occupies on iOS.
 *
 * Measured, not guessed. The app cannot draw over it and the only element of it
 * we control is one line of text, via `setNfcAlertIOS`. Everything this
 * component shows on iOS has to fit above this.
 */
const IOS_SYSTEM_SHEET_FRACTION = 0.47;

const BLOOM_SIZE = 140;

type Props = {
    visible: boolean;
    /** Which ceremony this is. Reading and writing look the same and read differently. */
    mode: "read" | "write";
    /** 0–100. */
    progress: number;
    onCancel: () => void;
    /**
     * Why there is no ceremony to run, when there is not one.
     *
     * Null is the ordinary case and the only one iOS ever sees. The other two
     * replace the bloom with an explanation: the user asked for a card and
     * something has to answer, and an overlay that opened onto a spinner which
     * never moved would be worse than saying so.
     */
    unavailable?: Exclude<NfcAvailability, "ready"> | null;
};

/**
 * The card ceremony, in the only two compositions the platforms allow.
 *
 * On iOS the system sheet owns the lower half of the screen, so the app dims
 * itself and stages the bloom in the strip above it — the dimming is what makes
 * our half and the system's half read as one event rather than two overlapping
 * UIs. Our half carries the bloom and one word and nothing else: the sheet
 * already has a Cancel button and a line of text we write into, and repeating
 * either of them directly above it is two controls for one job.
 *
 * On Android there is no system sheet at all, so this is the entire
 * experience: it centres, and it owns the placement copy and the only way out.
 *
 * Replaces `AndroidNFCDialog`, which was Android-only and spoke in a different
 * visual language from everything around it.
 */
export default function NfcOverlay({visible, mode, progress, onCancel, unavailable = null}: Props) {
    const reduced = useReducedMotion();

    if (!visible) {
        return null;
    }

    // With nothing to scan there is no system sheet to stage above, so the
    // iOS composition does not apply even on iOS.
    const isIOS = Platform.OS === "ios" && !unavailable;
    const stageHeight = isIOS
        ? Dimensions.get("window").height * (1 - IOS_SYSTEM_SHEET_FRACTION)
        : undefined;

    const verb = mode === "read" ? "Reading" : "Writing";

    // Writes report block by block, so their percentage means something. Reads
    // report 30, then 50, then 80, around blocking awaits — a number that looks
    // precise and is not. The bloom's own pulse carries a read instead.
    const counts = mode === "write" && !isIOS;

    return (
        <Animated.View
            testID="nfc-overlay"
            // The ceremony owns the screen while it is up. Absolute positioning
            // only covers the host visually: without this, VoiceOver and
            // TalkBack still walk straight through to the header and the
            // controls behind, and can fire them mid-write. iOS honours
            // `accessibilityViewIsModal`; on Android the host screen hides its
            // own descendants instead, which is the half this cannot do.
            accessibilityViewIsModal
            aria-modal
            entering={FadeIn.duration(reduced ? DURATION.fast : DURATION.base)}
            exiting={FadeOut.duration(DURATION.fast)}
            style={{
                position:        "absolute",
                top:             0,
                left:            0,
                right:           0,
                bottom:          0,
                backgroundColor: palette.base,
                opacity:         0.96
            }}>
            <View
                testID="nfc-overlay-stage"
                style={{
                    flex:           1,
                    height:         stageHeight,
                    alignItems:     "center",
                    // iOS stages the content in the strip above the system
                    // sheet; Android owns the whole screen and centres.
                    justifyContent: isIOS ? "flex-start" : "center",
                    paddingTop:     isIOS ? 64 : 0
                }}>
                <YStack alignItems="center" gap="$5" paddingHorizontal="$6">
                    {unavailable ? (
                        <YStack alignItems="center" gap="$2">
                            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                                           color={palette.text}>
                                {unavailable === "disabled" ? "NFC IS OFF" : "NO NFC"}
                            </DotMatrixText>
                            <Text fontSize={14} textAlign="center" color={palette.dim}>
                                {unavailable === "disabled" ? NFC_DISABLED : NFC_UNSUPPORTED}
                            </Text>
                        </YStack>
                    ) : (
                        <>
                            <DotBloom progress={progress / 100} size={BLOOM_SIZE}/>

                            <YStack alignItems="center" gap="$2">
                                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                                               color={palette.text}>
                                    {counts
                                        ? `${verb.toUpperCase()} ${Math.round(progress)}%`
                                        : verb.toUpperCase()}
                                </DotMatrixText>
                                {!isIOS && (
                                    <Text fontSize={14} textAlign="center" color={palette.dim}>
                                        {HOLD_CARD}
                                    </Text>
                                )}
                            </YStack>
                        </>
                    )}

                    {/* A switch the user can go and flip. Offered for that one
                        case only: there is no setting behind a phone that has
                        no controller, and a button that opens a screen with
                        nothing on it reads as a broken promise. */}
                    {unavailable === "disabled" && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Open NFC settings"
                            onPress={() => {
                                void openNfcSettings();
                            }}
                            style={{
                                minHeight:         44,
                                minWidth:          44,
                                justifyContent:    "center",
                                alignItems:        "center",
                                paddingVertical:   12,
                                paddingHorizontal: 24
                            }}>
                            <Text fontSize={16} color={palette.text}>
                                Open NFC settings
                            </Text>
                        </Pressable>
                    )}

                    {/* The way out. Always there when the overlay is the whole
                        screen, and there on iOS too when there is no ceremony
                        underneath it: Apple's sheet carries Cancel, but an
                        unavailable overlay has no sheet under it to carry one. */}
                    {(!isIOS || unavailable) && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={unavailable ? "Close" : "Cancel"}
                            onPress={onCancel}
                            style={{
                                minHeight:         44,
                                minWidth:          44,
                                justifyContent:    "center",
                                alignItems:        "center",
                                paddingVertical:   12,
                                paddingHorizontal: 24
                            }}>
                            <Text fontSize={16} color={palette.dim}>
                                {unavailable ? "Close" : "Cancel"}
                            </Text>
                        </Pressable>
                    )}
                </YStack>
            </View>
        </Animated.View>
    );
}
