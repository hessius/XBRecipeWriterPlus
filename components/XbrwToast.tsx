import React from "react";
import {toast as libToast} from "@backpackapp-io/react-native-toast";
import {Text, XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import {
    libTypeToTone,
    resolveNotice,
    toneToLibType,
    type Notice,
    type NoticeTone
} from "@/library/notify";

const GLYPH_SIZE = 20;

/** Per-tone accent, used for the glyph and the leading rule only. */
const TONE_COLOUR: Record<NoticeTone, string> = {
    success: palette.success,
    error:   palette.danger,
    info:    palette.info
};

type Props = {
    /** The toast library's own type tag. Translated back into a tone here. */
    type: string;
    message: string;
};

/**
 * The body of every toast in the app.
 *
 * Rendered from the single `children` render prop on `<Toasts>` rather than
 * per call site, so there is exactly one place where a toast is styled and a
 * caller cannot invent a variant.
 *
 * The message is prose and stays in Inter — the typography rule is that Doto is
 * for machine-derived values, and an error sentence is not one.
 */
export function XbrwToast({type, message}: Props) {
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
            alignItems="center"
            gap="$3"
            paddingVertical="$3"
            paddingHorizontal="$3.5"
            borderRadius="$6"
            borderWidth={1}
            borderColor={palette.line}
            borderLeftWidth={3}
            borderLeftColor={colour}
            backgroundColor={palette.raised}
            maxWidth={420}>
            <DotIcon name={notice.glyph} size={GLYPH_SIZE} color={colour} animated/>
            <Text flex={1} fontSize={14} color={palette.text}>
                {message}
            </Text>
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
        customToast: () => <XbrwToast type={type} message={notice.message}/>
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
