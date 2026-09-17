import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ShelfTile from "@/components/ShelfTile";
import {palette} from "@/constants/colors";
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

function Rows({shelves, onOpen, onEdit}: {
    shelves: readonly Shelf[];
    onOpen: (id: string) => void;
    onEdit?: (tag: string) => void;
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
                                   onPress={() => onOpen(shelf.id)}
                                   onEdit={onEdit && (() => onEdit(shelf.label))}/>
                    ))}
                    {row.length < COLUMNS && <YStack flex={1}/>}
                </XStack>
            ))}
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
    shelves, onOpen, onNewShelf, onEditShelf, paddingBottom = 0
}: {
    shelves: readonly Shelf[];
    onOpen: (id: string) => void;
    /** Start choosing members for a new shelf. */
    onNewShelf: () => void;
    /** Change who is on an existing manual shelf, by its tag. */
    onEditShelf: (tag: string) => void;
    paddingBottom?: number;
}) {
    const manual = shelves.filter((shelf) => shelf.kind === "manual");
    const auto = shelves.filter((shelf) => shelf.kind === "auto");

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
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 12, paddingTop: 12, paddingBottom, gap: 24
                    }}>
            <YStack gap="$2">
                <Heading label="YOUR SHELVES"/>
                {manual.length > 0 && (
                    <Rows shelves={manual} onOpen={onOpen} onEdit={onEditShelf}/>
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
            {auto.length > 0 && (
                <YStack gap="$2">
                    <Heading label="AUTO SHELVES"/>
                    <Rows shelves={auto} onOpen={onOpen}/>
                </YStack>
            )}
        </ScrollView>
    );
}
