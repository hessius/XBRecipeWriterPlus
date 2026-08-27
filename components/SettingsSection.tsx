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
 * drift apart from one another. It stays outside and above the card, the way the
 * BREW deck's `ML TOTAL` caption sits above its own grouped rows.
 *
 * The rows sit inside a `surface` card — not `raised` — for two reasons, both
 * borrowed from the editor's BREW deck (`app/editRecipe.tsx`, the one grouped
 * card of value rows this app already had): `surface` (#101010) is a hair above
 * the `base` (#000000) screen, which is exactly the lift that reads as "these
 * belong together" without a heavy border; and `SettingsChoiceRow` fills its
 * `SegmentedControl` with `raised` and `SettingsToggleRow` its switch track with
 * `control` — controls a step lighter than the card, which only tell apart from
 * it if the card is the darker `surface`. A `raised` card would swallow a
 * `raised` control. The radius (`$5` = 10pt) and `overflow="hidden"` are that
 * same BREW-deck card's, so a user crossing from the editor to settings meets
 * the same corner.
 */
export default function SettingsSection({title, children}: Props) {
    // The divider lives here rather than on each row so that the first row has
    // nothing above it and the last nothing below it — the rounded corners stay
    // clean. `toArray` drops the `false`/`null` a conditional row leaves behind,
    // so a hidden row never leaves a doubled hairline.
    const rows = React.Children.toArray(children).filter(Boolean);

    return (
        <YStack gap="$2" paddingTop="$4">
            {title !== undefined && (
                <DotMatrixText testID="settings-section-title" fontSize={11}
                               weight="bold" letterSpacing={1.6} color={palette.dim}>
                    {title.toUpperCase()}
                </DotMatrixText>
            )}
            <YStack backgroundColor={palette.surface} borderRadius="$5" overflow="hidden">
                {rows.map((row, index) => (
                    <React.Fragment key={index}>
                        {index > 0 && (
                            // A full-bleed hairline, the weight and colour of the
                            // borderBottom every FieldRow draws in the editor deck.
                            <YStack testID="settings-row-divider" height={1}
                                    backgroundColor={palette.line}/>
                        )}
                        {row}
                    </React.Fragment>
                ))}
            </YStack>
        </YStack>
    );
}
