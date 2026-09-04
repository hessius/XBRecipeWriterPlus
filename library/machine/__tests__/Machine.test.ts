import Machine from "@/library/machine/Machine";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {FRAME_GAP_MS, INFO_ATTEMPTS, RECIPE_ACK_MS} from "@/constants/machine";
import {buildType1} from "@/library/machine/protocol";
import {RadioUnavailableError} from "@/library/machine/errors";

import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {event, notification, status} from "./protocolFixtures";

/** A pour-start event carrying the machine's own zero-based pour index. */
function Uint8ArrayPourEvent(index: number): number[] {
    return notification(40510 & 0xFF, 40510 >> 8, [index]);
}

/** Six identical pours. The trace in research/PROTOCOL.md was captured on six. */
function sixPourRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.grinder = true;
    // Pour(pourNumber, volume, temperature, flowRate, agitation, pattern, pause).
    // flowRate is stored times ten, so 30 is 3 ml/s.
    recipe.pours = [1, 2, 3, 4, 5, 6].map(
        (n) => new Pour(n, 48, 93, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20)
    );
    return recipe;
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

/**
 * The frames of the brew itself.
 *
 * Every brew now opens by asking the machine how it is doing, because the
 * water level goes stale. That question is not part of the sequence these
 * tests are about, so it is filtered out rather than written into each one.
 */
const brewFrames = (transport: FakeTransport): number[] =>
    transport.sent.filter((code) => code !== 40521);

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

describe("connecting", () => {
    it("passes on what the radio said, instead of blaming the machine", async () => {
        // Every failure used to be reported as "the machine is already in use
        // by another app". That guess is reasonable for a silent refusal --
        // the machine permits one link and ignores a second rather than
        // rejecting it -- but it is false for a radio that is switched off,
        // and it sends the user to the machine to fix something on the phone.
        const transport = new FakeTransport();
        transport.failConnect = new RadioUnavailableError("Bluetooth is switched off.");
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects.toThrow("Bluetooth is switched off.");
    });

    it("says so when the opening handshake never reached the machine", async () => {
        // Seen on hardware: the app said "Connected", the machine did not
        // beep, no vitals ever arrived, and the connection log said nothing at
        // all. A handshake whose write fails left the link up and useless with
        // no account of why -- and the handshake is the one frame that has to
        // land, because the machine ignores everything that follows it.
        const transport = new FakeTransport();
        transport.failNextWrite = "radio not ready";
        const machine = new Machine(transport, {frameGapMs: 0});

        await machine.connect("AA:BB").catch(() => {});

        expect(machine.linkHistory.map((e) => e.text).join(" "))
            .toMatch(/handshake.*radio not ready/i);
    });

    it("repeats a refusal that came with an explanation", async () => {
        // The guess below is for silence. When the radio has actually said
        // what went wrong, replacing that with a guess throws away the only
        // true thing anyone knows about the failure.
        const transport = new FakeTransport();
        transport.failConnect = new Error("Connection was cancelled by the peripheral.");
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects
            .toThrow("Connection was cancelled by the peripheral.");
    });

    it("treats a failure with no message at all as silence", async () => {
        // What the phone actually produced: an error whose `message` was not a
        // string, which the log dutifully rendered as the word "undefined".
        const transport = new FakeTransport();
        transport.failConnect = {} as Error;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects.toThrow(/already in use/i);
        expect(machine.linkHistory.map((e) => e.text).join(" "))
            .toContain("refused — no reason given");
    });

    it("still guesses at the machine when the failure says nothing", async () => {
        const transport = new FakeTransport();
        transport.failConnect = new Error("");
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects.toThrow(/already in use/i);
    });
});

