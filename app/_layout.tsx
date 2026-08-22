import {useFonts} from 'expo-font';
import {DarkTheme, SplashScreen, Stack, ThemeProvider} from 'expo-router';
import React, {useEffect, useState} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TamaguiProvider, Theme} from 'tamagui';
import config from '../tamagui.config' // your configuration
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Toasts} from '@backpackapp-io/react-native-toast';
import {StatusBar} from 'expo-status-bar';
import {ShareIntentProvider} from 'expo-share-intent';
import {palette} from '@/constants/colors';
import SplashOverlay from '@/components/SplashOverlay';


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
                                    <SafeAreaView style={{flex: 1, backgroundColor: palette.base}}>
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
                                            <Stack.Screen name="editRecipe" options={{title: "Edit Recipe"}}/>
                                        </Stack>
                                        <Toasts/>
                                        <StatusBar hidden={false}/>
                                    </SafeAreaView>
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
