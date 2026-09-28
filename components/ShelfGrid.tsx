import React from "react";
import {Pressable, ScrollView} from "react-native";
import type {LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent} from "react-native";
import {Gesture, GestureDetector} from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from "react-native-reanimated";
import type {SharedValue} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ShelfTile, {TILE_HEIGHT} from "@/components/ShelfTile";
import {palette} from "@/constants/colors";
import {DURATION, EASING, SPRING, useReducedMotion} from "@/constants/motion";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";
import {hides} from "@/library/hiddenShelves";
import {
    moveShelfIdToSlot,
    shelfSlotAt,
    shelfSlotOrigin
} from "@/library/shelfDrag";
import type {ShelfDragGeometry} from "@/library/shelfDrag";
import type {Shelf} from "@/library/shelves";

/** Two per row. Three is a tile too narrow for a tag of ordinary length. */
const COLUMNS = 2;
/**
 * `$3`, as a number.
 *
 * Every other section lays its tiles out with `gap="$3"` and lets Tamagui
 * resolve it. The arrangeable section positions its tiles absolutely so it can
 * animate them, and an absolute offset cannot take a token, so the one value
 * has to be written out here. It must stay equal to `$3`, or YOUR SHELVES sits
 * a pixel tighter than the sections under it and the tiles come out a different
 * width from every other tile on the screen.
 */
const GRID_GAP = 13;

function Heading({label}: {label: string}) {
    return (
        <DotMatrixText fontSize={12} weight="bold" letterSpacing={2} color={palette.dim}>
            {label}
        </DotMatrixText>
    );
}

/**
 * One titled block of shelves, laid out two to a row.
 *
 * A plain wrapping row rather than a second FlatList. The grid is somewhere the
 * user passes through on the way to a list, and the whole shelf vocabulary is
 * bounded by the stock filters plus however many tags a person typed;
 * nothing here needs recycling, and a nested virtualised list inside a scroll
 * view is the warning React Native gives for exactly this shape.
 *
 * The row is padded to a full pair when the count is odd, so the last tile keeps
 * the width of every other tile instead of stretching across the row and
 * reading as a different kind of thing.
 */
function NewShelfButton({onPress}: {onPress: () => void}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel="New shelf"
                   testID="new-shelf" onPress={onPress}>
            <XStack height={48} alignItems="center" justifyContent="center" gap="$2"
                    borderRadius="$4" borderWidth={1} borderColor={palette.line}
                    backgroundColor={palette.none}>
                <DotIcon name="plus" size={14} color={palette.dim}/>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                               color={palette.dim}>
                    NEW SHELF
                </DotMatrixText>
            </XStack>
        </Pressable>
    );
}

function arrangedIndex(index: number, activeIndex: number, targetSlot: number): number {
    "worklet";
    if (activeIndex === -1 || index === activeIndex || activeIndex === targetSlot) return index;
    if (activeIndex < targetSlot && index > activeIndex && index <= targetSlot) return index - 1;
    if (targetSlot < activeIndex && index >= targetSlot && index < activeIndex) return index + 1;
    return index;
}