describe("a machine that will not say how it is doing", () => {
    it("stops believing the session is live when the machine goes quiet", async () => {
        // The root cause of a brew that would not start. The session is
        // renewed on a clock, and renewing beeps, so a renewal inside the
        // freshness window is skipped. But an unanswered question is itself
        // evidence that the session is not live -- and skipping the renewal on
        // the strength of a clock meant every later attempt asked into the
        // same dead session and got the same silence, until twenty seconds had
        // passed and the clock happened to agree.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        transport.ignoreInfoRequests = INFO_ATTEMPTS;

        expect(await machine.askHowItIsDoing()).toBe(false);
        transport.written = [];
        await machine.askHowItIsDoing();

        expect(transport.sent).toContain(8100);
    });

    it("asks again by itself, rather than handing the user a refusal", async () => {
        // What the user had to do by hand: press BREW, watch nothing happen,
        // press it again, and again. Nothing was actually wrong with the
        // machine -- the question was being lost -- so there was nothing for
        // the user's third press to do that the app could not have done.
        const transport = new FakeTransport();
        transport.infoReply = null; // silent through the connect
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        // Answers only once a whole round of asking has gone unanswered.
        transport.infoReply = machineInfoFrame();
        transport.ignoreInfoRequests = INFO_ATTEMPTS;
        transport.written = [];

        await machine.brew(brewable());

        expect(machine.info).not.toBeNull();
        expect(brewFrames(transport).length).toBeGreaterThan(0);
    });

    it("gives up in the end, and says why", async () => {
        // Not infinite. A machine that is switched off is silent too, and a
        // brew screen that retries for ever never tells anyone that.
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));

        await expect(machine.brew(brewable())).rejects.toThrow(/how it is doing/i);
        expect(machine.phase).toMatchObject({name: "failed", reason: "blocked"});
    });
});

