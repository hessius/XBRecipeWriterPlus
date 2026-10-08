import React from "react";
import {Button, Text, XStack, YStack} from "tamagui";

import SettingsSection from "@/components/SettingsSection";
import {palette} from "@/constants/colors";
import {SPIKE_FRAMES, type SpikeFrame} from "@/library/machine/spikeFrames";

type Props = {
    onSend: (frame: Uint8Array) => void;
};

/**
 * The Appendix A spike, one labelled button per question.
 *
 * It sits above Commands and Raw frame because during the spike it is the only
 * part of this screen anyone wants, and because the alternative was typing
 * thirty-byte frames by hand next to a machine that was mid-brew.
 *
 * Disposable, with `library/machine/spikeFrames.ts`. When the questions are
 * answered both go.
 */
export default function MachineSpikeSection({onSend}: Props) {
    return (
        <SettingsSection title="Appendix A spike">
            {SPIKE_FRAMES.map((spike) => (
                <SpikeRow key={spike.id} spike={spike} onSend={onSend}/>
            ))}
        </SettingsSection>
    );
}

function SpikeRow({spike, onSend}: {spike: SpikeFrame; onSend: Props["onSend"]}) {
    return (
        <YStack gap="$2" paddingVertical="$3" paddingHorizontal="$4">
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <Text flex={1} fontSize={15} color={palette.text}>{spike.label}</Text>
                <Text fontSize={10} fontWeight="700" letterSpacing={1} color={palette.dim}>
                    {spike.question.toUpperCase()}
                </Text>
            </XStack>

            <Text fontSize={12} color={palette.dim}>{spike.watch}</Text>

            {spike.hazard !== undefined && (
                <Text testID={`spike-hazard-${spike.id}`} fontSize={12} color={palette.warn}>
                    {spike.hazard}
                </Text>
            )}

            <Button size="$3" accessibilityRole="button"
                    accessibilityLabel={`Send ${spike.label}`}
                    borderColor={spike.hazard === undefined ? palette.line : palette.warn}
                    borderWidth={1}
                    backgroundColor={palette.raised} color={palette.text}
                    onPress={() => onSend(spike.build())}>
                Send
            </Button>
        </YStack>
    );
}