function ArrangedShelfTile({
    shelf, members, index, order, tileWidth, geometry, reduced, activeIndex,
    targetSlot, dragX, dragY, dragging, onOpen, onActions, onCommit
}: {
    shelf: Shelf;
    members?: ShelfMarkMembers;
    index: number;
    order: readonly string[];
    tileWidth: number;
    geometry: ShelfDragGeometry;
    reduced: boolean;
    activeIndex: SharedValue<number>;
    targetSlot: SharedValue<number>;
    dragX: SharedValue<number>;
    dragY: SharedValue<number>;
    dragging: SharedValue<number>;
    onOpen: (id: string) => void;
    onActions: (tag: string) => void;
    onCommit: (id: string, slot: number) => void;
}) {
    const canArrange = order.length > 1;
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    const touchX = useSharedValue(0);
    const touchY = useSharedValue(0);
    const ended = useSharedValue(0);

    const pan = Gesture.Pan()
        .enabled(canArrange)
        .activateAfterLongPress(DURATION.lift)
        .onStart((event) => {
            const origin = shelfSlotOrigin(index, geometry);
            activeIndex.set(index);
            targetSlot.set(index);
            ended.set(0);
            startX.set(origin.x);
            startY.set(origin.y);
            touchX.set(event.x);
            touchY.set(event.y);
            dragX.set(origin.x);
            dragY.set(origin.y);
            dragging.set(1);
        })
        .onUpdate((event) => {
            const pointer = {
                x: startX.get() + touchX.get() + event.translationX,
                y: startY.get() + touchY.get() + event.translationY
            };
            dragX.set(pointer.x - touchX.get());
            dragY.set(pointer.y - touchY.get());
            targetSlot.set(shelfSlotAt(pointer, geometry, order.length));
        })
        .onEnd((event) => {
            const slot = targetSlot.get();
            const destination = shelfSlotOrigin(slot, geometry);
            if (reduced) {
                dragX.set(destination.x);
                dragY.set(destination.y);
            } else {
                dragX.set(withSpring(destination.x, {...SPRING.gentle, velocity: event.velocityX}));
                dragY.set(withSpring(destination.y, {...SPRING.gentle, velocity: event.velocityY}));
            }
            ended.set(1);
            dragging.set(withTiming(0, {duration: DURATION.fast, easing: EASING.out}, () => {
                activeIndex.set(-1);
                targetSlot.set(-1);
            }));
            if (slot !== index) {
                scheduleOnRN(onCommit, shelf.id, slot);
            }
        })
        .onFinalize(() => {
            if (activeIndex.get() === index && ended.get() === 0) {
                const origin = shelfSlotOrigin(index, geometry);
                dragX.set(reduced
                    ? origin.x
                    : withSpring(origin.x, SPRING.gentle));
                dragY.set(reduced
                    ? origin.y
                    : withSpring(origin.y, SPRING.gentle));
                dragging.set(withTiming(0, {duration: DURATION.fast, easing: EASING.out}));
                activeIndex.set(-1);
                targetSlot.set(-1);
            }
        });

    const style = useAnimatedStyle(() => {
        const active = activeIndex.get() === index;
        const visualIndex = arrangedIndex(index, activeIndex.get(), targetSlot.get());
        const origin = shelfSlotOrigin(visualIndex, geometry);
        const moving = dragging.get() === 1 && visualIndex !== index;
        const x = active ? dragX.get() : origin.x;
        const y = active ? dragY.get() : origin.y;
        return {
            width:  tileWidth,
            zIndex: active ? 10 : 0,
            opacity: active
                ? withTiming(0.92, {duration: DURATION.fast, easing: EASING.out})
                : withTiming(reduced && moving ? 0.72 : 1, {
                    duration: DURATION.fast,
                    easing:   EASING.out
                }),
            transform: [
                {
                    translateX: active || reduced
                        ? x
                        : withSpring(x, SPRING.gentle)
                },
                {
                    translateY: active || reduced
                        ? y
                        : withSpring(y, SPRING.gentle)
                },
                {
                    scale: active && !reduced
                        ? withSpring(1.03, SPRING.snappy)
                        : withTiming(1, {duration: DURATION.fast, easing: EASING.out})
                }
            ]
        };
    });

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[{position: "absolute"}, style]}>
                <ShelfTile shelf={shelf}
                           members={members}
                           onPress={() => onOpen(shelf.id)}
                           onActions={() => onActions(shelf.label)}
                           // Manual shelf long press belongs to arranging, not
                           // the sheet shortcut. With fewer than two shelves it
                           // deliberately does nothing. The sheet still has a
                           // drawn door: the more glyph inside the tile, plus
                           // the accessibility action for screen readers.
                           onLongPress={null}
                           // The hint is read by a screen reader and nobody
                           // else, so it does not describe the gesture: a
                           // reader cannot make a long press, let alone drag.
                           // What it can do is take the actions, which is where
                           // moving a shelf is offered to it.
                           accessibilityHint={canArrange
                               ? "Shelf options, including moving this shelf, are in the actions."
                               : "Shelf options are in the actions."}/>
            </Animated.View>
        </GestureDetector>
    );
}

