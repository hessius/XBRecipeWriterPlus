import Machine from "@/library/machine/Machine";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {FRAME_GAP_MS, RECIPE_ACK_MS} from "@/constants/machine";

import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {event, notification, status} from "./protocolFixtures";

/** A pour-start event carrying the machine's own one-based pour index. */
function Uint8ArrayPourEvent(index: number): number[] {
    return notification(40510 & 0xFF, 40510 >> 8, [index]);
}

describe("connecting to a machine", () => {
    it("handshakes immediately, because the machine stops listening after 200 ms", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});

        await machine.connect("AA:BB");

        // The handshake must be the very first thing written. Anything ahead of
        // it in the queue spends the window we are inside.
        expect(transport.sent[0]).toBe(8100);
    });

    it("asks the machine what it is", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        transport.emit(machineInfoFrame());

        expect(machine.info).toMatchObject({
            serial: "J15ABC123456",
            firmware: "V12.0D.500",
            mode: "PRO",
            waterEnough: true,
            grindSize: 62
        });
    });

    it("tracks the machine's state as it reports it", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        transport.emit(status(0x01));
        expect(machine.state).toBe(0x01);

        transport.emit(status(0x1F));
        expect(machine.state).toBe(0x1F);
    });

    it("says the link is taken rather than blaming the machine", async () => {
        // The machine permits one link at a time and gives no protocol-level
        // rejection when it is taken — it simply ignores you. The most likely
        // cause by far is the official app, and the copy should say so rather
        // than implying the hardware is broken.
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects.toThrow(/another app|in use/i);
    });

    it("forgets everything it knew when the link drops", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());
        expect(machine.info).not.toBeNull();

        transport.drop();

        expect(machine.isConnected()).toBe(false);
        expect(machine.info).toBeNull();
    });
});

/** A balanced, card-legal recipe: 18 g at 1:16 is 288 ml over two pours. */
function brewable(volumes = [144, 144]): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.grinder = true;
    recipe.pours = volumes.map((volume, index) => new Pour(
        index + 1, volume, 93, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 0
    ));
    return recipe;
}

/** A machine that is connected, idle and has water. */
async function readyMachine() {
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0});
    await machine.connect("AA:BB");
    transport.emit(machineInfoFrame());
    transport.emit(status(0x01));
    transport.written = [];
    return {transport, machine};
}

