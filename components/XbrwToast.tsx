import React from "react";
import {toast as libToast} from "@backpackapp-io/react-native-toast";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    libTypeToTone,
    resolveNotice,
    toneToLibType,
    type Notice,
    type NoticeTone
} from "@/library/notify";

const GLYPH_SIZE = 22;

/**
 * The width to fall back to when the library has not measured one.
 *
 * Only reached when the component is rendered outside the toaster, which is to
 * say in a test; the library always passes a width in the app.
 */
const FALLBACK_WIDTH = 360;

/** Per-tone accent, used for the glyph and its label. */
const TONE_COLOUR: Record<NoticeTone, string> = {
    success: palette.success,
    error:   palette.danger,
    info:    palette.info
};

type Props = {
    /** The toast library's own type tag. Translated back into a tone here. */
    type: string;
    message: string;
    /**
     * The width the library measured, handed to every `customToast`.
     *
     * Applied rather than ignored because the wrapper the library renders
     * `customToast` into has no width of its own: the toast is shrink-to-fit,
     * and a message set to `flex: 1` has a flex basis of zero, so it adds
     * nothing to the parent's intrinsic width and is then laid out at zero
     * width. On device that showed as a toast with a glyph, a border, and no
     * text between them.
     */
    width?: number;
};

/**
 * The body of every toast in the app.
 *
 * Rendered from a single place rather than per call site, so there is exactly
 * one place a toast is styled and a caller cannot invent a variant.
 *
 * Two lines: the machine names the tone, then says the thing. The label is
 * machine-derived and is Doto; the sentence is written for a person and stays
 * in Inter.
 */
export function XbrwToast({type, message, width = FALLBACK_WIDTH}: Props) {
    const tone = libTypeToTone(type);
    const notice = resolveNotice({tone, message});
    const colour = TONE_COLOUR[tone];

    return (
        <XStack
            // A toast cannot be focused or tapped, so without an explicit
            // element and label a screen reader user gets nothing at all.
            accessible
            accessibilityRole="alert"
            accessibilityLabel={message}
            width={width}
            alignItems="flex-start"
            gap="$3"
            paddingVertical="$3"
            paddingHorizontal="$3.5"
            borderRadius="$6"
            borderWidth={1}
            borderColor={palette.line}
            backgroundColor={palette.surface}>
            <DotIcon name={notice.glyph} size={GLYPH_SIZE} color={colour} animated/>
            <YStack flexShrink={1} gap="$1">
                {/* The machine naming what it is about to say. Doto is for
                    machine-derived values, and a tone is one; the sentence
                    underneath is written for a person and stays in Inter. */}
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                               color={colour}>
                    {notice.label}
                </DotMatrixText>
                <Text fontSize={14} color={palette.text}>
                    {message}
                </Text>
            </YStack>
        </XStack>
    );
}

/**
 * Show a notice.
 *
 * The one way the app says anything transient. Callers pass a tone and a
 * message; everything else — glyph, colour, duration, position — is decided
 * here and in `library/notify.ts`.
 *
 * The installed toast library has no `children` render prop on `<Toasts>` —
 * that API does not exist in this version's source. Instead each dispatch
 * supplies its own `customToast`, which is still the single place a toast is
 * styled, since `notify` is the only export a caller ever reaches for.
 *
 * Native `Alert` must not be used anywhere in the app: it is the one surface the
 * design language cannot reach, and reaching for it means the app changes voice
 * at exactly the moment the user is most frustrated.
 */
export function notify(notice: Notice): void {
    const {duration} = resolveNotice(notice);
    const type = toneToLibType(notice.tone);
    const options = {
        duration,
        customToast: (queued: {width?: number}) => (
            // The library hands each `customToast` the width it measured for
            // that toast, accounting for the screen and the safe-area insets.
            // Passing it on is what stops the body being laid out shrink-to-fit.
            <XbrwToast type={type} message={notice.message} width={queued.width}/>
        )
    };

    if (notice.tone === "success") {
        libToast.success(notice.message, options);
    } else if (notice.tone === "error") {
        libToast.error(notice.message, options);
    } else {
        libToast(notice.message, options);
    }
}

export default XbrwToast;
