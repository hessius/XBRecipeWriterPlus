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
                    style={{flex: 1, backgroundColor: palette.base}}
                    onLoadStart={onLoadStart}
                    onLoadEnd={onLoadEnd}
                    onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                    onNavigationStateChange={onNavigationStateChange}/>
            </YStack>
        </Modal>
    );
}