describe("brewing", () => {
    it("refuses to send while the machine is busy", async () => {
        const {transport, machine} = await readyMachine();
        transport.emit(status(0x10)); // brewing

        await expect(machine.brew(brewable())).rejects.toThrow(/busy|already brewing/i);
        expect(brewFrames(transport)).toEqual([]);
    });

    it("does not leave the screen saying everything is fine", async () => {
        // Seen on hardware: the machine beeped, the recipe never went, and the
        // brew screen sat on "Ready when you are." with nothing to press. A
        // refusal that happens before the first frame used to throw without
        // touching the phase, so the one place the user is looking never heard
        // that anything had gone wrong.
        const {transport, machine} = await readyMachine();
        transport.emit(status(0x10)); // brewing

        await machine.brew(brewable()).catch(() => {});

        expect(machine.phase.name).toBe("failed");
        expect(machine.phase).toMatchObject({detail: expect.stringMatching(/busy/i)});
    });

    it("refuses to send when the tank is low", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        // On the reply too, not only emitted once: the brew asks again, so a
        // machine still answering "tank fine" would overwrite this.
        transport.infoReply = machineInfoFrame({waterEnough: 0});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        transport.written = [];

        await expect(machine.brew(brewable())).rejects.toThrow(/water/i);
        expect(brewFrames(transport)).toEqual([]);
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
            const connecting = machine.connect("AA:BB");
            // Connecting paces its own two frames now, so it needs the clock.
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS + 10);
            await connecting;
            transport.emit(status(0x01));
            transport.written = [];

            const brewing = machine.brew(brewable());
            // Let the "how are you doing" question every brew opens with settle.
            await jest.advanceTimersByTimeAsync(0);
            expect(brewFrames(transport)).toEqual([8100]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
            expect(brewFrames(transport)).toEqual([8100, 8102]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 3);
            expect(brewFrames(transport)).toEqual([8100, 8102, 8104, 8001, 8002]);

            await brewing;
        } finally {
            jest.useRealTimers();
        }
    });

    it("abandons the rest of a brew sequence when the brew is cancelled", async () => {
        // A cancel arriving mid-sequence used to change the phase and nothing
        // else: the loop that was walking the brew frames kept walking, so the
        // stop went out and then the recipe and the commit followed it. The
        // machine would be told to go home and then told to grind.
        jest.useFakeTimers();
        try {
            const transport = new FakeTransport();
            const machine = new Machine(transport);
            const connecting = machine.connect("AA:BB");
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS + 10);
            await connecting;
            transport.emit(status(0x01));
            transport.written = [];

            const brewing = machine.brew(brewable());
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
            expect(brewFrames(transport)).toEqual([8100, 8102]);

            const cancelling = machine.cancelBrew();
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 4);
            await cancelling;
            await brewing;

            // The stop and the home frame, and nothing of the recipe after them.
            expect(brewFrames(transport)).toEqual([8100, 8102, 40519, 8022]);
        } finally {
            jest.useRealTimers();
        }
    });

    it("leaves a gap between the two frames of a cancel", async () => {
        // Unpaced they are exactly the burst that the brew sequence had to be
        // paced to survive -- and this is the pair whose job is to stop a
        // spinning burr.
        jest.useFakeTimers();
        try {
            const transport = new FakeTransport();
            const machine = new Machine(transport);
            const connecting = machine.connect("AA:BB");
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS + 10);
            await connecting;
            transport.written = [];

            const cancelling = machine.cancelBrew();
            await jest.advanceTimersByTimeAsync(0);
            expect(brewFrames(transport)).toEqual([40519]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
            expect(brewFrames(transport)).toEqual([40519, 8022]);
            await cancelling;
        } finally {
            jest.useRealTimers();
        }
    });

    it("leaves a gap between the mode switch and the brew that follows it", async () => {
        // The retry in PRO sends the mode frame and then went straight into the
        // brew's own opening handshake with no pause at all -- the one place
        // the whole sequence stopped being paced, and the first frame of a
        // sequence is the one that must not be lost.
        jest.useFakeTimers();
        try {
            const transport = new FakeTransport();
            const machine = new Machine(transport);
            const connecting = machine.connect("AA:BB");
            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS + 10);
            await connecting;
            transport.emit(status(0x01));
            transport.written = [];

            const retrying = machine.switchToProAndRetry(brewable());
            await jest.advanceTimersByTimeAsync(0);
            expect(brewFrames(transport)).toEqual([11511]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
            expect(brewFrames(transport)).toEqual([11511, 8100]);

            await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 4);
            await retrying;
        } finally {
            jest.useRealTimers();
        }
    });

    it("refuses a frame the negotiated link is too narrow to carry", async () => {
        // The Android case behind the swallowed MTU request. At the 23-byte
        // floor a recipe blob does not fit, and a write that is silently
        // truncated arrives as a brew that never starts and a machine that
        // says nothing. Better to fail where the reason is still legible.
        const {transport, machine} = await readyMachine();
        transport.frameBudget = 20;

        await expect(machine.brew(brewable())).rejects.toThrow(/too long|narrow|MTU/i);
    });

    it("does not log a frame as sent when the radio refused to carry it", async () => {
        // The log is the only account of what reached the machine. A line that
        // says a frame went out when the write threw turns the one instrument
        // we have into a source of false evidence.
        const {transport, machine} = await readyMachine();
        const sent: number[] = [];
        machine.onFrame((direction, _frame, decoded) => {
            if (direction === "sent") sent.push((decoded as {code?: number}).code ?? -1);
        });
        transport.failWriteOf = {code: 8022, reason: "radio busy"};

        await expect(machine.send(buildType1(8022))).rejects.toThrow("radio busy");
        expect(sent).toEqual([]);
    });

    it("refuses to send to a machine that has not said how it is doing", async () => {
        // "We never heard" is not "the tank is fine". The info frame is the
        // only report of the water level there is, so treating its absence as
        // permission is how a recipe gets committed to an empty machine.
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        transport.written = [];

        await expect(machine.brew(brewable())).rejects.toThrow(/has not said/i);
        // Asking again is fine — that is the app trying to answer the question
        // for itself. Sending the recipe anyway is not.
        // 8100 as well as 40521: a question can only be asked inside a session,
        // so opening one is part of asking rather than part of brewing.
        expect(transport.sent.filter((code) => code !== 40521 && code !== 8100)).toEqual([]);
    });

    it("ends the brew when the radio refuses a frame, instead of waiting for ever", async () => {
        // Leaving the phase at `sending` with no timer armed means nothing can
        // ever move it: the brew screen spins until the app is killed.
        const {transport, machine} = await readyMachine();
        const phases: string[] = [];
        machine.onPhase((phase) => phases.push(phase.name));
        transport.failWriteOf = {code: 8100, reason: "the radio is busy"};

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
        expect(brewFrames(transport)).toEqual([]);
    });

    it("sends the handshake, dose, cup range, recipe and commit, in that order", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        expect(brewFrames(transport)).toEqual([8100, 8102, 8104, 8001, 8002]);
    });

    it("uses the no-grind opcode for a recipe that does not grind", async () => {
        const {transport, machine} = await readyMachine();
        const recipe = brewable();
        recipe.grinder = false;
        await machine.brew(recipe);

        expect(brewFrames(transport)).toContain(8004);
        expect(brewFrames(transport)).not.toContain(8001);
    });

    it("uses the tea commands for a tea recipe", async () => {
        const {transport, machine} = await readyMachine();
        const tea = brewable([80]);
        tea.cupType = CUP_TYPE.TEA;
        tea.dosage = 5;
        tea.grinder = false;
        tea.pours[0].pauseTime = 60;
        await machine.brew(tea);

        expect(brewFrames(transport)).toEqual([8100, 8102, 4513, 4512]);
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
        transport.emit(Uint8ArrayPourEvent(1));

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
        expect(brewFrames(transport)).not.toContain(40518);
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

        expect(brewFrames(transport)).toEqual([40519, 8022]);
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

        expect(brewFrames(transport)).toEqual([8100, 8102, 8104, 8001, 8002]);
    });

    it("offers a mode switch only when a send goes nowhere on an EASY machine", async () => {
        jest.useFakeTimers();
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        // On the reply too: the brew asks again, and a machine still answering
        // with the default mode would overwrite this.
        transport.infoReply = machineInfoFrame({mode: "91327856"});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        transport.written = [];

        await machine.brew(brewable());
        // No 0x1D, no 0x1F: the machine simply never answered.
        jest.advanceTimersByTime(RECIPE_ACK_MS + 100);

        expect(machine.phase).toMatchObject({name: "failed", reason: "rejected"});
        expect(machine.canOfferProMode()).toBe(true);
        // Never switched behind the user's back.
        expect(brewFrames(transport)).not.toContain(11511);
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
        expect(brewFrames(transport)).toEqual([11511, 8100, 8102, 8104, 8001, 8002]);
    });
});

