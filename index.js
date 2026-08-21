// Tamagui v2 needs its native setup to run before Expo Router initialises the
// app. Without setup-teleport, React context is not preserved inside portalled
// content on native, which would break every Sheet and Dialog in this app - they
// sit inside the Tamagui, theme and share-intent providers and rely on that
// context. setup-gesture-handler gives the Sheets a smoother native drag.
//
// This is why package.json `main` points here rather than at expo-router/entry.
import '@tamagui/native/setup-teleport';
import '@tamagui/native/setup-gesture-handler';

import 'expo-router/entry';
