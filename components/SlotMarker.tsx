import React from "react";
import {Text} from "tamagui";
import {onAccent} from "@/constants/colors";

export default function SlotMarker({label, compact = false}: {label?: string; compact?: boolean}) {
    if (label === undefined) return null;
    return (
        <Text testID="slot-marker" color={onAccent.label} fontSize={11}
              numberOfLines={compact ? 1 : 2} accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
            {label}
        </Text>
    );
}
