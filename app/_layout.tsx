import {useFonts} from 'expo-font';
import {DarkTheme, SplashScreen, Stack, ThemeProvider} from 'expo-router';
import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TamaguiProvider, Theme} from 'tamagui';
import config from '../tamagui.config' // your configuration
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Toasts} from '@backpackapp-io/react-native-toast';
import {StatusBar} from 'expo-status-bar';
import {ShareIntentProvider} from 'expo-share-intent';
import {palette} from '@/constants/colors';
import SplashOverlay from '@/components/SplashOverlay';
import {useSetting} from '@/hooks/useSetting';
import {asTransition} from '@/library/Settings';


// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const AppTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background:   palette.base,
        card:         palette.base,
        text:         palette.text,
        border:       palette.line,
        primary:      palette.text,
        notification: palette.danger
    }
};

export default function RootLayout() {
    const [transition] = useSetting("transition");
    const [splashDone, setSplashDone] = useState(false);
    const [loaded] = useFonts({
        SpaceMono:        require('../assets/fonts/SpaceMono-Regular.ttf'),
        "Doto-Bold":      require('../assets/fonts/Doto-Bold.ttf'),
        "Doto-ExtraBold": require('../assets/fonts/Doto-ExtraBold.ttf')
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    if (!loaded) {
        return null;
    }

    return (
        <ShareIntentProvider
            options={{
                debug:             false,
                resetOnBackground: true
            }}>
            <GestureHandlerRootView style={{flex: 1}}>
                <TamaguiProvider config={config} defaultTheme="dark">
                    <Theme name="dark">
                            <SafeAreaProvider>
                                <ThemeProvider value={AppTheme}>
                                    {/* A plain view, not a SafeAreaView. Insetting
                                        here inset every screen on every edge, which
                                        left the app floating in black bars: the list
                                        stopped short of the bottom of the display and
                                        the editor's accent slab began below the status
                                        bar instead of running up behind it. The insets
                                        are applied as padding by the surfaces that
                                        actually need them, so backgrounds can reach the
                                        edges while their contents do not. */}
                                    <View style={{flex: 1, backgroundColor: palette.base}}>
                                        <Stack
                                            screenOptions={{
                                                headerStyle:      {
                                                    backgroundColor: palette.base
                                                },
                                                headerTintColor:  palette.text,
                                                headerTitleStyle: {
                                                    fontWeight: 'bold'
                                                }
                                            }}>
                                            <Stack.Screen name="index" options={{}}/>
                                            {/* The editor draws its own header,
                                                on the accent, inside RecipeHero.
                                                Declared here rather than turned
                                                off from inside the screen: an
                                                effect runs after the first
                                                paint, so the native bar it was
                                                replacing got one frame to
                                                flash. */}
                                            {/* Every transition but `slide`
                                                is drawn inside the screen, so
                                                it only works if the screen
                                                itself is not moving: a push
                                                would carry the rectangle in
                                                from the right while it was
                                                trying to travel up. `slide` is
                                                that push, and is the default --
                                                it is the one a user already
                                                knows. */}
                                            <Stack.Screen name="editRecipe"
                                                          options={{
                                                              headerShown: false,
                                                              animation: asTransition(transition) === "slide"
                                                                  ? "slide_from_right"
                                                                  : "none"
                                                          }}/>
                                            <Stack.Screen name="settings" options={{title: "Settings"}}/>
                                        </Stack>
                                        <Toasts/>
                                        <StatusBar hidden={false}/>
                                    </View>
                                    <SplashOverlay visible={!splashDone}
                                                   onFinished={() => setSplashDone(true)}/>
                                </ThemeProvider>
                            </SafeAreaProvider>
                    </Theme>
                </TamaguiProvider>
            </GestureHandlerRootView>
        </ShareIntentProvider>
    );
}
