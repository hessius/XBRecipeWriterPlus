import React from "react";
import {render, type RenderOptions} from "@testing-library/react-native";
import {SafeAreaProvider, type Metrics} from "react-native-safe-area-context";
import {TamaguiProvider} from "tamagui";
import config from "@/tamagui.config";

/**
 * Every component in this app renders Tamagui primitives, which render nothing
 * useful without a provider above them. Tests should use this instead of RNTL's
 * bare `render`.
 *
 * Note that `render` is asynchronous as of @testing-library/react-native 14, so
 * this must be awaited before `screen` is populated.
 */
/**
 * A notched phone, roughly. Supplied outright because the real metrics arrive
 * from the native side asynchronously, and a test would otherwise render one
 * frame with no insets and then never be told about them.
 */
const METRICS: Metrics = {
    frame:   {x: 0, y: 0, width: 390, height: 844},
    insets:  {top: 47, left: 0, right: 0, bottom: 34}
};

function Providers({children}: { children: React.ReactNode }) {
    return (
        <SafeAreaProvider initialMetrics={METRICS}>
            <TamaguiProvider config={config} defaultTheme="dark">
                {children}
            </TamaguiProvider>
        </SafeAreaProvider>
    );
}

/** The insets `renderWithProviders` supplies, for tests that assert on them. */
export const TEST_INSETS = METRICS.insets;

export function renderWithProviders(
    ui: React.ReactElement,
    options?: Omit<RenderOptions, "wrapper">
) {
    return render(ui, {wrapper: Providers, ...options});
}
