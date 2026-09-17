import React from "react";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/**
 * A titled block on the ABOUT deck.
 *
 * The deck answers four separate questions -- what a recipe is for, what it is
 * linked to, where it arrived from and how it has gone -- and each one needs a
 * heading a reader can scroll to rather than a run of rows that all look alike.
 *
 * Doto caps for the heading, because a section title is a label the app prints
 * rather than something a person wrote. The prose inside a section is Inter.
 *
 * Declared at module scope, like every component here: one defined inside a
 * parent's body is a new type on every render and is remounted each time.
 */
export default function DeckSection({title, testID, children}: {
    title: string;
    testID?: string;
    children: React.ReactNode;
}) {
    return (
        <YStack testID={testID} gap="$2" marginTop="$4">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {title}
            </DotMatrixText>
            {children}
        </YStack>
    );
}
