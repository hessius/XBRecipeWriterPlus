import Machine, {isActiveBrewPhase} from "@/library/machine/Machine";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {PAUSE_ACK_MS} from "@/constants/machine";

import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {event, status} from "./protocolFixtures";

function brewable(): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.grinder = true;
    recipe.pours = [144, 144].map((volume, index) => new Pour(
        index + 1, volume, 93, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 0
    ));
    return recipe;
}

async function pouringMachine() {
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0});
    await machine.connect("AA:BB");
    transport.emit(machineInfoFrame());
    transport.emit(status(0x01));
    await machine.brew(brewable());
    transport.emit(status(0x22));      // starting
    transport.emit(event(40507));      // grinder stop -> pouring
    transport.written = [];
    return {transport, machine};
}

describe("pausing a brew", () => {
    it("sends 40518", async () => {
        const {transport, machine} = await pouringMachine();

        await machine.pauseBrew();

        expect(transport.sent).toContain(40518);
    });

    it("does not claim the brew is paused until the machine says so", async () => {
        // 0x1f is ARMED, the same code a loaded-but-unstarted brew reports, so
        // the state cannot confirm a pause and 40515 is the only thing that
        // can. Claiming it on send would tell somebody a running machine had
        // stopped, which is the lie that matters: the next thing they do is
        // walk away from it.
        const {machine} = await pouringMachine();

        await machine.pauseBrew();

        expect(machine.phase.name).toBe("pouring");
    });

    it("enters paused when 40515 arrives", async () => {
        const {transport, machine} = await pouringMachine();

        await machine.pauseBrew();
        transport.emit(event(40515, 138));

        expect(machine.phase.name).toBe("paused");
    });

    it("ignores a 40515 nobody asked for", async () => {
        // The flag is what separates a pause from an echo. Without it any
        // stray 40515 -- from the machine's own buttons, from a previous run,
        // from a frame the parser mis-split -- would freeze the UI into a
        // paused state that no resume of ours is answering.
        const {transport, machine} = await pouringMachine();

        transport.emit(event(40515, 138));

        expect(machine.phase.name).toBe("pouring");
    });

    it("gives up on a pause the machine never acknowledged", async () => {
        jest.useFakeTimers();
        try {
            const {machine} = await pouringMachine();

            await machine.pauseBrew();
            jest.advanceTimersByTime(PAUSE_ACK_MS + 100);
            // The acknowledgement arrives after the machine has stopped being
            // asked. It is too late to be about our request.
            expect(machine.phase.name).toBe("pouring");
        } finally {
            jest.useRealTimers();
        }
    });

    it("remembers the phase it paused out of", async () => {
        const {transport, machine} = await pouringMachine();

        await machine.pauseBrew();
        transport.emit(event(40515, 138));
        const phase = machine.phase;

        expect(phase.name === "paused" && phase.was.name).toBe("pouring");
    });

    it("keeps the stage it paused in, so the ladder does not jump", async () => {
        const {transport, machine} = await pouringMachine();
        transport.emit(event(40510, 1));   // pour 2 of 2

        await machine.pauseBrew();
        transport.emit(event(40515, 138));
        const phase = machine.phase;

        expect(phase.name === "paused" && phase.pour).toBe(2);
        expect(phase.name === "paused" && phase.pours).toBe(2);
    });

    it("counts as an active brew, so nothing tears the run down under it", async () => {
        const {transport, machine} = await pouringMachine();

        await machine.pauseBrew();
        transport.emit(event(40515, 138));

        expect(isActiveBrewPhase(machine.phase)).toBe(true);
    });
});

describe("resuming a brew", () => {
    async function pausedMachine() {
        const {transport, machine} = await pouringMachine();
        await machine.pauseBrew();
        transport.emit(event(40515, 138));
        return {transport, machine};
    }

    it("sends 40524", async () => {
        const {transport, machine} = await pausedMachine();

        await machine.resumeBrew();

        expect(transport.sent).toContain(40524);
    });

    it("restores the phase it paused out of without waiting for the machine", async () => {
        // The optimistic direction is the safe one here, and it is the
        // opposite of the pause's. A resume that did not take leaves the UI
        // saying "running" about a stopped machine, and the next pour event
        // corrects it. Waiting instead would leave it saying "paused" about a
        // machine pouring into a cup.
        const {machine} = await pausedMachine();

        await machine.resumeBrew();

        expect(machine.phase.name).toBe("pouring");
    });

    it("is harmless when nothing is paused", async () => {
        const {machine} = await pouringMachine();

        await machine.resumeBrew();

        expect(machine.phase.name).toBe("pouring");
    });
});

describe("leaving a pause by any other door", () => {
    async function paused() {
        const {transport, machine} = await pouringMachine();
        await machine.pauseBrew();
        transport.emit(event(40515, 138));
        return {transport, machine};
    }

    it("a stage starting clears it", async () => {
        // Anything that moves the brew contradicts the pause. The machine has
        // its own buttons and the user may have pressed one.
        const {transport, machine} = await paused();

        transport.emit(event(40510, 1));

        expect(machine.phase.name).toBe("pouring");
    });

    it("the brew finishing clears it", async () => {
        const {transport, machine} = await paused();

        transport.emit(event(40511));      // brewer stop
        transport.emit(event(40512));      // enjoy

        expect(machine.phase.name).toBe("done");
    });

    it("a failure clears it", async () => {
        const {transport, machine} = await paused();

        transport.emit(event(8203));       // gear position

        expect(machine.phase.name).toBe("failed");
    });

    it("a cancel clears it", async () => {
        const {machine} = await paused();

        await machine.cancelBrew();

        expect(machine.phase.name).toBe("cancelled");
    });

    it("the machine's acknowledgement of the resume clears it", async () => {
        // 40516 arrives for a resume we sent, by which point the flag is
        // already down, but also for one the machine decided on its own.
        const {transport, machine} = await paused();

        transport.emit(event(40516));

        expect(machine.phase.name).toBe("pouring");
    });
});
