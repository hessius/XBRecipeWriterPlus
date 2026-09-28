import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {StoredBrew} from "@/library/BrewDatabase";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";

type Props = {
    open: boolean;
    candidates: StoredBrew[];
    onPick: (id: string) => void;
    onClose: () => void;
};

function CandidateRow({brew, onPick}: {brew: StoredBrew; onPick: (id: string) => void}) {
    const when = `${formatBrewDate(brew.startedAt)} · ${formatBrewTime(brew.startedAt)}`;
    const rating = brew.rating ?? 0;
    return (
        <Pressable
            testID={`compare-candidate-${brew.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${when}, ${Math.round(brew.cupTotal)} grams in the cup`}
            onPress={() => onPick(brew.id)}
            style={({pressed}) => ({
                opacity: pressed ? 0.7 : 1,
                transform: [{scale: pressed ? 0.98 : 1}]
            })}>
            <YStack gap="$2" paddingVertical="$3" borderBottomWidth={1}
                    borderColor={palette.line}>
                <XStack alignItems="center" justifyContent="space-between" gap="$3">
                    <YStack flex={1} gap="$1">
                        <Text color={palette.text} fontSize={14}>
                            {when}
                        </Text>
                        <Text color={palette.dim} fontSize={13}>
                            {Math.round(brew.waterTotal)} ml water · {Math.round(brew.cupTotal)} g cup
                        </Text>
                    </YStack>
                    {rating > 0 && (
                        <BrewStars rating={rating} testID={`compare-stars-${brew.id}`} />
                    )}
                </XStack>
                {!brew.hasStream && (
                    <Text color={palette.muted} fontSize={12}>
                        The trace for this brew has expired. Its figures are still here.
                    </Text>
                )}
            </YStack>
        </Pressable>
    );
}

/** Pick another brew of the same recipe to compare with this one. */
export default function CompareWithSheet({open, candidates, onPick, onClose}: Props) {
    const ordered = [...candidates].sort((one, two) => two.startedAt - one.startedAt);

    return (
        <XbrwSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}
                   title="Compare with">
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {ordered.length === 0 ? (
                    <Text testID="compare-no-candidates" color={palette.dim} fontSize={13}>
                        This is the only brew of this recipe so far.
                    </Text>
                ) : (
                    <>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                       color={palette.dim}>
                            CHOOSE A BREW
                        </DotMatrixText>
                        <YStack>
                            {ordered.map((brew) => (
                                <CandidateRow key={brew.id} brew={brew} onPick={onPick} />
                            ))}
                        </YStack>
                    </>
                )}
            </YStack>
        </XbrwSheet>
    );
}
