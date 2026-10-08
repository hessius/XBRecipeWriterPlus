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
        question: "Q4 setup",
        label: "Switch to PRO (11511)",
        watch: "Slot writes are refused in AUTO, where the machine sits at 0x41.",
        build: () => buildType2(11511, ascii("00000000"))
    },
    {
        id: "slot-a",
        question: "Q4",
        label: "Easy slot A only (15 g / 225 ml)",
        watch: "Ten seconds after this alone: does the machine report 0x43 and "
            + "display RETRY?",
        hazard: "A partial batch is documented to hang the machine. Q5 is whether "
            + "sending the other two gets it back.",
        build: () => slotFrame(0, 0x02)
    },
    {
        id: "slot-b",
        question: "Q5",
        label: "Easy slot B (18 g / 270 ml)",
        watch: "Second of the three. Nothing should complete until C arrives.",
        build: () => slotFrame(1, 0x02)
    },
    {
        id: "slot-c-04",
        question: "Q5 and Q6",
        label: "Easy slot C, grinder nibble 0x04",
        watch: "Does the batch now progress 0x43 to 0x25 to 0x01? Then open slot "
            + "C on the machine: does it show the grinder as off?",
        build: () => slotFrame(2, 0x04)
    },
    {
        id: "slot-c-02",
        question: "Q6",
        label: "Easy slot C, grinder nibble 0x02",
        watch: "Send A and B again first, the batch is atomic. If C looks the "
            + "same either way then the nibble is not what carries the grinder "
            + "and the blob's own FE byte is.",
        build: () => slotFrame(2, 0x02)
    }
];
