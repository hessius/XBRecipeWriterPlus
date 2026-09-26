import React from "react";
import {ScrollView, YStack} from "tamagui";

import {BeanProfileRow} from "@/components/BeanProfileRow";
import {
    BEAN_PROFILE_TITLE,
    NOT_TAGGED_LABEL,
    beanProfileSubtitle
} from "@/components/BeanProfileDeck";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {
    PROFILE_FIELD_LABEL,
    rankProfileRows,
    type BeanProfile,
    type BeanProfileRow as ProfileRow
} from "@/library/beanProfile";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    profile: BeanProfile;
    accent?: string;
};

export function BeanProfileSheet({
    open, onOpenChange, profile, accent = palette.info
}: Props) {
    const rows = rankProfileRows(profile.rows);
    const hasUntagged = profile.untagged.brews > 0;

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={BEAN_PROFILE_TITLE} heightPercent={72}>
            <YStack gap="$3" paddingHorizontal="$2" paddingBottom="$4">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                               color={palette.dim}>
                    {beanProfileSubtitle(profile)}
                </DotMatrixText>

                <ScrollView>
                    <YStack gap="$1" paddingBottom="$2">
                        {rows.map((profileRow) => (
                            <LedgerRow key={rowKey(profileRow)}
                                       row={profileRow}
                                       accent={accent}/>
                        ))}

                        {hasUntagged && (
                            <YStack gap="$1.5">
                                <YStack height={1} backgroundColor={palette.line}/>
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
                </ScrollView>
            </YStack>
        </XbrwSheet>
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
