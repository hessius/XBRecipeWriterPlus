import React, {useEffect, useState} from "react";
import {Sheet, XStack, YStack} from "tamagui";
import {InteractionManager, Pressable, View} from "react-native";

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
    /**
     * Build the contents before they are asked for.
     *
     * Off by default, and deliberately opt-in: the warm copy is a second render
     * of `children`, so it is only safe for a body that is a picture of its
     * props. A child that fetches, subscribes or writes on mount would do it
     * twice, and do it while nobody is looking.
     */
    prewarm?: boolean;
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
    open, onOpenChange, title, showTitle = true, heightPercent = 70,
    prewarm = false, children
}: Props) {
    // The sheet is put in the tree closed, and opened on the frame after.
    //
    // Tamagui animates the entrance by transitioning from closed to open, so a
    // sheet that arrives already open has nothing to transition from and simply
    // appears at its resting place. Mounting it a frame early costs one frame
    // and buys the slide.
    //
    // It is taken back out again once it has finished leaving, rather than on
    // the frame it is dismissed: unmounting immediately would take the exit
    // animation with it, and the sheet would vanish rather than leave.
    const [rendered, setRendered] = useState(open);
    const [shown, setShown] = useState(open);
    const [wasOpen, setWasOpen] = useState(open);

    // Adjusted while rendering rather than from an effect, so that the mount
    // and the dismissal both take effect on this pass. Only the opening waits.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setRendered(true);
        else setShown(false);
    }

    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    useEffect(() => {
        if (open) return;
        const timer = setTimeout(() => setRendered(false), EXIT_GRACE);
        return () => clearTimeout(timer);
    }, [open]);

    // Once the screen has finished whatever it was doing. The whole point is to
    // move this cost somewhere nobody is waiting, and running it during the
    // navigation that brought the screen here would simply move the hitch.
    const [warm, setWarm] = useState(false);
    useEffect(() => {
        if (!prewarm || warm) return;
        const task = InteractionManager.runAfterInteractions(() => setWarm(true));
        return () => task.cancel();
    }, [prewarm, warm]);

    if (!rendered) {
        // Laid out at the real width so the text is measured the way it will be
        // measured for real -- that measurement is what is being bought -- but
        // clipped to no height, so it cannot affect the screen it sits in. It
        // is hidden from the screen reader and cannot be touched, which is the
        // same guarantee the unmounted sheet gave.
        return warm ? (
            <View testID="sheet-prewarm" pointerEvents="none"
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                  style={{
                      position: "absolute",
                      left:     0,
                      right:    0,
                      top:      0,
                      height:   0,
                      opacity:  0,
                      overflow: "hidden"
                  }}>
                {children}
            </View>
        ) : null;
    }

    // Doto here, and Inter for whatever the caller puts inside. This is the
    // sheet's own chrome — the same register as the deck switch and the toast —
    // rather than copy about the recipe.
    const heading = (
        <XStack alignItems="center" justifyContent={showTitle ? "space-between" : "flex-end"}
                gap="$3">
            {showTitle && (
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                               color={palette.dim}>
                    {title}
                </DotMatrixText>
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

    // Not `modal`, which is the tempting default and is what broke the exit.
    //
    // A modal sheet is hung inside a gesture-handler root whose style is
    // `height: 0` whenever the sheet is closed. That style is applied on the
    // frame the sheet is dismissed rather than after it has left, so the body
    // and the backdrop are cut away instantly and only the empty frame is left
    // to slide out. Filmed at 60fps, the difference is unmistakable: without
    // `modal` the rows travel down with the frame and the backdrop fades.
    //
    // Nothing is lost by dropping it here. A modal sheet buys the right to sit
    // above the navigator, and every sheet in this app is opened from a screen
    // that draws its own header, so there is nothing above to sit over.
    return (
        <Sheet transition="sheet" zIndex={200000} dismissOnSnapToBottom
               open={shown} onOpenChange={onOpenChange}
               snapPointsMode="percent" snapPoints={[heightPercent]}>
            <Sheet.Overlay transition="quick"
                           enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
            {/* The name and the modal flag go on the body, not on the frame:
                Tamagui renders a second, empty copy of the frame, and two
                sibling views that each claim to be the modal one make a screen
                reader treat the other as hidden -- including the one with the
                content in it. */}
            <Sheet.Frame padding="$4" backgroundColor={palette.surface}>
                {/* Modal only while it is actually up. It stays in the tree
                    through its exit, and a sheet on its way out must not go on
                    hiding the screen it is uncovering. */}
                <YStack gap="$3" aria-label={title} accessibilityViewIsModal={shown}>
                    {heading}
                    {children}
                </YStack>
            </Sheet.Frame>
        </Sheet>
    );
}