function ArrangeableRows({shelves, marks, onOpen, onActions, onRearrange}: {
    shelves: readonly Shelf[];
    marks: Readonly<Record<string, ShelfMarkMembers>>;
    onOpen: (id: string) => void;
    onActions: (tag: string) => void;
    onRearrange: (order: readonly string[]) => void;
}) {
    const [width, setWidth] = React.useState(0);
    const reduced = useReducedMotion();
    const activeIndex = useSharedValue(-1);
    const targetSlot = useSharedValue(-1);
    const dragX = useSharedValue(0);
    const dragY = useSharedValue(0);
    const dragging = useSharedValue(0);
    const tileWidth = width > GRID_GAP ? (width - GRID_GAP) / COLUMNS : 0;
    const geometry = {
        columns:    COLUMNS,
        tileWidth,
        tileHeight: TILE_HEIGHT,
        gapX:       GRID_GAP,
        gapY:       GRID_GAP
    };
    const rows = Math.ceil(shelves.length / COLUMNS);
    const height = rows * TILE_HEIGHT + Math.max(0, rows - 1) * GRID_GAP;
    const order = shelves.map((shelf) => shelf.id);

    function onLayout(event: LayoutChangeEvent) {
        setWidth(event.nativeEvent.layout.width);
    }

    function commit(id: string, slot: number) {
        const next = moveShelfIdToSlot(order, id, slot);
        if (next.some((shelfId, index) => shelfId !== order[index])) {
            onRearrange(next);
        }
    }

    return (
        <YStack onLayout={onLayout} height={height}>
            {tileWidth > 0 && shelves.map((shelf, index) => (
                <ArrangedShelfTile key={shelf.id}
                                   shelf={shelf}
                                   members={marks[shelf.id]}
                                   index={index}
                                   order={order}
                                   tileWidth={tileWidth}
                                   geometry={geometry}
                                   reduced={reduced}
                                   activeIndex={activeIndex}
                                   targetSlot={targetSlot}
                                   dragX={dragX}
                                   dragY={dragY}
                                   dragging={dragging}
                                   onOpen={onOpen}
                                   onActions={onActions}
                                   onCommit={commit}/>
            ))}
            {/*
              * Before the first layout there is no width, so there is no tile
              * geometry and nothing can be positioned. The ordinary rows stand
              * in for that frame, with the long press already withheld so the
              * section does not answer a gesture one way on the first frame
              * and another way on the second.
              *
              * This is also the only path the test renderer ever takes: it
              * reports no layout, so a component test of this section is a
              * test of the rows. The dragging itself is covered by
              * `library/shelfDrag.ts`, which is why the arithmetic lives
              * there.
              */}
            {tileWidth === 0 && (
                <Rows shelves={shelves} marks={marks}
                      onOpen={onOpen} onActions={onActions}
                      actionsOnLongPress={false}/>
            )}
        </YStack>
    );
}

function Rows({shelves, marks, inverted, onOpen, onActions, onHide,
    actionsOnLongPress = true}: {
    shelves: readonly Shelf[];
    marks: Readonly<Record<string, ShelfMarkMembers>>;
    inverted?: boolean;
    onOpen: (id: string) => void;
    onActions?: (tag: string) => void;
    onHide?: (id: string) => void;
    actionsOnLongPress?: boolean;
}) {
    const rows: Shelf[][] = [];
    for (let i = 0; i < shelves.length; i += COLUMNS) {
        rows.push(shelves.slice(i, i + COLUMNS));
    }

    return (
        <YStack gap="$3">
            {rows.map((row) => (
                <XStack key={row[0].id} gap="$3">
                    {row.map((shelf) => (
                        <ShelfTile key={shelf.id} shelf={shelf}
                                   members={marks[shelf.id]}
                                   inverted={inverted}
                                   onPress={() => onOpen(shelf.id)}
                                   onActions={onActions && (() => onActions(shelf.label))}
                                   onLongPress={actionsOnLongPress ? undefined : null}
                                   onHide={onHide && (() => onHide(shelf.id))}/>
                    ))}
                    {row.length < COLUMNS && <YStack flex={1}/>}
                </XStack>
            ))}
        </YStack>
    );
}

