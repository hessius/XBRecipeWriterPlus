import * as Application from "expo-application";
import React, {useState} from "react";
import {Linking} from "react-native";
import {ScrollView, Text, YStack} from "tamagui";

import AboutTicker from "@/components/AboutTicker";
import LivingMark from "@/components/LivingMark";
import SettingsSection from "@/components/SettingsSection";
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
                </AboutParagraph>
                <LicenceList/>
            </SettingsSection>
        </ScrollView>
    );
}

/**
 * The full licence list, collapsed by default.
 *
 * `LICENCES` is generated from the whole dependency tree and runs to hundreds
 * of entries — mounting all of them as `Text` nodes the moment this screen
 * opens is work nobody asked for, since the count above already satisfies the
 * distribution obligation at a glance. Expanding is a deliberate act, and the
 * list is thrown away again on collapse rather than kept mounted off-screen.
 */
function LicenceList() {
    const [expanded, setExpanded] = useState(false);

    return (
        <YStack paddingTop="$2" gap="$1">
            <Text accessibilityRole="button"
                  accessibilityLabel={expanded ? "Hide licences" : "Show licences"}
                  fontSize={13} color={palette.text} paddingVertical="$1.5"
                  textDecorationLine="underline"
                  onPress={() => setExpanded((current) => !current)}>
                {expanded ? "Hide licences" : "Show licences"}
            </Text>
            {expanded && LICENCES.map((entry) => (
                <Text key={entry.name} fontSize={11} color={palette.muted}>
                    {entry.name} {entry.version} — {entry.licence}
                </Text>
            ))}
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

function AboutLink({label, url}: {label: string; url: string}) {
    return (
        <Text accessibilityRole="link" accessibilityLabel={label}
              fontSize={14} color={palette.text} paddingVertical="$1.5"
              textDecorationLine="underline"
              onPress={() => Linking.openURL(url)}>
            {label}
        </Text>
    );
}
