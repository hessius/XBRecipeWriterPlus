import React, {useEffect, useState} from "react";
import {Adapt, Dialog, Sheet, XStack, YStack} from "tamagui";
import {Pressable} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {DURATION} from "@/constants/motion";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /**
     * Draw the title, or keep it only as the dialog's accessible name.
     *
     * The overflow sheet turns it off: its rows say what they do, so a word
     * above them naming the noun they all act on was chrome that carried no
     * information. The name still reaches the screen reader, which has no rows
     * to look at.
     */
    showTitle?: boolean;
    /**
     * How much of the screen the sheet takes, as a percentage.
     *
     * A share of the screen rather than the height of the content. `fit` sizing
     * was tried and is a trap here: Tamagui's fit-mode frame is content-sized,
     * so a `flex: 1` child cannot grow inside it and the frame collapses to
     * nothing. Tamagui compensates for this in its own `Sheet.ScrollView`, but
     * every sheet in this app is reached through `Adapt`, which has to render a
     * dialog on a wide screen as well -- and a `Sheet.ScrollView` in a dialog is
     * not a thing. The sheet that hit this opened at zero height and looked
     * exactly like a control that did nothing.
     */
    heightPercent?: number;
    children: React.ReactNode;
};

/**
 * How long a dismissed sheet is kept in the tree so that it can animate away.
 *
 * A spring has no duration, so this is a ceiling rather than a measurement: it
 * only has to outlast the animation. Being generous costs nothing, because the
 * sheet is invisible and unreachable for the whole of it.
 */
export const EXIT_GRACE = DURATION.deliberate;

/** The house sheet: the ImportRecipeComponent pattern, with a dot-matrix title. */
export default function XbrwSheet({
    open, onOpenChange, title, showTitle = true, heightPercent = 70, children
}: Props) {
    // With `open={false}` and no guard of our own, Tamagui still mounts the
    // sheet frame off screen, so a sheet that has never been opened is in the
    // tree and reachable. The guard cannot simply follow `open`, though:
    // unmounting on the frame the sheet is dismissed takes the animation away
    // with it, and the sheet vanished rather than left. So the tree keeps it
    // for as long as it takes to slide away, and no longer.
    const [rendered, setRendered] = useState(open);
    const [wasOpen, setWasOpen] = useState(open);

    // Adjusted while rendering rather than from an effect. Opening has to take
    // effect on this pass: an effect runs after the paint, so the sheet would
    // spend one frame absent and then appear without its entrance.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setRendered(true);
    }

    useEffect(() => {
        if (open) return;
        const timer = setTimeout(() => setRendered(false), EXIT_GRACE);
        return () => clearTimeout(timer);
    }, [open]);

    if (!rendered) return null;

    // Doto here, and Inter for whatever the caller puts inside. This is the
    // sheet's own chrome — the same register as the deck switch and the toast —
    // rather than copy about the recipe.
    const heading = (
        <XStack alignItems="center" justifyContent={showTitle ? "space-between" : "flex-end"}
                gap="$3">
            {showTitle && (
                <Dialog.Title unstyled>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={palette.dim}>
                        {title}
                    </DotMatrixText>
                </Dialog.Title>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Close"
                       onPress={() => onOpenChange(false)} hitSlop={12}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                               color={palette.dim}>
                    CLOSE
                </DotMatrixText>
            </Pressable>
        </XStack>
    );

    return (
        <Dialog modal open={open} onOpenChange={onOpenChange}>
            <Adapt platform="touch">
                <Sheet transition="quick" zIndex={200000} modal dismissOnSnapToBottom
                       snapPointsMode="percent" snapPoints={[heightPercent]}>
                    <Sheet.Frame padding="$4" backgroundColor={palette.surface}>
                        <Adapt.Contents/>
                    </Sheet.Frame>
                    <Sheet.Overlay transition="quick"
                                   enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
                </Sheet>
            </Adapt>

            <Dialog.Portal>
                <Dialog.Overlay key="overlay" opacity={0.5} transition="quick"
                                enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
                <Dialog.Content bordered elevate maxWidth={440} aria-label={title}
                                transition="quick"
                                enterStyle={{opacity: 0, scale: 0.95, y: 8}}
                                exitStyle={{opacity: 0, scale: 0.95, y: 8}}
                                backgroundColor={palette.surface}>
                    <YStack gap="$3">
                        {heading}
                        {children}
                    </YStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}
