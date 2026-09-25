import React, {useState} from "react";
import {Pressable, TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import {MAX_TAG_LENGTH, MAX_TAGS_PER_RECIPE} from "@/library/Recipe";
import {FERMENTATIONS, PROCESSES, ROASTS} from "@/library/brew/beanTags";
import {tagKey} from "@/library/tagKey";

/**
 * Where a recipe's tags are made.
 *
 * One face for every tag. A tag that is also a coffee word is read as intent
 * by `intentTags`, but it is not drawn differently: until #104 puts a
 * comparison on screen a second typeface is a difference the user has to guess.
 *
 * Inter rather than Doto, and the user's own casing kept, for the reason
 * `ShelfRoom` draws a manual shelf plain: the matrix face is the app printing
 * a label, and these are a person's own words.
 *
 * No validation here. `setTags` folds case, trims, drops blanks and holds the
 * ceilings, and a second opinion in this component would answer differently
 * depending on whether a tag arrived by typing or from the library.
 */
export default function TagSection({tags, known, onChange}: {
    tags: string[];
    /** Every tag used elsewhere in the library, for suggestions. */
    known: string[];
    /** The whole new set, for `setTags`. */
    onChange: (tags: string[]) => void;
}) {
    const [adding, setAdding] = useState(false);
    const [typed, setTyped] = useState("");

    const full = tags.length >= MAX_TAGS_PER_RECIPE;
    const suggestions = suggestionsFor(typed, tags, known);

    function commit(value: string) {
        const tag = value.trim();
        setTyped("");
        setAdding(false);
        if (tag.length === 0) return;
        onChange([...tags, tag]);
    }

    return (
        <DeckSection title="TAGS" testID="about-tags">
            <YStack gap="$2">
                <XStack flexWrap="wrap" gap="$2" alignItems="center">
                    {tags.map((tag) => (
                        <TagChip key={tag} tag={tag}
                                 onRemove={() => onChange(tags.filter((value) => value !== tag))}/>
                    ))}

                    {adding ? (
                        <TextInput
                            accessibilityLabel="New tag"
                            autoFocus
                            maxLength={MAX_TAG_LENGTH}
                            placeholderTextColor={palette.muted}
                            returnKeyType="done"
                            value={typed}
                            onChangeText={setTyped}
                            onSubmitEditing={(event) => commit(event.nativeEvent.text)}
                            style={{
                                minWidth:          118,
                                fontSize:          14,
                                color:             palette.text,
                                backgroundColor:   palette.raised,
                                borderColor:       palette.info,
                                borderWidth:       1,
                                borderRadius:      9,
                                paddingHorizontal: 11,
                                paddingVertical:   7
                            }}/>
                    ) : !full && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel="Add a tag"
                                   onPress={() => setAdding(true)}
                                   style={{
                                       borderColor:       palette.line,
                                       borderWidth:       1,
                                       borderStyle:       "dashed",
                                       borderRadius:      9,
                                       paddingHorizontal: 11,
                                       paddingVertical:   7
                                   }}>
                            <Text fontSize={14} lineHeight={16} color={palette.dim}>+ Add</Text>
                        </Pressable>
                    )}
                </XStack>

                {suggestions.length > 0 && (
                    <XStack flexWrap="wrap" gap="$2" alignItems="center">
                        {suggestions.map((suggestion) => (
                            <Pressable key={tagKey(suggestion)}
                                       accessibilityRole="button"
                                       accessibilityLabel={`Use tag ${suggestion}`}
                                       onPress={() => commit(suggestion)}
                                       style={{
                                           borderColor:       palette.line,
                                           borderWidth:       1,
                                           borderRadius:      9,
                                           paddingHorizontal: 11,
                                           paddingVertical:   7
                                       }}>
                                <Text fontSize={14} lineHeight={16} color={palette.dim}>
                                    {suggestion}
                                </Text>
                            </Pressable>
                        ))}
                    </XStack>
                )}
            </YStack>
        </DeckSection>
    );
}

function TagChip({tag, onRemove}: {
    tag: string;
    onRemove: () => void;
}) {
    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`Remove tag ${tag}`}
                   onPress={onRemove}
                   style={{
                       backgroundColor:   palette.raised,
                       borderColor:       palette.line,
                       borderWidth:       1,
                       borderRadius:      9,
                       paddingHorizontal: 11,
                       paddingVertical:   7
                   }}>
            <XStack gap="$1.5" alignItems="center">
                <Text fontSize={14} lineHeight={16} color={palette.text}>{tag}</Text>
                <Text fontSize={13} lineHeight={16} color={palette.muted}>×</Text>
            </XStack>
        </Pressable>
    );
}

/**
 * What to offer for what has been typed so far.
 *
 * Two sources in one undifferentiated list: tags already used somewhere in the
 * library, and the coffee vocabulary. They are not labelled or separated,
 * because under the one-face decision there is nothing to tell the user.
 *
 * Matched on `tagKey`. SQLite's NOCASE is ASCII-only and would call "CAFÉ" and
 * "café" two tags while the model calls them one, so the folding has to be
 * JavaScript's here as it is everywhere else that compares a tag.
 */
function suggestionsFor(typed: string, tags: string[], known: string[]): string[] {
    const query = tagKey(typed.trim());
    if (query.length === 0) return [];
    const already = new Set(tags.map(tagKey));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of [...known, ...ROASTS, ...PROCESSES, ...FERMENTATIONS]) {
        const key = tagKey(candidate);
        if (already.has(key) || seen.has(key)) continue;
        if (!key.startsWith(query)) continue;
        seen.add(key);
        out.push(candidate);
        if (out.length === MAX_SUGGESTIONS) break;
    }
    return out;
}

/**
 * Enough to be useful, few enough not to push the rest of the deck off screen
 * while somebody is typing.
 */
const MAX_SUGGESTIONS = 6;
