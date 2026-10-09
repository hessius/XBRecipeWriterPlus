import React from "react";
import {Text} from "tamagui";
import {onAccent} from "@/constants/colors";

export default function SlotMarker({label}: {label?: string}) {
    if (label === undefined) return null;
    return (
        <Text testID="slot-marker" color={onAccent.label} fontSize={11}
              numberOfLines={2} accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
            {label}
        </Text>
    );
}
