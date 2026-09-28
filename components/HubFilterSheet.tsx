import React, {useState} from "react";
import {Input, ScrollView, Text, XStack, YStack} from "tamagui";
import type {ColorTokens} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

type HubFilterOption = {
    value: string;
    count: number;
};

type Props = {
    open: boolean;
    onOpenChange(open: boolean): void;
    title: string;
    options: readonly HubFilterOption[];
    selected: readonly string[];
    onChange(values: string[]): void;
};

/**
 * How many rows the sheet will draw at once.
 *
 * The catalogue is free text, so a partition carries 933 to 1,058 distinct
 * flavours and more than half of them appear on exactly one recipe. Drawing a
 * thousand rows would be slow and reading them would be worse, so the sheet
 * draws the commonest handful and the field reaches the rest. Nothing is
 * hidden: every value is one search away, and the line under the list says how
 * many are waiting there.
 */
const SHOWN = 60;

function key(value: string): string {
    return value.trim().toLowerCase();
}

function countLabel(count: number): string {
    return count === 1 ? "1 recipe" : `${count} recipes`;
}

function matching(options: readonly HubFilterOption[], term: string): readonly HubFilterOption[] {
    const wanted = key(term);
    // A shortcut, not a guard: `includes("")` is true for everything, so the
    // filter below would answer the same. It is here so the common case does
    // not walk a thousand values to conclude it wanted all of them.
    if (wanted === "") return options;
    return options.filter((option) => key(option.value).includes(wanted));
}

function emptyLabel(title: string): string {
    const lower = title.toLowerCase();
    if (lower === "process") return "processes";
    return `${lower}s`;
}

function HubFilterRow({
    option,
    selected,
    onChange
}: {
    option: HubFilterOption;
    selected: readonly string[];
    onChange(values: string[]): void;
}) {
    const optionKey = key(option.value);
    const active = selected.some((value) => key(value) === optionKey);
    const recipes = countLabel(option.count);
    const label = `${option.value}, ${recipes}`;

    function press() {
        if (active) {
            onChange(selected.filter((value) => key(value) !== optionKey));
            return;
        }
        onChange([...selected, option.value]);
    }

    return (
        <XStack testID="hub-filter-row"
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
                {option.value}
            </Text>
            <Text fontSize={13} color={active ? onAccent.label : palette.dim}>
                {recipes}
            </Text>
        </XStack>
    );
}

export default function HubFilterSheet({
    open,
    onOpenChange,
    title,
    options,
    selected,
    onChange
}: Props) {
    const [term, setTerm] = useState("");
    const found = matching(options, term);
    const shown = found.slice(0, SHOWN);
    const rest = found.length - shown.length;

    // Reset in the handler rather than in an effect on `open`: the React
    // Compiler makes `set-state-in-effect` an error, and this is an event.
    function close(next: boolean) {
        if (!next) setTerm("");
        onOpenChange(next);
    }

    return (
        <XbrwSheet open={open} onOpenChange={close} title={title}
                   heightPercent={72}>
            <YStack gap="$4" paddingHorizontal="$2" paddingBottom="$4">
                <XStack alignItems="center" justifyContent="space-between" gap="$3"
                        minHeight={44} paddingHorizontal="$2">
                    <Text flex={1} fontSize={13} color={palette.dim}>
                        Options are counted from recipes already loaded.
                    </Text>
                    <XStack accessible
                            accessibilityRole="button"
                            accessibilityLabel={`Clear ${title} filters`}
                            onPress={() => onChange([])}
                            minHeight={44}
                            alignItems="center"
                            justifyContent="center"
                            paddingHorizontal="$2"
                            pressStyle={{opacity: 0.75}}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                       color={palette.dim}>
                            CLEAR
                        </DotMatrixText>
                    </XStack>
                </XStack>

                {options.length > SHOWN && (
                    <Input accessibilityLabel={`Search ${title.toLowerCase()}`}
                           placeholder={`Search ${options.length} ${emptyLabel(title)}`}
                           // The palette is a plain module of raw strings, not
                           // Tamagui tokens; the cast reconciles that with
                           // Tamagui typing this prop as `ColorTokens`.
                           placeholderTextColor={palette.placeholder as ColorTokens}
                           value={term}
                           onChangeText={setTerm}
                           autoCapitalize="none"
                           autoCorrect={false}
                           marginHorizontal="$2"/>
                )}

                {options.length === 0 ? (
                    <Text fontSize={14} color={palette.dim}
                          paddingHorizontal="$2" paddingVertical="$3">
                        {`No ${emptyLabel(title)} found yet. Keep loading the catalogue.`}
                    </Text>
                ) : (
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <YStack gap="$2" paddingBottom="$2">
                            {found.length === 0 && (
                                <Text fontSize={14} color={palette.dim}
                                      paddingHorizontal="$2" paddingVertical="$3">
                                    {`Nothing here matches that.`}
                                </Text>
                            )}
                            {shown.map((option) => (
                                <HubFilterRow
                                    key={option.value}
                                    option={option}
                                    selected={selected}
                                    onChange={onChange}
                                />
                            ))}
                            {rest > 0 && (
                                <Text fontSize={13} color={palette.dim}
                                      paddingHorizontal="$2" paddingVertical="$3">
                                    {`${rest} more. Search to reach them.`}
                                </Text>
                            )}
                        </YStack>
                    </ScrollView>
                )}
            </YStack>
        </XbrwSheet>
    );
}