describe("waiting for the user to start the brew", () => {
    it("uploads the recipe but holds the commit back", async () => {
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);

        await machine.brew(brewable());

        // Everything but the one frame that sets a burr spinning.
        expect(brewFrames(transport)).toEqual([8100, 8102, 8104, 8001]);
        expect(machine.phase.name).toBe("readyToStart");
    });

    it("commits when the user says so", async () => {
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());
        transport.written = [];

        await machine.startBrew();

        expect(brewFrames(transport)).toEqual([8002]);
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
        expect(brewFrames(transport)).toEqual([8100, 8102, 4513]);

        transport.written = [];
        await machine.startBrew();
        expect(brewFrames(transport)).toEqual([4512]);
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

describe("the record of what the link did", () => {
    // The console's frame log is component state, filled from `onFrame` once
    // the screen is open. It therefore holds nothing about the thing hardest to
    // diagnose — a connection that never came up — because there is no screen
    // to log it and no frame to log. This history lives on the machine, so the
    // console can be opened afterwards and still say what happened.

    it("records a connection coming up", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});

        await machine.connect("AA:BB");

        expect(machine.linkHistory.map((e) => e.text).join(" ")).toMatch(/connected/i);
    });

    it("records a connection that was refused", async () => {
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(machine.connect("AA:BB")).rejects.toThrow();

        expect(machine.linkHistory.map((e) => e.text).join(" ")).toMatch(/refused|failed/i);
    });

    it("records the link dropping on its own", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        transport.drop();

        expect(machine.linkHistory.map((e) => e.text).join(" ")).toMatch(/dropped/i);
    });

    it("takes a note from outside, so the reconnect can explain itself", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});

        machine.note("app came to the front");

        expect(machine.linkHistory.map((e) => e.text)).toContain("app came to the front");
    });

    it("keeps the history bounded, since it lives as long as the app", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});

        for (let i = 0; i < 300; i++) machine.note(`note ${i}`);

        expect(machine.linkHistory.length).toBeLessThanOrEqual(200);
        expect(machine.linkHistory[machine.linkHistory.length - 1].text).toBe("note 299");
    });

    it("tells views about a note, so an open console repaints", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const saw = jest.fn();
        machine.onLink(saw);

        machine.note("something happened");

        expect(saw).toHaveBeenCalled();
    });
});

