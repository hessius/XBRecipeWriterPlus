import * as Application from "expo-application";
import {router} from "expo-router";
import React from "react";
import {Linking, Pressable} from "react-native";
import {ScrollView, Text, YStack} from "tamagui";

import AboutTicker from "@/components/AboutTicker";
import LivingMark from "@/components/LivingMark";
import SettingsSection from "@/components/SettingsSection";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {LICENCES} from "@/constants/licences";

const REPO_URL = "https://github.com/hessius/XBRecipeWriterPlus";
const ISSUES_URL = "https://github.com/hessius/XBRecipeWriterPlus/issues";

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
    "MADE BY HESSIUS"
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
        <ScrollView backgroundColor={palette.base}
                    contentContainerStyle={{padding: 16, paddingBottom: 48}}>
            <YStack alignItems="center" gap="$3" paddingVertical="$6">
                <LivingMark size={180}/>
                <AboutTicker lines={TICKER_LINES}/>
            </YStack>

            <YStack alignItems="center" gap="$1" paddingBottom="$4">
                <Text fontSize={16} color={palette.text}>XBRecipeWriter++</Text>
                <Text fontSize={13} color={palette.dim}>
                    Version {VERSION} (build {BUILD})
                </Text>
            </YStack>

            <SettingsSection title="Independent">
                <AboutParagraph>
                    XBRecipeWriter++ is not affiliated with, endorsed by or
                    supported by xBloom. xBloom and its logos are the trademarks
                    of their owner, used here only to say which machine and which
                    cards this app works with.
                </AboutParagraph>
                <AboutParagraph>
                    It reads and writes recipe cards for that machine, and it can
                    import a recipe shared through the manufacturer&apos;s own
                    service. Neither capability is documented or guaranteed, and
                    either may stop working without notice.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="What leaves your phone">
                <AboutParagraph>
                    Your recipes stay on this phone. There is no account, no sync
                    and no analytics.
                </AboutParagraph>
                <AboutParagraph>
                    Importing a shared recipe sends that recipe&apos;s ID to the
                    manufacturer&apos;s service in order to fetch it. Nothing
                    else is sent anywhere. A backup goes only where you send it.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="Why only genuine cards work">
                <AboutParagraph>
                    The first 32 bytes of every recipe card are a signature
                    derived from that card&apos;s serial number. This app cannot
                    compute one, so it reads the signature off the card and
                    writes it back untouched.
                </AboutParagraph>
                <AboutParagraph>
                    That is why a recipe can be written to a card that came with
                    coffee in it, and why a blank card will not take one.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="Made by">
                <AboutParagraph>
                    Built by Jesper Hessius. Free, open source, and not for sale.
                </AboutParagraph>
                <AboutLink label="Source code" url={REPO_URL}/>
                <AboutLink label="Report an issue" url={ISSUES_URL}/>
            </SettingsSection>

            <SettingsSection title="Third-party licences">
                <AboutParagraph>
                    This app stands on {LICENCES.length} open-source packages.
                    Their licences, and the copyright notices those licences
                    require reproducing, are listed in full.
                </AboutParagraph>
                <AboutLink label="Read the licences" onPress={() => router.push("/licences")}/>
            </SettingsSection>
        </ScrollView>
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
            <Text fontSize={14} color={palette.text} textDecorationLine="underline">
                {label}
            </Text>
        </Pressable>
    );
}