/**
 * The shelves the user has put away, and the way back.
 *
 * A footer rather than a settings page, because the annoyance and the remedy
 * should be in the same place: a shelf is hidden from the grid, so it comes
 * back from the grid. It draws only when something is actually hidden, so a
 * library that has never used this never sees a line of admin under its
 * shelves.
 *
 * The names are pressable and nothing else is: there is one thing to do with a
 * shelf that is not on the grid, and a row of tiles here would be a second grid
 * competing with the first.
 */
function HiddenShelves({shelves, onShow}: {
    shelves: readonly Shelf[];
    onShow: (id: string) => void;
}) {
    return (
        <YStack gap="$2" paddingTop="$1" testID="hidden-shelves">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.4}
                           color={palette.muted}>
                {shelves.length === 1 ? "1 HIDDEN" : `${shelves.length} HIDDEN`}
            </DotMatrixText>
            <XStack gap="$2" flexWrap="wrap">
                {shelves.map((shelf) => (
                    <Pressable key={shelf.id}
                               accessibilityRole="button"
                               accessibilityLabel={`Show the ${shelf.label} shelf again`}
                               testID={`shelf-show-${shelf.id}`}
                               onPress={() => onShow(shelf.id)}>
                        <XStack paddingHorizontal="$3" paddingVertical="$2"
                                borderRadius="$3" borderWidth={1}
                                borderColor={palette.line}>
                            <DotMatrixText fontSize={11} weight="bold"
                                           letterSpacing={1.2} color={palette.dim}>
                                {shelf.label}
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                ))}
            </XStack>
        </YStack>
    );
}

/**
 * The shelf grid: the library's other front door.
 *
 * Three sections: `YOUR SHELVES`, `FROM TAGS`, then `AUTO SHELVES`, matching
 * the Doto caps of `NO RECIPES YET`. A section with nothing in it is not drawn
 * at all, heading included: a heading over an empty section is a promise the
 * app cannot keep, and `AUTO SHELVES` over nothing would be the first thing a
 * new user saw.
 *
 * Tapping a tile opens that shelf into its own room, which is this same view
 * with the shelf's recipes on the squares instead of the shelves. It used to
 * apply the shelf and leave for the list; that was reversed in phase 4b after
 * device testing, because dissolving the grid into a filter read as the app
 * undoing the tap. The grid holds no selected state of its own either way --
 * there is nothing to select here, only somewhere to go.
 */
