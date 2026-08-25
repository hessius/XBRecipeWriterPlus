import * as Clipboard from "expo-clipboard";
import {useFocusEffect} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, View} from "react-native";

import CtaTile from "@/components/CtaTile";
import {palette} from "@/constants/colors";

/** The face is decorative; every route to the sheet lives on the wrapper. */
const noop = () => {};

/**
 * Whether the tile should disguise itself as a `UIPasteControl`.
 *
 * Hoisted to module scope so every sampling path shares one body rather than
 * repeating the whole clipboard/screen-reader dance.
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

    /**
     * Which clipboard sample is the newest.
     *
     * Four paths sample independently -- mount, `AppState` `active`, the focus
     * effect and `screenReaderChanged` -- and each is a `Promise.all` of two
     * async calls that resolve in completion order, not start order. Without a
     * generation counter an *earlier* sample resolving *last* would overwrite a
     * newer answer: VoiceOver switched on during a foreground would leave the
     * disguised control up because the `active` sample (`true`) landed after the
     * `screenReaderChanged` sample (`false`). `useRecipeImport` solves the same
     * class the same way; the check is shared by all four paths here.
     */
    const generation = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const refresh = () => {
            const mine = ++generation.current;
            void clipboardPasteMode().then((mode) => {
                // Two guards, different jobs: `cancelled` blocks a set after the
                // component unmounts (the generation counter alone would not, as
                // unmount does not advance it); the generation check drops a
                // superseded sample that resolves out of order.
                if (!cancelled && mine === generation.current) setPasteMode(mode);
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
            const mine = ++generation.current;
            void clipboardPasteMode().then((mode) => {
                if (active && mine === generation.current) setPasteMode(mode);
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
        // The wrapper -- not the disguised control -- carries the label and the
        // `onOpen` route, for two reasons:
        //
        //  - Fallback. A real tap only reaches here when the control on top
        //    declines it. It declines cleanly when it renders *nothing*
        //    (`isPasteButtonAvailable` flips false, iOS < 16). It is far less
        //    clear that a control that renders but is *inactive* -- an HTML-only
        //    clipboard makes `hasStringAsync` true while nothing conforms to
        //    `acceptedContentTypes`, or the clipboard is cleared between sample
        //    and tap -- lets the tap through. The expo wrapper
        //    (`node_modules/expo-clipboard/ios/ClipboardPasteButton.swift`)
        //    never touches `isEnabled`/`isUserInteractionEnabled`; UIKit manages
        //    the `UIPasteControl`'s active state itself from its
        //    `pasteConfiguration`. UIKit hit-testing skips a view only when it
        //    is hidden, `alpha < 0.01`, or has user interaction disabled -- it
        //    does *not* skip a merely *disabled* `UIControl`, so an inactive
        //    control most likely still swallows the touch and this wrapper never
        //    sees it. Whether `UIPasteControl` clears `isUserInteractionEnabled`
        //    when inactive is undocumented and invisible from JS. So this
        //    covers the renders-nothing case honestly and no more; the
        //    inactive-control case is device-verifiable and is on the §8/Task 22
        //    checklist (copy rich text from Safari, tap IMPORT, expect the
        //    sheet).
        //
        //  - Accessibility. `pointerEvents="none"` hides the face from *touch*
        //    but not from the accessibility tree, and the native control forces
        //    itself into that tree announcing "Paste". `isScreenReaderEnabled()`
        //    is false for Voice Control, Switch Control and Full Keyboard
        //    Access, so those users see paste mode permanently. Making the
        //    wrapper the single `accessible` element, hiding the control from
        //    accessibility, and hanging `onOpen` on the wrapper means the one
        //    announced element ("Import a recipe") is also the one a synthesized
        //    activation reaches.
        <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Import a recipe"
            onPress={onOpen}
            style={styles.wrapper}>
            {/* The visible tile face. Decorative: `pointerEvents="none"` so a
                sighted tap falls through to the control -- with that control the
                tap is the consent, so it must be the layer that receives it --
                and it gives the stack its height as the only in-flow child.
                Hidden from accessibility so the wrapper is the sole announced
                element rather than a second one saying "Import a recipe"
                underneath the control's "Paste". */}
            <View testID="import-tile-face" pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                <CtaTile icon="import" label="IMPORT" onPress={noop}/>
            </View>

            {/* Rendered last, so it is the topmost layer and receives the tap.
                Coloured to the tile rather than zeroed in opacity: an
                opacity-zero control is far more likely to be treated as hidden
                by UIKit than one that is merely the same colour as what is
                behind it. `iconOnly` and `foregroundColor` = `raised` leave no
                visible glyph, so the tile's own face reads instead.
                `accessibilityElementsHidden` / `no-hide-descendants` keep it out
                of the accessibility tree it would otherwise force itself into,
                so only the wrapper is announced. No cast is needed here (unlike
                `placeholderTextColor` in `ImportSheet`): these props are typed
                `string | null`, which the raw palette string already satisfies. */}
            <Clipboard.ClipboardPasteButton
                testID="native-paste-control"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
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
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {flex: 1}
});
