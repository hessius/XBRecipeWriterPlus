import React, {useState} from "react";
import {FlatList, ScrollView, View} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import Recipe from "@/library/Recipe";
import {
    SLOT_NAMES, snapshotRecipe, snapshotStatus,
    type SlotIndex, type SlotRecord, type SlotSnapshot
} from "@/library/slots/slotModel";
import {SLOT_INTEGRATION_BLOCK} from "@/library/slots/slotWriter";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";

export type EasyModeSlotsProps = {
    record: SlotRecord;
    recipes: readonly Recipe[];
    incoming?: Recipe;
    header?: React.ReactNode;
    deviceId: string;
    connected: boolean;
    available: boolean;
    running: boolean;
    error: string | null;
    onAssign: (index: SlotIndex, recipe: Recipe) => boolean | void;
    onWrite: () => void;
    onRecover: () => void;
};

function snapshotFigures(snapshot: SlotSnapshot): string {
    const recipe = new Recipe(undefined, snapshot.recipeJSON);
    return `${recipe.dosage} g · 1:${recipe.ratio} · ${
        recipe.grinder ? `Grind ${recipe.grindSize}` : "Grinder off"
    }`;
}

function RecipeChoice({recipe, onPick}: {recipe: Recipe; onPick: () => void}) {
    let problem: string | null = null;
    try {
        snapshotRecipe(recipe);
    } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
    }
    return (
        <YStack gap="$2" paddingVertical="$2">
            <Button accessibilityLabel={`Choose ${recipe.displayName()}`}
                    disabled={problem !== null} onPress={onPick}
                    backgroundColor={palette.raised} color={palette.text}>
                {recipe.displayName()}
            </Button>
            {problem !== null && <Text color={palette.warn} fontSize={13}>{problem}</Text>}
        </YStack>
    );
}

