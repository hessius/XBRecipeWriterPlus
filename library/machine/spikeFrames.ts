import {
    ascii, buildType1, buildType2, encodeCoffeeBlob, type BlobRecipe
} from "@/library/machine/protocol";

/**
 * The frames the Appendix A hardware spike asks for, each with the question it
 * answers and what to watch while it is in the air.
 *
 * This module is deliberately disposable. It exists because the spike's seven
 * questions were being answered by hand-typing thirty-byte frames into the raw
 * field on a phone, next to a machine mid-brew, which is both slow and the kind
 * of thing that sends `80 19` when it meant `58 01 01 53 1F 0C 00 00 00 01 63 E5`.
 * When the questions are answered this file goes, and whatever it taught moves
 * into `docs/machine-integration/ble-protocol.md`.
 *
 * The slot frames are built from the real encoders rather than pasted as hex,
 * so a spike frame cannot disagree with what the app would actually send.
 */
export type SpikeFrame = {
    id: string;
    /** The question from Appendix A this answers. */
    question: string;
    label: string;
    /** What to watch while it is in the air, in the log or on the machine. */
    watch: string;
    /** Set where sending this costs something. */
    hazard?: string;
    build: () => Uint8Array;
};

/**
 * Three recipes chosen so the machine's own display says which slot got which.
 * C has the grinder off, which is what question 6 turns on.
 */
function slotRecipe(dosage: number, volume: number, temperature: number,
                    pattern: number, grinder: boolean): BlobRecipe {
    return {
        dosage,
        grindSize: grinder ? 65 : 70,
        grindRPM: 90,
        grinder,
        pours: [{
            volume, temperature, pourPattern: pattern, agitation: 0,
            pauseTime: 0, flowRate: 30
        }]
    };
}

const SLOT_RECIPES: BlobRecipe[] = [
    slotRecipe(15, 225, 93, 0, true),
    slotRecipe(18, 270, 92, 1, true),
    slotRecipe(20, 300, 90, 2, false)
];

/** Command 11510's payload: the slot index, the flags byte, then the blob. */
function slotFrame(index: number, flags: number): Uint8Array {
    const blob = encodeCoffeeBlob(SLOT_RECIPES[index]);
    return buildType2(11510, Uint8Array.from([index, flags, ...blob]));
}

export const SPIKE_FRAMES: SpikeFrame[] = [
    {
        id: "pause-40518",
        question: "Q1, Q2 and Q3, settled 2026-10-08",
        label: "Pause this brew (40518)",
        watch: "Acknowledged, then 40515 with the volume so far, then state 0x1f. "
            + "That is armed, the same code as a loaded brew, so the log cannot "
            + "tell you it is paused and only the fact you sent this can.",
        build: () => buildType1(40518, [1])
    },
    {
        id: "resume-40524",
        question: "Q1, Q2 and Q3, settled 2026-10-08",
        label: "Resume this brew (40524)",
        watch: "Acknowledged, then 40516, then back to 0x23. The brew continues "
            + "from where it stopped: stage indices carry on rather than repeat. "
            + "Both commands are inert when they do not apply.",
        build: () => buildType1(40524, [1])
    },
    {
        id: "pause-8019",
        question: "Q2, settled 2026-10-08",
        label: "FreeSolo pour (8019)",
        watch: "State 0x03, water, then 9006 and 0x41 about thirteen seconds "
            + "later. Kept only so the behaviour can be re-checked on another "
            + "firmware, because every source still calls this a pause.",
        hazard: "Destructive. This abandons a running recipe and pours water. It "
            + "is not a pause, whatever its name says.",
        build: () => buildType1(8019)
    },
    {
        id: "resume-8021",
        question: "Q2, settled 2026-10-08",
        label: "FreeSolo stop (8021)",
        watch: "Ends an 8019 pour. It reports 0x23, which looks like brewing, but "
            + "the recipe it would have resumed is already gone.",
        build: () => buildType1(8021)
    },
    {
        id: "pro-mode",
        question: "Q4, settled 2026-10-08",
        label: "Switch to PRO (11511)",
        watch: "Acknowledged, and makes no difference. The batch behaved the "
            + "same with and without it, so PRO is not a precondition for a "
            + "slot write after all. Note that a completed batch leaves the "
            + "machine in EASY whatever this said.",
        build: () => buildType2(11511, ascii("00000000"))
    },
    {
        id: "slot-a",
        question: "Q4, settled 2026-10-08",
        label: "Easy slot A only (15 g / 225 ml)",
        watch: "The machine goes unresponsive with a looping animation. That is "
            + "the documented 0x43 hang, and it is not a brick: sending B and C "
            + "releases it.",
        hazard: "Leaves the machine stuck until the batch is finished, and "
            + "finishing it overwrites all three of the machine's saved Easy "
            + "slots and leaves it in EASY mode. Only send this if losing "
            + "those three slots is acceptable.",
        build: () => slotFrame(0, 0x02)
    },
    {
        id: "slot-b",
        question: "Q5, settled 2026-10-08",
        label: "Easy slot B (18 g / 270 ml)",
        watch: "Nothing visible changes, which is what an atomic batch looks "
            + "like from outside. Still hung until C arrives.",
        build: () => slotFrame(1, 0x02)
    },
    {
        id: "slot-c-04",
        question: "Q5 and Q6, settled 2026-10-08",
        label: "Easy slot C, grinder nibble 0x04",
        watch: "Releases the hang, and the slot shows the grinder off.",
        build: () => slotFrame(2, 0x04)
    },
    {
        id: "slot-c-02",
        question: "Q6, settled 2026-10-08",
        label: "Easy slot C, grinder nibble 0x02",
        watch: "Releases the hang too, and shows the grinder off as well. So "
            + "0x02 defers to the blob: slots A and B went up grinder on under "
            + "the same nibble and display a grind size. 0x04 has only ever "
            + "been tried with a grinder-off blob, so whether it forces off is "
            + "still open. Use 0x02 and let the blob decide.",
        build: () => slotFrame(2, 0x02)
    }
];
