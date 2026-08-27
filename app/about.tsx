import * as Application from "expo-application";
import {router} from "expo-router";
import React from "react";
import {Linking, Pressable} from "react-native";
import {ScrollView, Text, YStack} from "tamagui";

import AboutTicker from "@/components/AboutTicker";
import DotMatrixText from "@/components/DotMatrixText";
import LivingMark from "@/components/LivingMark";
import ScreenHeader from "@/components/ScreenHeader";
import Wordmark from "@/components/Wordmark";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {LICENCES} from "@/constants/licences";

const REPO_URL = "https://github.com/hessius/XBRecipeWriterPlus";
const ISSUES_URL = "https://github.com/hessius/XBRecipeWriterPlus/issues";
const ORIGINAL_URL = "https://github.com/terminaldisclaimer/XBRecipeWriter";
const FORK_URL = "https://github.com/CrazyCoder/XBRecipeWriterPlus";

/**
 * Lines for the idle ticker.
 *
 * Facts about the app rather than jokes about it: the register is a 90s crack
 * intro, and what those actually scrolled was information nobody had asked for.
 */
const TICKER_LINES = [
    "READS AND WRITES GENUINE XBLOOM CARDS",
    "EVERY RECIPE LIVES ON THIS PHONE",
    "THIRTY-TWO BYTES OF SIGNATURE PER CARD",
    "ONE BYTE OF WHOLE CELSIUS PER STAGE",
    "FORKED TWICE AND STILL COUNTING"
];

const VERSION = Application.nativeApplicationVersion ?? "unknown";
const BUILD = Application.nativeBuildVersion ?? "unknown";

/**
 * About.
 *
 * Reached from the identity row at the top of settings. Every block here is
 * something a user or a reviewer needed and could not find: which build they are
 * running, whose app this is and whose it is not, what leaves the phone, why a
 * blank card will not take a recipe, and where to report a fault.
 *
 * The disclaimer is not behind an interaction. This app uses xBloom's marks,
 * reads their cards and calls their undocumented API, and it has never said so
 * anywhere.
 */
export default function AboutScreen() {
    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="About" onBack={() => router.back()}/>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 48}}>
                {/* The mark, the wordmark and the ticker read as one object, so
                    they sit on a card of their own rather than floating on the
                    page above a stack of sections. */}
                <YStack alignItems="center" gap="$3"
                        backgroundColor={palette.raised} borderRadius="$6"
                        borderWidth={1} borderColor={palette.line}
                        paddingVertical="$6" paddingHorizontal="$4" marginBottom="$5">
                    <LivingMark size={168} decorative/>
                    <Wordmark fontSize={22} plusColor={palette.brand}/>
                    <DotMatrixText fontSize={11} letterSpacing={1.6} color={palette.dim}>
                        {`V${VERSION}  \u00B7  BUILD ${BUILD}`}
                    </DotMatrixText>
                    <AboutTicker lines={TICKER_LINES}/>
                </YStack>

                <AboutSection title="Independent">
                    <AboutParagraph>
                        XBRW++ is not affiliated with, endorsed by or supported by
                        xBloom. xBloom and its logos are the trademarks of their
                        owner, used here only to say which machine and which cards
                        this app works with.
                    </AboutParagraph>
                    <AboutParagraph>
                        It reads and writes recipe cards for that machine, and it can
                        import a recipe shared through the manufacturer&apos;s own
                        service. Neither capability is documented or guaranteed, and
                        either may stop working without notice.
                    </AboutParagraph>
                </AboutSection>

                <AboutSection title="What leaves your phone">
                    <AboutParagraph>
                        Your recipes stay on this phone. There is no account, no sync
                        and no analytics.
                    </AboutParagraph>
                    <AboutParagraph>
                        Importing a shared recipe sends that recipe&apos;s ID to the
                        manufacturer&apos;s service in order to fetch it. Nothing
                        else is sent anywhere. A backup goes only where you send it.
                    </AboutParagraph>
                </AboutSection>

                <AboutSection title="Why only genuine cards work">
                    <AboutParagraph>
                        The first 32 bytes of every recipe card are a signature
                        derived from that card&apos;s serial number. This app cannot
                        compute one, so it never writes those bytes at all: it reads
                        the signature to know the card, then starts writing the
                        recipe after it, leaving the signature exactly as the
                        manufacturer left it.
                    </AboutParagraph>
                    <AboutParagraph>
                        That is why a recipe can be written to a card that came with
                        coffee in it, and why a blank card will not take one.
                    </AboutParagraph>
                </AboutSection>

                <AboutSection title="Made by">
                    <AboutParagraph>
                        XBRW++ is built by Jesper Hessius. Free, open source, and not
                        for sale.
                    </AboutParagraph>
                    <AboutParagraph>
                        It stands on two people&apos;s work. terminaldisclaimer wrote
                        the original XBRecipeWriter and worked out the card format
                        this app still writes. Serge Baranov&apos;s XBRecipeWriterPlus
                        is the fork this one grew from.
                    </AboutParagraph>
                    <AboutLink label="XBRecipeWriter, by terminaldisclaimer" url={ORIGINAL_URL}/>
                    <AboutLink label="XBRecipeWriterPlus, by Serge Baranov" url={FORK_URL}/>
                    <AboutLink label="Source code" url={REPO_URL}/>
                    <AboutLink label="Report an issue" url={ISSUES_URL}/>
                </AboutSection>

                <AboutSection title="Third-party licences">
                    <AboutParagraph>
                        This app stands on {LICENCES.length} open-source packages.
                        Their licences, and the copyright notices those licences
                        require reproducing, are listed in full.
                    </AboutParagraph>
                    <AboutLink label="Read the licences" onPress={() => router.push("/licences")}/>
                </AboutSection>
            </ScrollView>
        </YStack>
    );
}