describe("getting the machine to say how it is doing", () => {
    // Reported from hardware: a reconnect that came up cleanly — the machine
    // beeped, showed its link icon, the app said connected — but no vitals,
    // and then a brew refused with "the machine has not said how it is doing
    // yet. Reconnect and try again." Connecting wrote the handshake and the
    // info request back to back, which is precisely the unpaced burst
    // `FRAME_GAP_MS` exists to prevent, so the question was simply lost.

    it("leaves a gap between the handshake and the question after it", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 60});

        const before = Date.now();
        await machine.connect("AA:BB");

        // Not the full 60: a `setTimeout` may fire a millisecond or two early,
        // and CI has caught it doing so. What is being tested is that a wait
        // happens at all, not that the platform timer is exact.
        expect(Date.now() - before).toBeGreaterThanOrEqual(30);
        expect(transport.sent).toEqual([8100, 40521]);
    });

    it("asks again when the machine does not answer the first time", async () => {
        const transport = new FakeTransport();
        transport.ignoreInfoRequests = 2;
        const machine = new Machine(transport, {frameGapMs: 0});

        await machine.connect("AA:BB");

        expect(machine.info).not.toBeNull();
    });

    it("gives up rather than asking for ever", async () => {
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});

        await machine.connect("AA:BB");

        expect(machine.info).toBeNull();
        expect(transport.sent.filter((code) => code === 40521).length)
            .toBeLessThanOrEqual(INFO_ATTEMPTS);
    });

    it("asks for the vitals itself instead of telling the user to reconnect", async () => {
        // The user cannot do anything with that instruction that the app could
        // not have done for them, and on hardware reconnecting did not help.
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        expect(machine.info).toBeNull();

        transport.infoReply = machineInfoFrame();
        await machine.brew(brewable());

        expect(machine.info).not.toBeNull();
        expect(brewFrames(transport)).toContain(8002);
    });

    it("still refuses when the machine will not say, rather than brewing blind", async () => {
        // "We never heard" is not "the tank is fine", and that difference is
        // water on the counter.
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");

        await expect(machine.brew(brewable())).rejects.toThrow(/has not said/i);
    });
});

