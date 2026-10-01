import React, {useState} from "react";
import {ScrollView, StyleSheet, View} from "react-native";
import ViewShot, {type ViewShotRef} from "react-native-view-shot";
import {XStack, YStack} from "tamagui";

import ExportButton from "@/components/ExportButton";
import RailChip from "@/components/RailChip";
import XbrwSheet from "@/components/XbrwSheet";
import {SCREEN_PADDING} from "@/constants/layout";
import {STORY_ASPECT} from "@/library/brew/storyCard";

export type StoryToggleOption = {
    key: string;
    label: string;
    active: boolean;
    onPress: () => void;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Attached to the `ViewShot` around the card, from `useBrewExport`. */
    shotRef: React.RefObject<ViewShotRef | null>;
    /** True while the share is in flight. */
    busy: boolean;
    onShare: () => void;
    toggles?: StoryToggleOption[];
    /**
     * The card, drawn at the width the sheet has measured for it.
     *
     * A function rather than an element: the card's height follows from its
     * width, so the width has to be decided here, where the space is, and the
     * summary inside the card has to be told the same number.
     */
    children: (width: number) => React.ReactNode;
};

function StoryToggleRow({toggles}: {toggles: StoryToggleOption[]}) {
    if (toggles.length === 0) return null;

    return (
        <ScrollView
            testID="story-toggle-row"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.toggleContent}
        >
            {toggles.map((toggle) => (
                <RailChip
                    key={toggle.key}
                    testID={`story-toggle-${toggle.key}`}
                    active={toggle.active}
                    label={toggle.label}
                    accessibilityLabel={toggle.label}
                    onPress={toggle.onPress}
                />
            ))}
        </ScrollView>
    );
}

/**
 * The story card, shown before it is shared.
 *
 * Previewed rather than captured off-screen. A 9:16 card is twice the height
 * of the summary it is built from, and an off-screen node parked at a negative
 * offset is exactly the arrangement that photographs blank on some Android
 * builds. Showing it also happens to be the better of the two: this is a
 * picture somebody is about to post.
 *
 * The card is drawn at the largest size that fits the sheet whole, so what is
 * captured is what is on the glass at its own natural size. No transform is
 * involved: a scaled node is captured scaled on Android, and a card shrunk to
 * fit would be shared at the size it was shrunk to.
 */
export default function BrewStorySheet({
    open, onOpenChange, shotRef, busy, onShare, toggles = [], children
}: Props) {
    // Measured from an onLayout event rather than derived from the window: the
    // sheet's own height is a share of the screen the sheet decides, and the
    // header and the button below take a bite out of it that only the layout
    // knows about.
    const [box, setBox] = useState({width: 0, height: 0});
    const cardWidth = box.width === 0 || box.height === 0
        ? 0
        : Math.floor(Math.min(box.width, box.height / STORY_ASPECT));

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="STORY CARD"
                   heightPercent={92}>
            <YStack flex={1} gap="$3" paddingBottom="$2">
                <View
                    testID="story-stage"
                    style={{flex: 1, alignItems: "center", justifyContent: "center"}}
                    onLayout={(e) => setBox({
                        width:  e.nativeEvent.layout.width,
                        height: e.nativeEvent.layout.height
                    })}
                >
                    {cardWidth > 0 && (
                        <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                            {children(cardWidth)}
                        </ViewShot>
                    )}
                </View>
                <StoryToggleRow toggles={toggles}/>
                <XStack paddingHorizontal={SCREEN_PADDING}>
                    <ExportButton label="Share the card" busy={busy}
                                  disabled={cardWidth === 0}
                                  onPress={onShare}/>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}

const styles = StyleSheet.create({
    toggleContent: {
        gap:               8,
        paddingHorizontal: SCREEN_PADDING
    }
});