/**
 * A block of About's prose, on a card.
 *
 * Deliberately not `SettingsSection`. That one divides its children with
 * hairlines because its children are rows, each a separate control; these are
 * paragraphs of one argument, and ruling a line between the two halves of an
 * explanation makes it read as two unrelated facts. Same card, same heading
 * treatment, no dividers — and the heading takes the brand colour, because this
 * is the one screen in the app that is allowed to be about the app.
 */
function AboutSection({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <YStack gap="$2" paddingTop="$4">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                           color={palette.brand}>
                {title.toUpperCase()}
            </DotMatrixText>
            <YStack backgroundColor={palette.surface} borderRadius="$5"
                    paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2">
                {children}
            </YStack>
        </YStack>
    );
}

/** Body copy. At module scope; see the note in every other component here. */
function AboutParagraph({children}: {children: React.ReactNode}) {
    return (
        <Text fontSize={14} lineHeight={21} color={palette.dim} paddingBottom="$2">
            {children}
        </Text>
    );
}

/**
 * A tappable line.
 *
 * A bare `Text` with an `onPress` is about thirty points tall and gives no
 * feedback; `Pressable` with a minimum height is what `SettingsActionRow` uses,
 * and these are the same kind of affordance.
 */
function AboutLink({label, url, onPress}: {label: string; url?: string; onPress?: () => void}) {
    return (
        <Pressable accessibilityRole="link" accessibilityLabel={label}
                   style={({pressed}) => ({minHeight: 44, justifyContent: "center",
                       opacity: pressed ? 0.6 : 1})}
                   onPress={() => {
                       if (onPress !== undefined) return onPress();
                       // `openURL` rejects when nothing can handle the scheme —
                       // a managed device with no browser, say. Unhandled, that
                       // is a red box in development and silence in production.
                       if (url !== undefined) {
                           Linking.openURL(url).catch(() => notify({
                               tone: "error",
                               message: "Could not open that link."
                           }));
                       }
                   }}>
            {/* Brand magenta rather than an underline. It is the app's own
                colour and appears nowhere else on the screen, so it reads as
                "this is a link" without dressing prose up as a hyperlink. */}
            <Text fontSize={14} fontWeight="600" color={palette.brand}>
                {label}
            </Text>
        </Pressable>
    );
}