describe("asking how the machine is doing now", () => {
    // Reported from hardware: connected with the tank low, refilled it, and the
    // brew still refused — the machine had stopped warning, the app had not.
    // The vitals were read once at connect and never again, so every later
    // decision was made against whatever happened to be true minutes ago.

    it("notices the tank was filled after the link came up", async () => {
        const transport = new FakeTransport();
        transport.infoReply = machineInfoFrame({waterEnough: 0});
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        // The brew screen draws a refusal amber with the plan untouched and a
        // mid-brew failure red with the trace frozen. Telling those apart by
        // matching on the text of a sentence would break the first time the
        // sentence was improved.
        expect(machine.brewBlock(brewable())).toEqual({
            kind: "notEnoughWater",
            message: "The machine's water tank is low."
        });

        transport.infoReply = machineInfoFrame({waterEnough: 1});
        await machine.brew(brewable());

        expect(brewFrames(transport)).toContain(8002);
    });

    it("names each kind of block", async () => {
        // One case per branch, so a reordering of the checks cannot silently
        // change which reason a user is given. The brew screen draws these
        // differently, so a block reported under the wrong name is a screen
        // offering the wrong way out.
        const disconnected = new Machine(new FakeTransport());
        expect(disconnected.brewBlock(brewable())?.kind).toBe("notConnected");

        const silent = new FakeTransport();
        silent.infoReply = null;
        const unheard = new Machine(silent, {frameGapMs: 0, infoWaitMs: 5});
        await unheard.connect("AA:BB");
        expect(unheard.brewBlock(brewable())?.kind).toBe("noVitals");

        const dry = new FakeTransport();
        dry.infoReply = machineInfoFrame({waterEnough: 0});
        const thirsty = new Machine(dry, {frameGapMs: 0});
        await thirsty.connect("AA:BB");
        dry.emit(status(0x01));
        expect(thirsty.brewBlock(brewable())?.kind).toBe("notEnoughWater");

        const {transport, machine} = await readyMachine();
        transport.emit(status(0x10)); // brewing
        expect(machine.brewBlock(brewable())?.kind).toBe("busy");

        transport.emit(status(0x01));
        expect(machine.brewBlock(brewable([]))?.kind).toBe("recipe");
    });

    it("notices the tank emptied after the link came up", async () => {
        // The same freshness in the direction that matters more. Trusting a
        // reading from twenty minutes ago is how a recipe gets committed to a
        // machine with nothing to brew it with.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));

        transport.infoReply = machineInfoFrame({waterEnough: 0});

        await expect(machine.brew(brewable())).rejects.toThrow(/water/i);
        expect(brewFrames(transport)).not.toContain(8002);
    });

    it("goes on the last thing it heard when the machine will not answer", async () => {
        // Not a reason to refuse on its own: the machine says nothing when it
        // is asked too soon after something else, and a brew that fails because
        // one question went unanswered is worse than one decided on a reading a
        // minute old.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));

        transport.infoReply = null;
        await machine.brew(brewable());

        expect(brewFrames(transport)).toContain(8002);
    });
});

describe("what the machine actually offers over the radio", () => {
    // The console showed the tank level and the info blob arriving zero times.
    // One explanation is that the machine never volunteers them. Another is
    // that it does, on a characteristic notifications were never enabled for —
    // we subscribe to exactly one, and would be deaf to any other by
    // construction. Nothing in the app could tell those two apart.

    it("writes the radio's own description of itself into the link history", async () => {
        const transport = new FakeTransport();
        transport.gatt = ["E0FF/FFE1 write,writeWithoutResponse", "E0FF/FFE2 notify"];
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        await machine.describeRadio();

        const text = machine.linkHistory.map((entry) => entry.text).join("\n");
        expect(text).toContain("E0FF/FFE2 notify");
        expect(text).toContain("E0FF/FFE1 write,writeWithoutResponse");
    });

    it("says so plainly when the radio cannot describe itself", async () => {
        // A transport that does not implement it, or a stack that refuses. The
        // console must not silently show nothing, which reads as "no services".
        const transport = new FakeTransport();
        transport.gatt = null;
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        await machine.describeRadio();

        const text = machine.linkHistory.map((entry) => entry.text).join("\n");
        expect(text).toMatch(/could not describe/i);
    });
});

