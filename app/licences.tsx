import {router} from "expo-router";
import React, {useState} from "react";
import {FlatList, Pressable, type ListRenderItemInfo} from "react-native";
import {ScrollView, Text, YStack} from "tamagui";

import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {LICENCES, LICENCE_TEXTS, type Licence} from "@/constants/licences";

/**
 * The full third-party licence list, on its own route.
 *
 * `LICENCES` runs to hundreds of entries, and About's `ScrollView` renders
 * every child it is given -- a plain `.map` there meant one tap built and
 * committed hundreds of Tamagui `Text` nodes in a single synchronous pass.
 * Nesting a `FlatList` inside that same `ScrollView` would only trade one
 * defect for the `VirtualizedList`-inside-`ScrollView` one, so the list gets
 * its own screen instead: a single virtualised list with nothing above it
 * competing for the scroll.
 *
 * A row with a licence body is tappable, and opens the body in the house sheet
 * rather than pushing another route: the sheet keeps the list underneath and its
 * scroll position, which is where a reader wants to return to after reading one
 * licence out of hundreds. The body is only reproduced for the one licence being
 * read, so the hundreds of others cost nothing until they are asked for.
 *
 * `entries` and `texts` are injected only so a test can hand them short data --
 * the real list is virtualised, so an assertion about a particular package would
 * otherwise depend on where that package happened to fall in the window.
 */
export default function LicencesScreen({
    entries = LICENCES,
    texts = LICENCE_TEXTS
}: {
    entries?: readonly Licence[];
    texts?: Readonly<Record<string, string>>;
}) {
    const [reading, setReading] = useState<Licence | null>(null);
    const body = reading?.text !== undefined ? texts[reading.text] : undefined;

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Licences" onBack={() => router.back()}/>
            <FlatList data={entries}
                      keyExtractor={(entry) => entry.name}
                      renderItem={({item}: ListRenderItemInfo<Licence>) => (
                          <LicenceRow entry={item}
                                      onPress={item.text !== undefined && texts[item.text] !== undefined
                                          ? () => setReading(item)
                                          : undefined}/>
                      )}
                      contentContainerStyle={{padding: 16, paddingBottom: 48}}/>
            <XbrwSheet open={reading !== null} onOpenChange={(open) => {if (!open) setReading(null);}}
                       title={reading?.name ?? ""} heightPercent={80}>
                <ScrollView>
                    <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                        {reading !== null && (
                            <Text fontSize={12} color={palette.muted}>
                                {reading.name} {reading.version} — {reading.licence}
                            </Text>
                        )}
                        {reading?.copyright !== undefined && (
                            <Text fontSize={12} color={palette.dim}>{reading.copyright}</Text>
                        )}
                        {body !== undefined && (
                            <Text fontSize={12} lineHeight={18} color={palette.dim}>
                                {body}
                            </Text>
                        )}
                    </YStack>
                </ScrollView>
            </XbrwSheet>
        </YStack>
    );
}

/**
 * One package.
 *
 * `copyright` is the notice MIT and BSD both require reproducing -- the name,
 * version and licence alone do not discharge that obligation, so it is rendered
 * here when the generator found one.
 *
 * `note` is present only where the generator inferred a licence the package did
 * not state, and it is shown for the same reason: a reader auditing this list
 * needs to be able to tell what was read off a package from what was reasoned
 * about it, and to re-check the reasoning.
 *
 * `onPress` is supplied only when a licence body was recorded to read, so a row
 * without one is inert rather than a button that opens an empty sheet.
 */
function LicenceRow({entry, onPress}: {entry: Licence; onPress?: () => void}) {
    const content = (
        <YStack paddingVertical="$1">
            <Text fontSize={11} color={palette.muted}>
                {entry.name} {entry.version} — {entry.licence}
            </Text>
            {entry.copyright !== undefined && (
                <Text fontSize={10} color={palette.dim}>{entry.copyright}</Text>
            )}
            {entry.note !== undefined && (
                // Shown rather than kept in the generator, because a licence
                // this app inferred rather than read is exactly the row a
                // reviewer would want to check for themselves.
                <Text fontSize={10} fontStyle="italic" color={palette.dim}>
                    {entry.note}
                </Text>
            )}
        </YStack>
    );

    if (onPress === undefined) {
        return content;
    }

    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`Read the ${entry.name} licence`}
                   onPress={onPress}>
            {content}
        </Pressable>
    );
}
