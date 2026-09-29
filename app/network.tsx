import router from "@/hooks/steadyRouter";
import React from "react";
import {ScrollView, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import LinkText from "@/components/LinkText";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {
    OUTBOUND_CALLS,
    REPO_URL,
    SILENT_CAPABILITIES,
    sourceUrl,
    type OutboundCall
} from "@/constants/network";
import {useLiveBrew} from "@/hooks/useLiveBrew";

const PRIVACY_URL = `${REPO_URL}/blob/main/PRIVACY.md`;

/**
 * What leaves this device.
 *
 * Every outbound request the app can make, what triggers it, where it goes and
 * what it carries. The app is open source, so a developer could already work
 * this out; the point of the screen is that nobody should have to be one.
 *
 * The list is not written here. It is `constants/network.ts`, which a test
 * checks against the source for `fetch(` call sites, so a request that is not
 * on this screen fails the build rather than quietly shipping. That is the
 * whole idea: a privacy claim in prose is a claim, and a privacy claim a test
 * enforces is a fact.
 *
 * Silent capabilities come first. A bare list of requests reads as a list of
 * things to worry about, and the true headline is that most of the app sends
 * nothing at all.
 *
 * The header says Network rather than the screen's own name because the title
 * is one line at 28pt and the name does not fit in it. The lead paragraph
 * carries the name instead, where it has room.
 */
export default function NetworkScreen() {
    const {ratingNoteOpen} = useLiveBrew();

    return (
        <YStack testID="network-screen" flex={1} backgroundColor={palette.base}
                accessibilityElementsHidden={ratingNoteOpen}
                importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <ScreenHeader title="Network" onBack={() => router.back()}/>
            <ScrollView testID="network-scroll"
                        contentContainerStyle={{padding: 16, paddingBottom: 48}}>
                <YStack backgroundColor={palette.surface} borderRadius="$5"
                        paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2">
                    <Paragraph>
                        What leaves this device, in full. Every request XBRW++ can
                        make is below, with what sets it off, where it goes and
                        what it carries.
                    </Paragraph>
                    <Paragraph>
                        None of them happen in the background. There is no XBRW++
                        account to sign in to, no analytics and no crash
                        reporting, and the app speaks to a server only when
                        something you did asks it to.
                    </Paragraph>
                </YStack>

                <Section title="Sends nothing">
                    <YStack backgroundColor={palette.surface} borderRadius="$5"
                            paddingHorizontal="$4" paddingTop="$3" paddingBottom="$3"
                            gap="$3">
                        {SILENT_CAPABILITIES.map((item) => (
                            <YStack key={item.id} testID={`network-silent-${item.id}`} gap="$1">
                                <Text fontSize={14} fontWeight="600" color={palette.text}>
                                    {item.title}
                                </Text>
                                <Text fontSize={13} lineHeight={19} color={palette.dim}>
                                    {item.detail}
                                </Text>
                            </YStack>
                        ))}
                    </YStack>
                </Section>

                <Section title={`${OUTBOUND_CALLS.length} requests`}>
                    <YStack gap="$3">
                        {OUTBOUND_CALLS.map((call) => <CallCard key={call.id} call={call}/>)}
                    </YStack>
                </Section>

                <Section title="Checking this yourself">
                    <YStack backgroundColor={palette.surface} borderRadius="$5"
                            paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2">
                        <Paragraph>
                            Every line above is drawn from a list in the source, and
                            a test walks the code for the calls that send a request
                            and fails if one of them is missing from that list. A
                            request cannot be added to this app without appearing on
                            this screen.
                        </Paragraph>
                        <Paragraph>
                            What a test cannot promise is the server on the other
                            end. Where an entry says so, read the source it links to
                            and judge it for yourself.
                        </Paragraph>
                        <LinkText label="The full privacy policy" url={PRIVACY_URL}/>
                        <LinkText label="All of the source" url={REPO_URL}/>
                    </YStack>
                </Section>
            </ScrollView>
        </YStack>
    );
}

/** One request, on a card of its own. */
function CallCard({call}: {call: OutboundCall}) {
    return (
        <YStack testID={`network-call-${call.id}`}
                backgroundColor={palette.surface} borderRadius="$5"
                paddingHorizontal="$4" paddingVertical="$3" gap="$3">
            <YStack gap="$1">
                <Text fontSize={15} fontWeight="700" color={palette.text}>
                    {call.title}
                </Text>
                <Text fontSize={13} lineHeight={19} color={palette.dim}>
                    {call.trigger}
                </Text>
            </YStack>

            <Field label="Goes to">
                {/* Doto only when the host is a literal in the source, because
                    Doto is for a machine's facts: a pinned hostname is a string
                    somebody can compare against a router log character by
                    character, and "whichever host xBloom named" is a sentence. */}
                {call.hostPinned ? (
                    <DotMatrixText fontSize={12} color={palette.text} letterSpacing={0.6}>
                        {call.host}
                    </DotMatrixText>
                ) : (
                    <Text fontSize={13} lineHeight={19} color={palette.text}>
                        {call.host}
                    </Text>
                )}
                <Text fontSize={12} color={palette.muted}>{`Run by ${call.owner}`}</Text>
            </Field>

            <Field label="Carries">
                <YStack gap="$1.5">
                    {call.carries.map((line) => (
                        <XStack key={line} gap="$2" alignItems="flex-start">
                            <Text fontSize={13} lineHeight={19} color={palette.brand}>
                                {"\u00B7"}
                            </Text>
                            <Text flex={1} fontSize={13} lineHeight={19} color={palette.dim}>
                                {line}
                            </Text>
                        </XStack>
                    ))}
                </YStack>
            </Field>

            {call.unverifiable !== undefined && (
                <YStack testID={`network-unverifiable-${call.id}`}
                        backgroundColor={palette.raised} borderRadius="$4"
                        borderWidth={1} borderColor={palette.line}
                        paddingHorizontal="$3" paddingVertical="$3" gap="$1">
                    <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                   color={palette.warn}>
                        YOU CANNOT SEE THIS PART
                    </DotMatrixText>
                    <Text fontSize={13} lineHeight={19} color={palette.dim}>
                        {call.unverifiable}
                    </Text>
                </YStack>
            )}

            <Field label="Read the code">
                <YStack>
                    {call.source.map((file) => (
                        <LinkText key={file} label={file} url={sourceUrl(file)} fontSize={13}/>
                    ))}
                </YStack>
            </Field>
        </YStack>
    );
}

/** A labelled part of a card. */
function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <YStack gap="$1.5">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.muted}>
                {label.toUpperCase()}
            </DotMatrixText>
            {children}
        </YStack>
    );
}

/**
 * A heading above a group.
 *
 * The same shape `SettingsSection` draws, without its card and hairlines: the
 * children here are cards of prose rather than rows of controls.
 */
function Section({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <YStack gap="$2" paddingTop="$4">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {title.toUpperCase()}
            </DotMatrixText>
            {children}
        </YStack>
    );
}

/** Body copy. At module scope; see the note in every other component here. */
function Paragraph({children}: {children: React.ReactNode}) {
    return (
        <Text fontSize={14} lineHeight={21} color={palette.dim} paddingBottom="$2">
            {children}
        </Text>
    );
}