describe("brewing", () => {
    it("refuses to send while the machine is busy", async () => {
        const {transport, machine} = await readyMachine();
        transport.emit(status(0x10)); // brewing

        await expect(machine.brew(brewable())).rejects.toThrow(/busy|already brewing/i);
        expect(transport.sent).toEqual([]);
    });

    it("refuses to send when the tank is low", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame({waterEnough: 0}));
        transport.emit(status(0x01));
        transport.written = [];

        await expect(machine.brew(brewable())).rejects.toThrow(/water/i);
        expect(transport.sent).toEqual([]);
    });

    it("leaves a gap between the frames of a brew, because a burst is lost", async () => {
        // The reason brewing did not work on hardware at all. These are Write
        // Without Response, so nothing anywhere paces them: a single command
        // lands every time, and a burst of five is dropped. The machine then
        // says nothing, which arrives here as the acknowledgement timeout and
        // the message that the recipe was refused.
        jest.useFakeTimers();
        try {
            const transport = new FakeTransport();
            // The real gap, not the zero every other test uses.
            const machine = new Machine(transport);
            await machine.connect("AA:BB");
            transport.emit(status(0x01));
            transport.written = [];

            const brewing = machine.brew(brewable());
            await Promise.resolve();
            expect(transport.sent).toEqual([8100]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
            expect(transport.sent).toEqual([8100, 8102]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 3);
            expect(transport.sent).toEqual([8100, 8102, 8104, 8001, 8002]);

            await brewing;
        } finally {
            jest.useRealTimers();
        }
    });

    it("refuses to send to a machine that has not said how it is doing", async () => {
        // "We never heard" is not "the tank is fine". The info frame is the
        // only report of the water level there is, so treating its absence as
        // permission is how a recipe gets committed to an empty machine.
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        transport.written = [];

        await expect(machine.brew(brewable())).rejects.toThrow(/has not said/i);
        expect(transport.sent).toEqual([]);
    });

    it("ends the brew when the radio refuses a frame, instead of waiting for ever", async () => {
        // Leaving the phase at `sending` with no timer armed means nothing can
        // ever move it: the brew screen spins until the app is killed.
        const {transport, machine} = await readyMachine();
        const phases: string[] = [];
        machine.onPhase((phase) => phases.push(phase.name));
        transport.failNextWrite = "the radio is busy";

        await expect(machine.brew(brewable())).rejects.toThrow(/radio is busy/i);

        expect(machine.phase).toMatchObject({name: "failed", reason: "rejected"});
        expect(phases).toContain("failed");
    });

    it("refuses a recipe the card limits would reject", async () => {
        // The same gate as WRITE. A recipe the machine cannot execute should
        // not be attempted just because it arrived by a different route.
        const {transport, machine} = await readyMachine();
        const broken = brewable();
        broken.ratio = 900;

        await expect(machine.brew(broken)).rejects.toThrow();
        expect(transport.sent).toEqual([]);
    });

    it("sends the handshake, dose, cup range, recipe and commit, in that order", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        expect(transport.sent).toEqual([8100, 8102, 8104, 8001, 8002]);
    });

    it("uses the no-grind opcode for a recipe that does not grind", async () => {
        const {transport, machine} = await readyMachine();
        const recipe = brewable();
        recipe.grinder = false;
        await machine.brew(recipe);

        expect(transport.sent).toContain(8004);
        expect(transport.sent).not.toContain(8001);
    });

    it("uses the tea commands for a tea recipe", async () => {
        const {transport, machine} = await readyMachine();
        const tea = brewable([80]);
        tea.cupType = CUP_TYPE.TEA;
        tea.dosage = 5;
        tea.grinder = false;
        tea.pours[0].pauseTime = 60;
        await machine.brew(tea);

        expect(transport.sent).toEqual([8100, 8102, 4513, 4512]);
    });

    it("walks the happy path to ENJOY", async () => {
        const {transport, machine} = await readyMachine();
        const phases: string[] = [];
        machine.onPhase((phase) => phases.push(phase.name));

        await machine.brew(brewable());

        transport.emit(status(0x1D));      // loading
        transport.emit(status(0x1F));      // armed
        transport.emit(status(0x22));      // starting
        transport.emit(event(40507));      // grinder stop
        transport.emit(event(40510));      // pour 1
        transport.emit(event(40511));      // brewer stop
        transport.emit(event(40512));      // enjoy

        expect(phases).toContain("armed");
        expect(phases).toContain("grinding");
        expect(phases).toContain("pouring");
        expect(phases.at(-1)).toBe("done");
    });

    it("counts the pours off the machine's own index", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable([100, 100, 88]));

        transport.emit(status(0x22));
        transport.emit(event(40507));
        transport.emit(Uint8ArrayPourEvent(2));

        expect(machine.phase).toMatchObject({name: "pouring", pour: 2, pours: 3});
    });

    it("asks for the button rather than sending 40518", async () => {
        // The single most dangerous unknown in the protocol: one source watched
        // 40518 move the state backwards, another verified it aborts a running
        // brew, a third calls it PAUSE. The fallback costs the user one press
        // of a button they are standing in front of.
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        transport.written = [];

        transport.emit(status(0x1E)); // awaiting_confirm

        expect(machine.phase.name).toBe("pressPlay");
        expect(transport.sent).not.toContain(40518);
    });

    it("does not give up during the twenty seconds the machine grinds in silence", async () => {
        // After commit the machine emits no status frames at all while it
        // grinds. A timeout here reports a failure that did not happen.
        jest.useFakeTimers();
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        transport.emit(status(0x22));

        jest.advanceTimersByTime(40_000);

        expect(machine.phase.name).toBe("grinding");
        jest.useRealTimers();
    });

    it("ends on a terminal error with its own name", async () => {
        for (const [code, name] of [
            [40522, "noWater"],
            [8203, "gearPosition"],
            [8204, "doseMismatch"],
            [40517, "idling"]
        ] as [number, string][]) {
            const {transport, machine} = await readyMachine();
            await machine.brew(brewable());

            transport.emit(event(code));

            expect(machine.phase).toMatchObject({name: "failed", reason: name});
        }
    });

    it("ends on no beans", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        transport.emit(status(0x0F));

        expect(machine.phase).toMatchObject({name: "failed", reason: "noBeans"});
    });

    it("cancels by asking the machine to stop and then to go home", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        transport.emit(status(0x22));
        transport.written = [];

        await machine.cancelBrew();

        expect(transport.sent).toEqual([40519, 8022]);
        expect(machine.phase.name).toBe("cancelled");
    });

    it("says the machine is still brewing when the link drops, not that it failed", async () => {
        // The machine executes a committed recipe by itself. Losing Bluetooth
        // is assumed not to abort it — item 8 on the hardware checklist. Until
        // that is checked, claiming a failure would be the more damaging guess.
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        transport.emit(status(0x22));

        transport.drop();

        expect(machine.phase.name).toBe("lostContact");
    });

    it("does not gate on the mode, because the official app does not either", async () => {
        // Only slot writes are known to need PRO. Refusing to try would be
        // inventing a restriction from a fact about a different feature.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame({mode: "91327856"})); // EASY
        transport.emit(status(0x01));
        transport.written = [];

        await machine.brew(brewable());

        expect(transport.sent).toEqual([8100, 8102, 8104, 8001, 8002]);
    });

    it("offers a mode switch only when a send goes nowhere on an EASY machine", async () => {
        jest.useFakeTimers();
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame({mode: "91327856"}));
        transport.emit(status(0x01));
        transport.written = [];

        await machine.brew(brewable());
        // No 0x1D, no 0x1F: the machine simply never answered.
        jest.advanceTimersByTime(RECIPE_ACK_MS + 100);

        expect(machine.phase).toMatchObject({name: "failed", reason: "rejected"});
        expect(machine.canOfferProMode()).toBe(true);
        // Never switched behind the user's back.
        expect(transport.sent).not.toContain(11511);
        jest.useRealTimers();
    });

    it("does not offer a mode switch to a machine already in PRO", async () => {
        jest.useFakeTimers();
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        jest.advanceTimersByTime(RECIPE_ACK_MS + 100);

        expect(machine.phase).toMatchObject({name: "failed", reason: "rejected"});
        expect(machine.canOfferProMode()).toBe(false);
        void transport;
        jest.useRealTimers();
    });

    it("switches to PRO and retries once when asked to", async () => {
        jest.useFakeTimers();
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame({mode: "91327856"}));
        transport.emit(status(0x01));
        transport.written = [];
        await machine.brew(brewable());
        jest.advanceTimersByTime(RECIPE_ACK_MS + 100);
        transport.written = [];

        jest.useRealTimers();
        await machine.switchToProAndRetry(brewable());

        // The mode switch, then the whole send again.
        expect(transport.sent).toEqual([11511, 8100, 8102, 8104, 8001, 8002]);
    });
});

