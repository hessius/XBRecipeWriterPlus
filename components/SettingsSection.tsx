import React from "react";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** Omitted by the identity section, which needs no label above the app's name. */
    title?: string;
    children: React.ReactNode;
};

/**
 * A group of settings rows under a heading.
 *
 * The heading is Doto because it is a machine label rather than prose — the same
 * treatment the screen already used for its one section before there were
 * several. Upper-cased here rather than at the call sites so the sections cannot
 * drift apart from one another.
 */
export default function SettingsSection({title, children}: Props) {
    return (
        <YStack gap="$2" paddingTop="$4">
            {title !== undefined && (
                <DotMatrixText testID="settings-section-title" fontSize={11}
                               weight="bold" letterSpacing={1.6} color={palette.dim}>
                    {title.toUpperCase()}
                </DotMatrixText>
            )}
            <YStack>{children}</YStack>
        </YStack>
    );
}
