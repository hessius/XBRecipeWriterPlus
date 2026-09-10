import Machine from "@/library/machine/Machine";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {EVENT, MACHINE_STATE} from "@/library/machine/protocol";

import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {event, notification, status} from "./protocolFixtures";

/** A machine that is connected, idle and has water, its writes cleared. */
async function readyMachine() {
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0});
    await machine.connect("AA:BB");
    transport.emit(machineInfoFrame());
    transport.emit(status(0x01));
    transport.written = [];
    return {transport, machine};
}

function coffeeRecipe(): Recipe {
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

function teaRecipe(): Recipe {
    const recipe = coffeeRecipe();
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 18;
    recipe.pours = [new Pour(
        1, 90, 90, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 0
    )];
    return recipe;
}

/**
 * Decode the 8102 frame's three arguments back off the wire: two float32
 * little-endian (bypass volume, bypass temperature) and an integer dose.
 * Written from the frame layout rather than the encoder, so agreement means
 * something.
 */
function argsOf(written: Uint8Array[], code: number): [number, number, number] {
    const frame = written.find((f) => (f[3] | (f[4] << 8)) === code);
    if (frame === undefined) throw new Error(`no frame for command ${code}`);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const payloadStart = 10;
    return [
        view.getFloat32(payloadStart, true),
        view.getFloat32(payloadStart + 4, true),
        view.getUint32(payloadStart + 8, true)
    ];
}

describe("Machine bypass", () => {
    it("still sends zeros with bypass off, and the dose regardless", async () => {
        const {machine, transport} = await readyMachine();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;

        await machine.brew(recipe);

        expect(argsOf(transport.written, 8102)).toEqual([0, 0, 18]);
    });

    it("sends the real bypass values when bypass is on", async () => {
        const {machine, transport} = await readyMachine();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        await machine.brew(recipe);

        // 600, not 60: the default reading is the scaled one.
        expect(argsOf(transport.written, 8102)).toEqual([45, 600, 18]);
    });

    it("honours the plain reading when it is selected", async () => {
        const {machine, transport} = await readyMachine();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;
        machine.setBypassTempEncoding("plain");

        await machine.brew(recipe);

        expect(argsOf(transport.written, 8102)).toEqual([45, 60, 18]);
    });

    it("sends no bypass for tea", async () => {
        const {machine, transport} = await readyMachine();
        const recipe = teaRecipe();
        recipe.dosage = 5;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;

        await machine.brew(recipe);

        expect(argsOf(transport.written, 8102)).toEqual([0, 0, 5]);
    });
});

describe("Machine bypass phase", () => {
    it("enters the bypass phase on 40520, without clamping into the last pour", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(coffeeRecipe());
        transport.emit(status(0x22));                                                        // starting
        transport.emit(event(EVENT.GRINDER_STOP));                                           // grinding -> pouring
        transport.emit(notification(EVENT.POUR_START & 0xFF, EVENT.POUR_START >> 8, [2]));  // pour index 2 (zero-based)
        transport.emit(event(EVENT.RD_BYPASS));                                              // bypass

        expect(machine.phase).toEqual({name: "bypass"});
    });

    it("does not end a brew on a no-water state while the bypass is running", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(coffeeRecipe());
        transport.emit(status(0x22));
        transport.emit(event(EVENT.GRINDER_STOP));
        transport.emit(event(EVENT.RD_BYPASS));

        transport.emit(status(MACHINE_STATE.NO_WATER));

        expect(machine.phase).toEqual({name: "bypass"});
    });
});
