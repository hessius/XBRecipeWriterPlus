import React from "react";
import {ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

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
function Section({title, shelves, onOpen}: {
    title: string;
    shelves: readonly Shelf[];
    onOpen: (id: string) => void;
}) {
    const rows: Shelf[][] = [];
    for (let i = 0; i < shelves.length; i += COLUMNS) {
        rows.push(shelves.slice(i, i + COLUMNS));
    }

    return (
        <YStack gap="$2">
            <Heading label={title}/>
            {rows.map((row) => (
                <XStack key={row[0].id} gap="$3">
                    {row.map((shelf) => (
                        <ShelfTile key={shelf.id} shelf={shelf}
                                   onPress={() => onOpen(shelf.id)}/>
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
 * Tapping a tile applies that shelf and leaves for the list. The grid holds no
 * selected state of its own for that reason -- there is nothing to select here,
 * only somewhere to go.
 */
export default function ShelfGrid({shelves, onOpen, paddingBottom = 0}: {
    shelves: readonly Shelf[];
    onOpen: (id: string) => void;
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
                    A shelf is a saved way of looking at your library. Tag a few
                    recipes and they will gather here.
                </Text>
            </YStack>
        );
    }

    return (
        <ScrollView testID="shelf-grid"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 12, paddingTop: 12, paddingBottom, gap: 24
                    }}>
            {manual.length > 0 && (
                <Section title="YOUR SHELVES" shelves={manual} onOpen={onOpen}/>
            )}
            {auto.length > 0 && (
                <Section title="AUTO SHELVES" shelves={auto} onOpen={onOpen}/>
            )}
        </ScrollView>
    );
}
