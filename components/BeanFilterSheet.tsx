import React from "react";
import {ScrollView, Switch, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import {beanFilterId, parseBeanFilterId} from "@/library/beanFilters";
import {BEAN_FIELDS} from "@/library/brew/beanTags";
import {PROFILE_FIELD_LABEL, type ProfileField} from "@/library/beanProfile";
import type {BeanVocabularyEntry} from "@/library/BrewDatabase";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vocabulary: BeanVocabularyEntry[];
    selected: readonly string[];
    ratedOnly: boolean;
    onRatedOnlyChange: (value: boolean) => void;
    onChange: (ids: string[]) => void;
};

const FIELD_ORDER: readonly ProfileField[] = [...BEAN_FIELDS, "custom"];

function sameValue(id: string, entry: BeanVocabularyEntry): boolean {
    const parsed = parseBeanFilterId(id);
    return parsed !== null && parsed.field === entry.field && parsed.value === entry.value;
}

function countLabel(count: number): string {
    return count === 1 ? "1 recipe" : `${count} recipes`;
}

function withRated(ids: readonly string[], rated: boolean): string[] {
    return ids.map((current) => {
        const parsed = parseBeanFilterId(current);
        return parsed === null ? current : beanFilterId({...parsed, rated});
    });
}

function groupedVocabulary(vocabulary: readonly BeanVocabularyEntry[]) {
    return FIELD_ORDER.map((field) => ({
        field,
        entries: vocabulary.filter((entry) => entry.field === field)
    })).filter((group) => group.entries.length > 0);
}

function BeanFilterRow({
    entry,
    selected,
    ratedOnly,
    onChange
}: {
    entry: BeanVocabularyEntry;
    selected: readonly string[];
    ratedOnly: boolean;
    onChange: (ids: string[]) => void;
}) {
    const active = selected.some((id) => sameValue(id, entry));
    const recipes = countLabel(entry.recipes);
    const label = `${entry.value}, ${recipes}`;

    function press() {
        if (active) {
            onChange(selected.filter((id) => !sameValue(id, entry)));
            return;
        }
        onChange([
            ...selected,
            beanFilterId({field: entry.field, value: entry.value, rated: ratedOnly})
        ]);
    }

    return (
        <XStack testID="bean-filter-row"
                accessible
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{selected: active}}
                onPress={press}
                minHeight={48}
                alignItems="center"
                justifyContent="space-between"
                gap="$3"
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$4"
                borderWidth={1}
                borderColor={active ? palette.text : palette.line}
                backgroundColor={active ? palette.text : palette.raised}
                pressStyle={{opacity: 0.75}}>
            <Text flex={1} fontSize={15} color={active ? onAccent.text : palette.text}>
                {entry.value}
            </Text>
            <Text fontSize={13} color={active ? onAccent.label : palette.dim}>
                {recipes}
            </Text>
        </XStack>
    );
}

export default function BeanFilterSheet({
    open,
    onOpenChange,
    vocabulary,
    selected,
    ratedOnly,
    onRatedOnlyChange,
    onChange
}: Props) {
    const groups = groupedVocabulary(vocabulary);

    function setRatedOnly(next: boolean) {
        onRatedOnlyChange(next);
        onChange(withRated(selected, next));
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="BEANS"
                   heightPercent={72}>
            <YStack gap="$4" paddingHorizontal="$2" paddingBottom="$4">
                <XStack alignItems="center" justifyContent="space-between" gap="$4"
                        minHeight={44} paddingHorizontal="$2">
                    <YStack flex={1} gap="$1">
                        <Text fontSize={16} color={palette.text}>Highly rated only</Text>
                        <Text fontSize={13} color={palette.dim}>
                            Average 4★ or better.
                        </Text>
                    </YStack>
                    <Switch accessibilityLabel="Highly rated only"
                            accessibilityRole="switch"
                            accessibilityState={{checked: ratedOnly}}
                            checked={ratedOnly}
                            onCheckedChange={setRatedOnly}
                            size="$3"
                            backgroundColor={ratedOnly ? palette.success : palette.control}>
                        <Switch.Thumb backgroundColor={palette.text}/>
                    </Switch>
                </XStack>

                {groups.length === 0 ? (
                    <Text fontSize={14} color={palette.dim}
                          paddingHorizontal="$2" paddingVertical="$3">
                        No tagged brew history yet. Tag a brew to filter by beans.
                    </Text>
                ) : (
                    <ScrollView>
                        <YStack gap="$4" paddingBottom="$2">
                            {groups.map((group) => (
                                <YStack key={group.field} gap="$2">
                                    <DotMatrixText testID="bean-filter-heading"
                                                   fontSize={11}
                                                   weight="bold"
                                                   letterSpacing={1.5}
                                                   color={palette.dim}>
                                        {PROFILE_FIELD_LABEL[group.field]}
                                    </DotMatrixText>
                                    <YStack gap="$2">
                                        {group.entries.map((entry) => (
                                            <BeanFilterRow
                                                key={`${entry.field}:${entry.value}`}
                                                entry={entry}
                                                selected={selected}
                                                ratedOnly={ratedOnly}
                                                onChange={onChange}
                                            />
                                        ))}
                                    </YStack>
                                </YStack>
                            ))}
                        </YStack>
                    </ScrollView>
                )}
            </YStack>
        </XbrwSheet>
    );
}