export default function ShelfGrid({
    shelves, marks = {}, invertAuto = false,
    hidden = [], onOpen, onNewShelf, onShelfActions, onRearrange, onHideShelf, onScroll,
    paddingBottom = 0
}: {
    shelves: readonly Shelf[];
    /** What each shelf's art is drawn from, keyed by shelf id. */
    marks?: Readonly<Record<string, ShelfMarkMembers>>;
    /** Which art candidate to draw. From the LABS setting. */
    /** Draw auto tiles accent-first, the glyph square quiet. A preference. */
    invertAuto?: boolean;
    /**
     * The auto shelves the user has put away, in the order they put them away.
     *
     * Passed as the stored list rather than filtered out by the caller, because
     * the footer has to draw the ones that are missing and a caller that
     * removed them would leave nothing to draw.
     */
    hidden?: readonly string[];
    onOpen: (id: string) => void;
    /** Start choosing members for a new shelf. */
    onNewShelf: () => void;
    /** Open the menu of what can be done to a shelf or promoted tag, by its tag. */
    onShelfActions: (tag: string) => void;
    /** Store a complete new order for the shelves the user made. */
    onRearrange?: (order: readonly string[]) => void;
    /** Put an auto shelf away, or bring it back. The same act both ways. */
    onHideShelf?: (id: string) => void;
    /** Drives the screen's collapsing header. */
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    paddingBottom?: number;
}) {
    const manual = shelves.filter((shelf) => shelf.kind === "manual");
    const tagged = shelves.filter((shelf) => shelf.kind === "tag");
    const allAuto = shelves.filter((shelf) => shelf.kind === "auto");
    // Canonically, not by exact id: an author shelf's id carries whichever
    // spelling the representative recipe used, and the grouping behind it is
    // folded, so a library whose representative changes from "café" to "CAFÉ"
    // would present a new id and unhide a shelf the user put away.
    const auto = allAuto.filter((shelf) => !hides(hidden, shelf.id));
    // Only the ones the app could draw. A shelf hidden while it had members and
    // now empty is not offered back, because bringing it back would show the
    // user nothing: the footer counts what is actually being withheld.
    const putAway = allAuto.filter((shelf) => hides(hidden, shelf.id));

    if (shelves.length === 0) {
        return (
            <YStack flex={1} alignItems="center" justifyContent="center"
                    gap="$3" paddingHorizontal="$6" testID="shelves-empty">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    NO SHELVES YET
                </DotMatrixText>
                <Text fontSize={13} color={palette.dim} textAlign="center">
                    A shelf is a saved way of looking at your library. Pick a few
                    recipes and they gather here.
                </Text>
                <NewShelfButton onPress={onNewShelf}/>
            </YStack>
        );
    }

    return (
        <ScrollView testID="shelf-grid"
                    // The header collapses on this view's scroll the same way
                    // it does on the list's. Without it the wordmark and the
                    // tiles stayed up in the one view whose own content is
                    // tiles, which is where the screen is most crowded.
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 12, paddingTop: 12, paddingBottom, gap: 24
                    }}>
            <YStack gap="$2">
                <Heading label="YOUR SHELVES"/>
                {manual.length > 0 && (
                    onRearrange !== undefined ? (
                        <ArrangeableRows shelves={manual} marks={marks}
                                         onOpen={onOpen} onActions={onShelfActions}
                                         onRearrange={onRearrange}/>
                    ) : (
                        <Rows shelves={manual} marks={marks}
                              onOpen={onOpen} onActions={onShelfActions}/>
                    )
                )}
                {/*
                  * The one heading always drawn over what might be nothing. It
                  * is not a heading over an empty section: the button under it
                  * is the section, and it is the only place in the app a shelf
                  * can be made. Hiding it until a shelf existed would be a
                  * feature that cannot be started.
                  */}
                <NewShelfButton onPress={onNewShelf}/>
            </YStack>
            {tagged.length > 0 && (
                <YStack gap="$2">
                    {/*
                      * The nursery. A tag appears here exactly when it has grown
                      * enough to be worth a shelf, which makes the section the
                      * promotion hint as well as the place the tag lives: its
                      * tile offers MAKE THIS A SHELF, and taking it moves the
                      * tag up to YOUR SHELVES for good.
                      */}
                    <Heading label="FROM TAGS"/>
                    <Rows shelves={tagged} marks={marks}
                          onOpen={onOpen} onActions={onShelfActions}/>
                </YStack>
            )}
            {(auto.length > 0 || putAway.length > 0) && (
                <YStack gap="$2">
                    <Heading label="AUTO SHELVES"/>
                    {auto.length > 0 && (
                        <Rows shelves={auto} marks={marks}
                              inverted={invertAuto} onOpen={onOpen}
                              onHide={onHideShelf}/>
                    )}
                    {putAway.length > 0 && onHideShelf !== undefined && (
                        <HiddenShelves shelves={putAway} onShow={onHideShelf}/>
                    )}
                </YStack>
            )}
        </ScrollView>
    );
}
