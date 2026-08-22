import React from "react";
import {render, type RenderOptions} from "@testing-library/react-native";
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
function Providers({children}: { children: React.ReactNode }) {
    return (
        <TamaguiProvider config={config} defaultTheme="dark">
            {children}
        </TamaguiProvider>
    );
}

export function renderWithProviders(
    ui: React.ReactElement,
    options?: Omit<RenderOptions, "wrapper">
) {
    return render(ui, {wrapper: Providers, ...options});
}
