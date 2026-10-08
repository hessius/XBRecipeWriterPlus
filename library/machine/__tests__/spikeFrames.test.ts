import {SPIKE_FRAMES} from "@/library/machine/spikeFrames";

function frameFor(id: string): string {
    const spike = SPIKE_FRAMES.find((candidate) => candidate.id === id);
    if (spike === undefined) throw new Error(`no spike frame ${id}`);
    return Array.from(spike.build())
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
}

describe("the Appendix A spike frames", () => {
    /*
     * Both of these are transcribed from a real session on 2026-10-08, V12.0D.500:
     * each was acknowledged by an event notification carrying its own code, and
     * each moved the machine. They are the reason this section exists -- the
     * same two commands typed by hand went out as `80 19` and `80 21`, two bytes
     * that are not a frame at all, and the machine answered with an error.
     */
    it("sends the pause the machine acknowledged on hardware", () => {
        expect(frameFor("pause-8019")).toBe("58 01 01 53 1F 0C 00 00 00 01 63 E5");
    });

    it("sends the resume the machine acknowledged on hardware", () => {
        expect(frameFor("resume-8021")).toBe("58 01 01 55 1F 0C 00 00 00 01 AE BD");
    });

    it("gives every frame a question and something to watch", () => {
        for (const spike of SPIKE_FRAMES) {
            expect(spike.question).not.toBe("");
            expect(spike.watch).not.toBe("");
            expect(spike.build().length).toBeGreaterThan(2);
        }
    });

    it("writes the three slots in order, each with its own flags byte", () => {
        // Payload is [slot index][flags][blob], and the index is what tells the
        // machine which of the three this is. Sending the same index twice is a
        // batch of one as far as it is concerned.
        const indices = ["slot-a", "slot-b", "slot-c-04"].map((id) => {
            const spike = SPIKE_FRAMES.find((candidate) => candidate.id === id);
            return spike!.build()[10];
        });
        expect(indices).toEqual([0, 1, 2]);

        const grinderOn = SPIKE_FRAMES.find((s) => s.id === "slot-c-02")!.build();
        const grinderOff = SPIKE_FRAMES.find((s) => s.id === "slot-c-04")!.build();
        expect(grinderOff[11]).toBe(0x04);
        expect(grinderOn[11]).toBe(0x02);
    });

    it("warns where a frame costs something", () => {
        const hazards = SPIKE_FRAMES.filter((spike) => spike.hazard !== undefined);
        expect(hazards.map((spike) => spike.id)).toEqual(["pause-40518", "slot-a"]);
    });
});