describe("the handshake the machine wants before it will answer", () => {
    // Settled on hardware (2026-09-01, V12.0D.500). A 40521 sent six minutes
    // into a live link produced no reply at all; the identical frame is
    // answered at connect, where a handshake precedes it by one gap. Sending
    // 8100 first, then the same 40521, produced the answer. The session goes
    // stale, and asking without renewing it is asking into a void.

    it("renews the session before asking, on a link that has been sitting idle", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, handshakeFreshMs: 0});
        await machine.connect("AA:BB");
        transport.written = [];

        await machine.askHowItIsDoing();

        expect(transport.sent).toEqual([8100, 40521]);
    });

    it("does not renew a session that was renewed a moment ago", async () => {
        // The handshake makes the machine beep. Beeping every time anything
        // wants a reading would be its own bug — and connecting has just done
        // one, so the very next question does not need another.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, handshakeFreshMs: 60_000});
        await machine.connect("AA:BB");
        transport.written = [];

        await machine.askHowItIsDoing();

        expect(transport.sent).toEqual([40521]);
    });

    it("counts the brew's own handshake as a renewal", async () => {
        // `brewOnce` opens with 8100 for exactly this reason. A brew must not
        // make the machine beep twice.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, handshakeFreshMs: 60_000});
        await machine.connect("AA:BB");
        transport.emit(status(0x01));
        await machine.brew(brewable());
        transport.written = [];

        await machine.askHowItIsDoing();

        expect(transport.sent).toEqual([40521]);
    });
});

describe("which channels the link opened", () => {
    it("writes them into the link history at connect", async () => {
        // A channel that refused and a channel that is simply quiet look the
        // same from the app. The console has to be able to tell them apart,
        // because one is our bug and the other is a fact about the machine.
        const transport = new FakeTransport();
        transport.channels = ["ffe2 listening", "ffe3 refused — no"];
        const machine = new Machine(transport, {frameGapMs: 0});

        await machine.connect("AA:BB");

        const text = machine.linkHistory.map((entry) => entry.text).join("\n");
        expect(text).toContain("ffe2 listening");
        expect(text).toContain("ffe3 refused");
    });
});

describe("where a frame arrived from", () => {
    it("tells the log which channel each frame came in on", async () => {
        // `ffe3` notifies, and nothing has been seen on it. Whether that is
        // because the machine never uses it cannot be read off a log that does
        // not say which channel anything arrived on.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        const sources: (string | undefined)[] = [];
        machine.onFrame((direction, _frame, _parsed, source) => {
            if (direction === "received") sources.push(source);
        });

        transport.emit(status(0x01), "ffe3");

        expect(sources).toEqual(["ffe3"]);
    });
});

describe("the machine's pour index", () => {
    it("is zero-based, so index 0 is stage 1 of six", async () => {
        // From the captured trace in research/PROTOCOL.md: a six-pour recipe
        // reports pour_index 0,1,2,3,4,5 — not 1..6.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        const seen: number[] = [];
        machine.onPhase((phase) => {
            if (phase.name === "pouring") seen.push(phase.pour);
        });

        const recipe = sixPourRecipe();
        transport.emit(machineInfoFrame());
        transport.emit(status(0x01));
        await machine.brew(recipe);

        for (const index of [0, 1, 2, 3, 4, 5]) {
            transport.emit(Uint8ArrayPourEvent(index));
        }

        expect(seen.slice(-6)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("clamps an index past the end rather than reporting stage seven of six", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        const seen: number[] = [];
        machine.onPhase((phase) => {
            if (phase.name === "pouring") seen.push(phase.pour);
        });

        transport.emit(machineInfoFrame());
        transport.emit(status(0x01));
        await machine.brew(sixPourRecipe());

        transport.emit(Uint8ArrayPourEvent(9));

        expect(seen[seen.length - 1]).toBe(6);
    });
});
