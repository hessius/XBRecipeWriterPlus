import {router} from "expo-router";
import React from "react";
import {FlatList, type ListRenderItemInfo} from "react-native";
import {Text, YStack} from "tamagui";

import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {LICENCES, type Licence} from "@/constants/licences";

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
 * `entries` is injected only so a test can hand it a short list — the real
 * list is virtualised, so an assertion about a particular package would
 * otherwise depend on where that package happened to fall in the window.
 */
export default function LicencesScreen({entries = LICENCES}: {entries?: readonly Licence[]}) {
    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Licences" onBack={() => router.back()}/>
            <FlatList data={entries}
                      keyExtractor={(entry) => entry.name}
                      renderItem={renderLicenceRow}
                      contentContainerStyle={{padding: 16, paddingBottom: 48}}/>
        </YStack>
    );
}

function renderLicenceRow({item}: ListRenderItemInfo<Licence>) {
    return <LicenceRow entry={item}/>;
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
 */
function LicenceRow({entry}: { entry: Licence }) {
    return (
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
}
