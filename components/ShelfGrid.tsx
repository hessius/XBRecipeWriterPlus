import React from "react";
import {Pressable, ScrollView} from "react-native";
import type {NativeScrollEvent, NativeSyntheticEvent} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ShelfTile from "@/components/ShelfTile";
import {palette} from "@/constants/colors";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";
import type {ShelfMarkVariant} from "@/library/Settings";
import type {Shelf} from "@/library/shelves";

/** Two per row. Three is a tile too narrow for a tag of ordinary length. */
const COLUMNS = 2;

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
 * bounded by the twelve stock filters plus however many tags a person typed;
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

function Rows({shelves, marks, variant, inverted, onOpen, onActions, onHide}: {
    shelves: readonly Shelf[];
    marks: Readonly<Record<string, ShelfMarkMembers>>;
    variant: ShelfMarkVariant;
    inverted?: boolean;
    onOpen: (id: string) => void;
    onActions?: (tag: string) => void;
    onHide?: (id: string) => void;
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
                                   variant={variant}
                                   inverted={inverted}
                                   onPress={() => onOpen(shelf.id)}
                                   onActions={onActions && (() => onActions(shelf.label))}
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
 * Two sections, `YOUR SHELVES` then `AUTO SHELVES`, matching the Doto caps of
 * `NO RECIPES YET`. A section with nothing in it is not drawn at all, heading
 * included: a heading over an empty section is a promise the app cannot keep,
 * and `AUTO SHELVES` over nothing would be the first thing a new user saw.
 *
 * Tapping a tile opens that shelf into its own room, which is this same view
 * with the shelf's recipes on the squares instead of the shelves. It used to
 * apply the shelf and leave for the list; that was reversed in phase 4b after
 * device testing, because dissolving the grid into a filter read as the app
 * undoing the tap. The grid holds no selected state of its own either way --
 * there is nothing to select here, only somewhere to go.
 */
export default function ShelfGrid({
    shelves, marks = {}, variant = "hybrid", invertAuto = false,
    hidden = [], onOpen, onNewShelf, onShelfActions, onHideShelf, onScroll,
    paddingBottom = 0
}: {
    shelves: readonly Shelf[];
    /** What each shelf's art is drawn from, keyed by shelf id. */
    marks?: Readonly<Record<string, ShelfMarkMembers>>;
    /** Which art candidate to draw. From the LABS setting. */
    variant?: ShelfMarkVariant;
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
    /** Open the menu of what can be done to a manual shelf, by its tag. */
    onShelfActions: (tag: string) => void;
    /** Put an auto shelf away, or bring it back. The same act both ways. */
    onHideShelf?: (id: string) => void;
    /** Drives the screen's collapsing header. */
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    paddingBottom?: number;
}) {
    const manual = shelves.filter((shelf) => shelf.kind === "manual");
    const allAuto = shelves.filter((shelf) => shelf.kind === "auto");
    const auto = allAuto.filter((shelf) => !hidden.includes(shelf.id));
    // Only the ones the app could draw. A shelf hidden while it had members and
    // now empty is not offered back, because bringing it back would show the
    // user nothing: the footer counts what is actually being withheld.
    const putAway = allAuto.filter((shelf) => hidden.includes(shelf.id));

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
                    <Rows shelves={manual} marks={marks} variant={variant}
                          onOpen={onOpen} onActions={onShelfActions}/>
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
            {(auto.length > 0 || putAway.length > 0) && (
                <YStack gap="$2">
                    <Heading label="AUTO SHELVES"/>
                    {auto.length > 0 && (
                        <Rows shelves={auto} marks={marks} variant={variant}
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
