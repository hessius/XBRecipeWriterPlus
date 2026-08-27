import React from "react";

import FieldRow from "@/components/FieldRow";
import SegmentedControl, {type SegmentOption} from "@/components/SegmentedControl";
import type {HelpTopic} from "@/constants/recipeHelp";

export type {SegmentOption};

type Props = {
    topic: HelpTopic;
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** The recipe's accent, used to fill the selected segment. */
    accent?: string;
    showHint?: boolean;
};

/** A `FieldRow` whose value is one of a short list. */
export default function SegmentedRow({
    topic, value, options, onChange, accent, showHint
}: Props) {
    return (
        <FieldRow topic={topic} showHint={showHint}>
            <SegmentedControl value={value} options={options} onChange={onChange}
                              accent={accent}/>
        </FieldRow>
    );
}
