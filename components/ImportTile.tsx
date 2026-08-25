import * as Clipboard from "expo-clipboard";
import {useFocusEffect} from "expo-router";
import React, {useEffect, useState} from "react";
import {AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, View} from "react-native";
import {YStack} from "tamagui";

import CtaTile from "@/components/CtaTile";
import {palette} from "@/constants/colors";

/**
 * Whether the tile should disguise itself as a `UIPasteControl`.
 *
 * Hoisted to module scope so the mount effect and the focus effect share one
 * body rather than repeating the whole clipboard/screen-reader dance twice.
 *
 * `isPasteButtonAvailable` is iOS 16+ only, so this is false on Android and iOS
 * 15 without ever touching the clipboard. `hasStringAsync` is the *presence*
 * check, which is silent on both platforms -- reading the contents is what would
 * cost a prompt, and that only happens on the tap the user just made.
 */
async function clipboardPasteMode(): Promise<boolean> {
    // Kept explicit even though `isPasteButtonAvailable` already implies iOS:
    // Android has no `UIPasteControl`, and the gate should say so at the top
    // rather than depend on that implication holding.
    if (Platform.OS !== "ios" || !Clipboard.isPasteButtonAvailable) {
        return false;
    }
    const [hasText, screenReader] = await Promise.all([
        Clipboard.hasStringAsync(),
        AccessibilityInfo.isScreenReaderEnabled()
    ]);
    // Not under a screen reader: the native control announces itself as "Paste"
    // whatever is drawn over it, so a VoiceOver user would hear a label
    // contradicting the tile. The shortcut is a sighted convenience; what is
    // announced stays honest.
    return hasText && !screenReader;
}

type Props = {
    /** Open the sheet with an empty field. */
    onOpen: () => void;
    /** Text from the paste control, which may or may not parse. */
    onPasted: (text: string) => void;
};

/**
 * The `IMPORT` tile, and its iOS paste shortcut.
 *
 * Wraps `CtaTile` rather than changing it: `CtaTile` is shared with `READ CARD`
 * and should not learn about clipboards.
 *
 * On iOS 16+ with text on the clipboard the tile is a `UIPasteControl` coloured
 * to disappear into itself, so one tap pastes and -- if the value parses --
 * starts resolving, with no prompt, because with that control the tap *is* the
 * consent. Everywhere else it is an ordinary pressable that opens the sheet.
 *
 * `hasStringAsync` reports that text exists, not that it is an xBloom link, so
 * most taps in paste mode will hand over something irrelevant. Every one of
 * those degrades to exactly what the tile would have done anyway: the sheet
 * opens with an empty field. That fallback is what makes the shortcut safe.
 *
 * Recorded risk: this is a disguised system privacy control and Apple may
 * reject it. The remedy is to force `pasteMode` false, and nothing else breaks.
 */
export default function ImportTile({onOpen, onPasted}: Props) {
    const [pasteMode, setPasteMode] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const refresh = () => {
            void clipboardPasteMode().then((mode) => {
                if (!cancelled) setPasteMode(mode);
            });
        };

        refresh();

        // The clipboard, and VoiceOver, both change behind the app's back, so
        // the answer is stale the moment it is computed. Re-asked when the app
        // foregrounds, when the screen reader is toggled mid-session, and -- by
        // the focus effect below -- when the screen regains focus.
        const app = AppState.addEventListener("change", (next) => {
            if (next === "active") refresh();
        });
        const reader = AccessibilityInfo.addEventListener("screenReaderChanged", refresh);

        return () => {
            cancelled = true;
            app.remove();
            reader.remove();
        };
    }, []);

    useFocusEffect(
        // `useFocusEffect` demands a stable callback, which is the one place the
        // repo hand-writes `React.useCallback` despite the React Compiler owning
        // memoisation elsewhere -- see `app/index.tsx`. The deps are empty on
        // purpose: this must re-run on focus, not on render.
        React.useCallback(() => {
            let active = true;
            void clipboardPasteMode().then((mode) => {
                if (active) setPasteMode(mode);
            });
            return () => {
                active = false;
            };
        }, [])
    );

    if (!pasteMode) {
        return (
            <CtaTile icon="import" label="IMPORT"
                     accessibilityLabel="Import a recipe" onPress={onOpen}/>
        );
    }

    return (
        <YStack flex={1}>
            {/* Underneath everything: if the native control ever fails to mount,
                a tap still lands here and opens the sheet, so the tile is never
                dead furniture. Hidden from the accessibility tree because the
                visible `CtaTile` above is the announced element. */}
            <Pressable
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onPress={onOpen}
                style={StyleSheet.absoluteFill}/>

            {/* Coloured to the tile rather than zeroed in opacity: an
                opacity-zero control is far more likely to be treated as hidden
                by UIKit than one that is merely the same colour as what is
                behind it. `iconOnly` and `foregroundColor` = `raised` leave no
                visible glyph, so the tile's own face reads instead. No cast is
                needed here (unlike `placeholderTextColor` in `ImportSheet`):
                these props are typed `string | null`, which the raw palette
                string already satisfies. */}
            <Clipboard.ClipboardPasteButton
                testID="native-paste-control"
                displayMode="iconOnly"
                cornerStyle="capsule"
                // The default also accepts `image`, so an image on the clipboard
                // could activate the control and deliver a payload with no text;
                // `url` keeps shared links active. Same choice `ImportSheet`
                // makes for the visible in-sheet control.
                acceptedContentTypes={["plain-text", "url"]}
                backgroundColor={palette.raised}
                foregroundColor={palette.raised}
                onPress={(data) => {
                    // `PasteEventPayload` is a union; only the text arm carries a
                    // string. An empty or blank value means an empty clipboard or
                    // a denied paste -- iOS gives no way to tell them apart -- so
                    // open the sheet exactly as a plain tap would have.
                    const text = data.type === "text" ? data.text : "";
                    if (text.trim().length === 0) {
                        onOpen();
                        return;
                    }
                    onPasted(text);
                }}
                style={StyleSheet.absoluteFill}/>

            {/* The visible tile face, laid over the invisible control with
                `pointerEvents` none so the tap falls through to the
                `UIPasteControl` beneath -- with that control the tap is the
                consent, so it must be the layer that receives it. This is also
                the only in-flow child, so it gives the stack its height and the
                absolute layers something to fill. */}
            <View pointerEvents="none">
                <CtaTile icon="import" label="IMPORT"
                         accessibilityLabel="Import a recipe" onPress={onOpen}/>
            </View>
        </YStack>
    );
}