describe("waiting for the user to start the brew", () => {
    it("uploads the recipe but holds the commit back", async () => {
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);

        await machine.brew(brewable());

        // Everything but the one frame that sets a burr spinning.
        expect(transport.sent).toEqual([8100, 8102, 8104, 8001]);
        expect(machine.phase.name).toBe("readyToStart");
    });

    it("commits when the user says so", async () => {
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());
        transport.written = [];

        await machine.startBrew();

        expect(transport.sent).toEqual([8002]);
        expect(machine.phase.name).toBe("sending");
    });

    it("holds the tea commit back too", async () => {
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);
        const tea = brewable([80]);
        tea.cupType = CUP_TYPE.TEA;
        tea.dosage = 5;
        tea.grinder = false;
        tea.pours[0].pauseTime = 60;

        await machine.brew(tea);
        expect(transport.sent).toEqual([8100, 8102, 4513]);

        transport.written = [];
        await machine.startBrew();
        expect(transport.sent).toEqual([4512]);
    });

    it("keeps the start button up while the machine reports the recipe loaded", async () => {
        // The machine acknowledges the upload by moving to loading and then
        // armed. Letting that overwrite the phase would replace the only
        // control that can start the brew with a progress line that never
        // moves, and the recipe would sit there for ever.
        const {machine, transport} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());

        transport.emit(status(0x1D));
        transport.emit(status(0x1F));

        expect(machine.phase.name).toBe("readyToStart");
    });

    it("still reports a machine that cannot brew while it waits to be started", async () => {
        const {machine, transport} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());

        transport.emit(status(0x0F)); // no beans

        expect(machine.phase).toMatchObject({name: "failed", reason: "noBeans"});
    });

    it("refuses to start a brew that was never uploaded", async () => {
        const {machine} = await readyMachine();

        await expect(machine.startBrew()).rejects.toThrow(/no recipe/i);
    });

    it("does not leave the old commit lying around after a cancel", async () => {
        // Otherwise START on a later screen would commit the recipe the user
        // has already stopped.
        const {machine, transport} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());

        await machine.cancelBrew();
        transport.written = [];

        await expect(machine.startBrew()).rejects.toThrow(/no recipe/i);
    });
});

describe("a notification carrying more than one frame", () => {
    /**
     * A status frame packed behind a weight frame. Captured shape, real values:
     * the machine does this under load, and until it was noticed the second
     * frame was thrown away — which for a status frame means the brew screen
     * never learns the recipe arrived.
     */
    function packed(...frames: number[][]): number[] {
        return frames.flat();
    }

    it("acts on the frame behind the first one", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        // Weight first, so the status frame is the one that would have been
        // dropped.
        transport.emit(packed(notification(0x4B, 0x9E, [0, 0, 0, 0]), status(0x22)));

        expect(machine.state).toBe(0x22);
        expect(machine.phase.name).toBe("grinding");
    });

    it("logs one line per frame, not one per packet", async () => {
        const {transport, machine} = await readyMachine();
        const logged: string[] = [];
        machine.onFrame((direction, frame, parsed) => {
            if (direction === "received") logged.push(`${parsed.kind}:${frame.length}`);
        });

        const weight = notification(0x4B, 0x9E, [0, 0, 0, 0]);
        const state = status(0x22);
        transport.emit(packed(weight, state));

        expect(logged).toEqual([
            `waterWeight:${weight.length}`, `status:${state.length}`
        ]);
    });
});
