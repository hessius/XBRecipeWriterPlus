import React from "react";
import {ActivityIndicator, Modal} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {WebView, type WebViewNavigation} from "react-native-webview";
import type {ShouldStartLoadRequest} from "react-native-webview/lib/WebViewTypes";
import {Button, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    visible: boolean;
    url: string;
    loading: boolean;
    onClose: () => void;
    onLoadStart: () => void;
    onLoadEnd: () => void;
    onShouldStartLoadWithRequest: (request: ShouldStartLoadRequest) => boolean;
    onNavigationStateChange: (navigation: WebViewNavigation) => void;
};

/**
 * Which schemes the WebView may classify rather than hand to the system.
 *
 * The two app schemes are here so `readBrewMindNavigation` gets to see
 * BrewMind's redirect. It is the classifier, not this list, that decides a
 * scheme navigation is a genuine handoff.
 *
 * Built from the scheme names rather than written out as four literals, which
 * reads worse and needs saying why. A literal "http://*" contains the two
 * characters that open a block comment, and the scanner in
 * `library/__tests__/networkInventory.test.ts` strips comments with a regex
 * that cannot tell a literal from code. It would read that slash and star as
 * the start of a comment and swallow the rest of this file, including the
 * `source={{uri}}` it exists to find, so the browser would quietly drop off
 * the privacy inventory. Keeping the two characters apart keeps it on.
 */
const ORIGIN_WHITELIST = ["http", "https", "xbrw", "xbrecipewriter"]
    .map((scheme) => `${scheme}://` + "*");

export default function BrewMindBrowser({
    visible,
    url,
    loading,
    onClose,
    onLoadStart,
    onLoadEnd,
    onShouldStartLoadWithRequest,
    onNavigationStateChange
}: Props) {
    const insets = useSafeAreaInsets();

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen"
               onRequestClose={onClose}>
            <YStack flex={1} backgroundColor={palette.base}
                    paddingTop={insets.top} paddingBottom={insets.bottom}
                    accessibilityViewIsModal>
                <XStack alignItems="center" gap="$3"
                        paddingHorizontal="$4" paddingVertical="$3"
                        borderBottomWidth={1} borderBottomColor={palette.line}>
                    <YStack flex={1} gap="$1">
                        <DotMatrixText fontSize={14} weight="bold"
                                       letterSpacing={1.5} color={palette.text}>
                            BREWMIND
                        </DotMatrixText>
                        <Text fontSize={12} color={palette.dim}>
                            Build a recipe from a coffee
                        </Text>
                    </YStack>
                    {loading && (
                        <ActivityIndicator testID="brewmind-browser-loading"
                                           size="small" color={palette.dim}/>
                    )}
                    <Button size="$3" chromeless color={palette.text}
                            accessibilityLabel="Close BrewMind"
                            onPress={onClose}>
                        Close
                    </Button>
                </XStack>
                <WebView
                    testID="brewmind-webview"
                    source={{uri: url}}
                    /*
                     * The default whitelist is http and https only, and a
                     * navigation outside it is handed to `Linking.openURL`
                     * without `onShouldStartLoadWithRequest` ever being asked.
                     * That would send BrewMind's own `xbrw://import` redirect
                     * out to the system, which does re-enter the app, but
                     * leaves this browser sitting open above the recipe it just
                     * imported. Naming the schemes here keeps the classifier in
                     * charge of them, so it can block the navigation and close.
                     */
                    originWhitelist={ORIGIN_WHITELIST}
                    style={{flex: 1, backgroundColor: palette.base}}
                    onLoadStart={onLoadStart}
                    onLoadEnd={onLoadEnd}
                    onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                    onNavigationStateChange={onNavigationStateChange}/>
            </YStack>
        </Modal>
    );
}
