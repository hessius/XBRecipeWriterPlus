import * as Clipboard from "expo-clipboard";
import React, {type ReactNode} from "react";
import {
    Pressable,
    type PressableStateCallbackType,
    type StyleProp,
    StyleSheet,
    View,
    type ViewStyle
} from "react-native";

import {palette} from "@/constants/colors";

type Props = {
    /**
     * Whether to overlay the invisible native `UIPasteControl`.
     *
     * True only on iOS 16+ with conformant text on the clipboard. When true the
     * tap reaches the control -- which is what buys the no-prompt paste -- and
     * `onPaste` fires; when false the affordance is the face alone and a tap
     * reaches `onPress`.
     */
    native: boolean;
    /** The one announced element. Carried by the wrapper, never the control. */
    accessibilityLabel: string;
    /**
     * The fallback tap: the native control is absent, or rendered but declined
     * the touch (iOS < 16 renders nothing; an inactive control most likely
     * still swallows it -- device-verified, not guaranteed).
     */
    onPress: () => void;
    /** Text the native control handed back, or `""` for an image/denied paste. */
    onPaste: (text: string) => void;
    controlTestID?: string;
    faceTestID?: string;
    style?: StyleProp<ViewStyle>;
    faceStyle?: StyleProp<ViewStyle>;
    /** The affordance's own face -- the single definition of how it looks. */
    children: ReactNode;
};

/**
 * The app's own face with an invisible `UIPasteControl` laid over it.
 *
 * Both the `IMPORT` tile and the sheet's `PASTE` button want the same thing: a
 * house-styled affordance that, on iOS 16+, is really a `UIPasteControl` so a
 * tap pastes with no "Allow Paste?" prompt -- because with that control the tap
 * *is* the consent. This is where that mechanism lives once instead of twice.
 *
 * The control is made invisible by **view alpha** (`opacity: 0.02`), not by its
 * own colours: iOS treats a `UIPasteControl`'s background/foreground as
 * *requests* and overrides them when the result would be illegible -- an
 * invisible glyph on an identical background is exactly that, because it is a
 * privacy control defending its own visibility. A parent view's alpha is outside
 * that enforcement. `0.02` is below the threshold of visibility yet deliberately
 * **above** UIKit's `alpha < 0.01` hit-testing cutoff, so the control still
 * receives the tap; `0` would drop it from hit-testing and silently break the
 * shortcut. The matched `raised`/`raised` colours stay as belt-and-braces should
 * the alpha ever be clamped.
 *
 * The wrapper -- not the control -- carries the label and the fallback route,
 * and the control is hidden from the accessibility tree it would otherwise force
 * itself into announcing "Paste". So exactly one element is announced, and it is
 * the one a synthesized activation reaches.
 */
export default function PasteOverlay({
    native,
    accessibilityLabel,
    onPress,
    onPaste,
    controlTestID,
    faceTestID,
    style,
    faceStyle,
    children
}: Props) {
    const wrapperStyle = ({pressed}: PressableStateCallbackType): StyleProp<ViewStyle> => [
        style,
        // Press feedback belongs to the house affordance only: in native mode
        // the `UIPasteControl` above draws its own, and dimming the wrapper
        // beneath it would double up.
        !native && pressed ? styles.pressed : null
    ];

    return (
        <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            style={wrapperStyle}>
            <View
                testID={faceTestID}
                // Lets a sighted tap fall through to the control beneath; the
                // wrapper is the tap target in the no-control case.
                pointerEvents="none"
                style={faceStyle}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                {children}
            </View>

            {native && (
                <Clipboard.ClipboardPasteButton
                    testID={controlTestID}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    displayMode="iconOnly"
                    // A rounded rect closer to the tile than a `capsule`, for the
                    // fallback case where the alpha is ever clamped.
                    cornerStyle="medium"
                    // The default also accepts `image`, which would activate the
                    // control on an image clipboard and deliver a payload with no
                    // text. `url` keeps shared links active.
                    acceptedContentTypes={["plain-text", "url"]}
                    backgroundColor={palette.raised}
                    foregroundColor={palette.raised}
                    onPress={(data) => onPaste(data.type === "text" ? data.text : "")}
                    style={[StyleSheet.absoluteFill, styles.ghost]}/>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    // Below UIKit's `alpha < 0.01` hit-testing cutoff would drop the control from
    // touch entirely and silently break the shortcut; above it, `0.02` is
    // invisible yet still tappable. A future reader must not "tidy" this to `0`.
    ghost:   {opacity: 0.02},
    pressed: {opacity: 0.7}
});