export default function EasyModeSlots({
    record, recipes, incoming, header, deviceId, connected, available, running, error,
    onAssign, onWrite, onRecover
}: EasyModeSlotsProps) {
    const [picker, setPicker] = useState<SlotIndex | null>(null);
    const [incomingUsed, setIncomingUsed] = useState(false);
    const insets = useSafeAreaInsets();
    const journal = record.journal;
    const locked = journal !== null || running || deviceId === "";
    const completeDraft = record.drafts.every((slot) => slot !== null);
    const recoveryKnown = journal !== null && journal.inFlight === null
        && journal.acknowledged < 3;

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <View style={{flex: 1}} accessibilityElementsHidden={picker !== null}
                  importantForAccessibility={picker !== null ? "no-hide-descendants" : "auto"}>
                {header}
                <ScrollView contentContainerStyle={{padding: 16, gap: 16}}>
                    <Text color={palette.dim} fontSize={14}>
                        {record.written === null
                            ? "The machine cannot tell us what is already in its slots."
                            : `Last written by XBRW++ ${new Date(record.written.at).toLocaleString()}. Not read back from the machine.`}
                    </Text>
                    {deviceId === "" && <Text color={palette.warn}>
                        Choose a machine in Settings before assigning slots.
                    </Text>}
                    {incoming !== undefined && !incomingUsed && (
                        <YStack gap="$2" padding="$3" backgroundColor={palette.raised} borderRadius="$4">
                            <Text color={palette.text}>Choose a slot for {incoming.displayName()}.</Text>
                            <XStack gap="$2" flexWrap="wrap">
                                {SLOT_NAMES.map((name, index) => (
                                    <Button key={name} disabled={locked}
                                            accessibilityLabel={`Put ${incoming.displayName()} in slot ${name}`}
                                            onPress={() => {
                                                if (onAssign(index as SlotIndex, incoming) !== false) {
                                                    setIncomingUsed(true);
                                                }
                                            }}>
                                        {name}
                                    </Button>
                                ))}
                            </XStack>
                        </YStack>
                    )}
                    {journal !== null && (
                        <YStack gap="$2" borderWidth={1} borderColor={palette.warn}
                                padding="$3" borderRadius="$4">
                            <Text color={palette.warn} fontWeight="700">
                                {running ? "Writing all three slots" : "Write incomplete"}
                            </Text>
                            <Text color={palette.text}>
                                The machine may be waiting for this set. Do not start another write or brew.
                            </Text>
                            {SLOT_NAMES.map((name, index) => (
                                <Text key={name} color={palette.dim}>
                                    {`${name}: ${index < journal.acknowledged ? "acknowledged"
                                        : journal.inFlight === index
                                            ? running ? "awaiting receipt" : "receipt unknown"
                                            : "not sent"}`}
                                </Text>
                            ))}
                            {journal.acknowledged === 3 && <Text color={palette.warn}>
                                All three receipts arrived. Storage completion is unconfirmed.
                            </Text>}
                            {journal.inFlight !== null && <Text color={palette.warn}>
                                Sending a frame does not prove receipt. Verified recovery evidence is required.
                            </Text>}
                            {journal.error !== null && <Text selectable color={palette.warn}>
                                {journal.error}
                            </Text>}
                        </YStack>
                    )}
                    {SLOT_NAMES.map((name, index) => {
                        const slotIndex = index as SlotIndex;
                        const snapshot = journal?.slots[index] ?? record.drafts[index];
                        const current = recipes.find((recipe) => recipe.uuid === snapshot?.sourceUuid);
                        const status = snapshot === null ? null : snapshotStatus(snapshot, current);
                        const written = record.written?.slots[index];
                        return (
                            <YStack key={name} gap="$2" backgroundColor={palette.raised}
                                    padding="$4" borderRadius="$4">
                                <XStack gap="$3" alignItems="center">
                                    <Text color={palette.text} fontSize={28} fontWeight="700">{name}</Text>
                                    <YStack flex={1} gap="$1">
                                        <Text color={palette.text} fontSize={18} fontWeight="600">
                                            {snapshot?.name ?? "Choose a recipe"}
                                        </Text>
                                        <Text color={palette.dim} fontSize={13}>
                                            {snapshot === null ? "Existing machine contents unknown"
                                                : snapshotFigures(snapshot)}
                                        </Text>
                                    </YStack>
                                </XStack>
                                {status === "edited" && <Text color={palette.warn}>Edited since assignment</Text>}
                                {status === "removed" && <Text color={palette.warn}>
                                    Recipe removed from library. Snapshot kept.
                                </Text>}
                                {written !== undefined && <Text color={palette.dim} fontSize={13}>
                                    Last written: {written.name}. {snapshotFigures(written)}
                                </Text>}
                                {!locked && (
                                    <YStack gap="$2">
                                        {status === "edited" && current !== undefined && (
                                            <Button accessibilityLabel={`Update slot ${name} from library`}
                                                    onPress={() => onAssign(slotIndex, current)}>
                                                USE LIBRARY VERSION
                                            </Button>
                                        )}
                                        <Button accessibilityLabel={`Change slot ${name} recipe`}
                                                onPress={() => setPicker(slotIndex)}>
                                            {snapshot === null ? "CHOOSE RECIPE" : "CHANGE RECIPE"}
                                        </Button>
                                    </YStack>
                                )}
                            </YStack>
                        );
                    })}
                    <Text color={palette.warn} fontSize={14}>
                        Writing replaces A, B and C and leaves your machine in EASY. Changes made outside XBRW++ cannot be detected.
                    </Text>
                    {!available && <Text selectable color={palette.warn}>{SLOT_INTEGRATION_BLOCK}</Text>}
                    {!connected && deviceId !== "" && <Text color={palette.dim}>
                        Connect to this machine before writing or recovering.
                    </Text>}
                    {error !== null && <Text selectable accessibilityRole="alert"
                                                color={palette.danger}>{error}</Text>}
                </ScrollView>
                <YStack padding="$4" paddingBottom={Math.max(insets.bottom, 16)}
                        backgroundColor={palette.surface}>
                    {journal === null ? (
                        <Button accessibilityLabel="Write all three slots"
                                disabled={!completeDraft || locked || !connected || !available}
                                onPress={onWrite}>
                            {running ? "WRITING" : "WRITE ALL THREE"}
                        </Button>
                    ) : (
                        <Button accessibilityLabel="Recover incomplete write"
                                disabled={!recoveryKnown || running || !connected || !available}
                                onPress={onRecover}>
                            COMPLETE THIS SET
                        </Button>
                    )}
                </YStack>
            </View>
            <XbrwSheet open={picker !== null} onOpenChange={(open) => {
                if (!open) setPicker(null);
            }} title={`SLOT ${picker === null ? "" : SLOT_NAMES[picker]}`} heightPercent={80}>
                <FlatList data={recipes} keyExtractor={(recipe) => recipe.uuid}
                          ListEmptyComponent={<Text color={palette.dim}>No recipes in your library.</Text>}
                          renderItem={({item}) => (
                              <RecipeChoice recipe={item} onPick={() => {
                                  if (picker === null) return;
                                  if (onAssign(picker, item) !== false) setPicker(null);
                              }}/>
                          )}/>
            </XbrwSheet>
        </YStack>
    );
}
