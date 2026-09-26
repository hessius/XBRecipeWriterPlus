import React from "react";
import {Text, XStack, YStack} from "tamagui";

import {BeanProfileRow} from "@/components/BeanProfileRow";
import DeckSection from "@/components/DeckSection";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    PROFILE_CAP,
    PROFILE_FIELD_LABEL,
    rankProfileRows,
    type BeanProfile,
    type BeanProfileRow as ProfileRow
} from "@/library/beanProfile";

export const BEAN_PROFILE_TITLE = "BREWED WITH";
export const BEAN_PROFILE_EMPTY =
    "No brews tagged yet. Tag a brew to see what this recipe does best.";
export const NOT_TAGGED_LABEL = "NOT TAGGED";

type Props = {
    profile: BeanProfile;
    onShowAll: () => void;
    accent?: string;
};

export function beanProfileSubtitle(profile: BeanProfile): string {
    return `${profile.counted - profile.untagged.brews} OF ${profile.counted} BREWS TAGGED`;
}

export function BeanProfileDeck({profile, onShowAll, accent = palette.info}: Props) {
    if (profile.counted === 0) return null;

    const rows = rankProfileRows(profile.rows).slice(0, PROFILE_CAP);
    const showAll = profile.rows.length > PROFILE_CAP;
    const hasUntagged = profile.untagged.brews > 0;

    return (
        <DeckSection title={BEAN_PROFILE_TITLE} testID="bean-profile-deck">
            <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                               color={palette.dim}>
                    {beanProfileSubtitle(profile)}
                </DotMatrixText>

                {rows.length === 0 && hasUntagged && (
                    <Text fontSize={13} lineHeight={19} color={palette.dim}>
                        {BEAN_PROFILE_EMPTY}
                    </Text>
                )}

                <YStack gap="$1">
                    {rows.map((profileRow) => (
                        <LedgerRow key={rowKey(profileRow)} row={profileRow} accent={accent}/>
                    ))}
                </YStack>

                {showAll && (
                    <XStack
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel="Show all brewed with rows"
                        onPress={onShowAll}
                        minHeight={32}
                        alignItems="center"
                        pressStyle={{opacity: 0.7}}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                       color={palette.dim}>
                            {`SHOW ALL ${profile.rows.length} ›`}
                        </DotMatrixText>
                    </XStack>
                )}

                {hasUntagged && (
                    <YStack gap="$1.5">
                        <XStack height={1} backgroundColor={palette.line}/>
                        <BeanProfileRow
                            field={NOT_TAGGED_LABEL}
                            value={brewCount(profile.untagged.brews)}
                            brews={null}
                            rating={profile.untagged.avgRating}
                            rated={profile.untagged.rated}
                            accent={accent}
                            accessibilityLabel="Not tagged"
                        />
                    </YStack>
                )}
            </YStack>
        </DeckSection>
    );
}

function LedgerRow({row, accent}: {row: ProfileRow; accent: string}) {
    return (
        <BeanProfileRow
            field={PROFILE_FIELD_LABEL[row.field]}
            value={row.value}
            brews={row.brews}
            rating={row.avgRating}
            rated={row.rated}
            accent={accent}
        />
    );
}

function brewCount(count: number): string {
    return count === 1 ? "1 brew" : `${count} brews`;
}

function rowKey(row: ProfileRow): string {
    return `${row.field}:${row.value}`;
}
