import {COMMANDS, commandByCode, frameFor} from "@/library/machine/commands";

import {float32, type1, type1Bytes} from "./protocolFixtures";

function hex(frame: ArrayLike<number>): string {
    return Array.from(frame, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function commandNamed(name: string) {
    const command = COMMANDS.find((candidate) => candidate.name === name);
    if (command === undefined) throw new Error(`Missing command ${name}`);
    return command;
}

describe("the command catalogue", () => {
    it("knows the commands the brew path sends", () => {
        for (const code of [8100, 8022, 8102, 8002, 40519, 4512, 8500, 11511]) {
            expect(commandByCode(code)).toBeDefined();
        }
    });

    it("includes every documented app-to-machine command", () => {
        const documented = [
            "Session handshake",
            "Back to home",
            "Bypass and dose",
            "Commit",
            "Start / confirm / pause",
            "Cancel",
            "Coffee resume",
            "Brewer pause",
            "Brewer resume",
            "Brewer quit",
            "Recipe start quit",
            "Brewer enter",
            "Brewer start",
            "Brewer stop",
            "Brewer set pattern",
            "Brewer set temperature",
            "Grinder start",
            "Grinder stop",
            "Grinder enter",
            "Grinder quit",
            "Grinder pause",
            "Grinder resume",
            "Scale enter",
            "Scale exit",
            "Scale tare",
            "Weight unit",
            "Temperature unit",
            "Water source",
            "Display brightness",
            "Switch to PRO",
            "Switch to EASY",
            "Send recipe count",
            "Read pour radius",
            "Write pour radius",
            "Read vibration amplitude",
            "Write vibration amplitude",
            "Tea recipe execute",
            "Easy mode begin",
            "CurrentGrinder / back to normal"
        ];

        for (const name of documented) {
            expect(commandNamed(name)).toBeDefined();
        }
    });

    it("does not offer a recipe upload it has no recipe to put in", () => {
        // 8001, 8004 and 4513 carry a recipe blob, and there is no way to type
        // one into a console row. Offered with an empty payload they look like
        // a working recipe test and are not: a whole round of hardware
        // debugging was spent on one. The brew route sends these for real.
        for (const code of [8001, 8004, 4513]) {
            expect(commandByCode(code)).toBeUndefined();
        }
    });

    it("does not expose single-frame Easy slot writes as false controls", () => {
        expect(commandByCode(11510)).toBeUndefined();
        expect(commandByCode(11512)).toBeUndefined();
    });

    it("tiers the commands that move hardware above the inert ones", () => {
        expect(commandByCode(8100)?.tier).toBe("inert");
        expect(commandByCode(8500)?.tier).toBe("inert");
        expect(commandByCode(3500)?.tier).toBe("moves");
        expect(commandByCode(11511)?.tier).toBe("moves");
    });

    it("marks the commands whose meaning nobody agrees on", () => {
        // These are the ones the console must show the disagreement for, at
        // the point of sending, rather than a generic warning.
        expect(commandByCode(40518)?.tier).toBe("unresolved");
        expect(commandByCode(8104)?.tier).toBe("unresolved");
        expect(commandByCode(8005)?.tier).toBe("unresolved");
        expect(commandByCode(8010)?.tier).toBe("unresolved");
    });

    it("gives every unresolved command the actual contradiction to show", () => {
        for (const command of COMMANDS.filter((c) => c.tier === "unresolved")) {
            expect(command.contradiction).toBeTruthy();
        }
    });

    it("declares an encoded argument shape for every command", () => {
        for (const command of COMMANDS) {
            expect(Array.isArray(command.args)).toBe(true);
            for (const arg of command.args) {
                expect(arg).toEqual({
                    label: expect.any(String),
                    kind: expect.stringMatching(/^(int|float32)$/)
                });
            }
        }
    });

    it("encodes type 1 floatbits as IEEE-754 little-endian bytes", () => {
        const frame = frameFor(commandNamed("Bypass and dose"), [92, 930, 18]);
        const payload = [...float32(92), ...float32(930), ...type1(0, [18]).slice(10, 14)];

        expect(hex(frame)).toBe(hex(type1Bytes(8102, payload)));
        expect(Array.from(frame.slice(10, 14))).toEqual(float32(92));
        expect(Array.from(frame.slice(14, 18))).toEqual(float32(930));
        expect(Array.from(frame.slice(18, 22))).toEqual([0x12, 0x00, 0x00, 0x00]);
    });

    it("encodes fixed mode-switch payloads byte-for-byte", () => {
        expect(hex(frameFor(commandNamed("Switch to PRO"), [])))
            .toBe("580102F72C140000000130303030303030308EA9");
        expect(hex(frameFor(commandNamed("Switch to EASY"), [])))
            .toBe("580102F72C14000000013931333237383536C00A");
    });

    it("encodes newly catalogued type 1 commands with their documented arguments", () => {
        expect(hex(frameFor(commandNamed("Coffee resume"), [1])))
            .toBe("5801014C9E100000000101000000EDCC");
        expect(hex(frameFor(commandNamed("Brewer start"), [1, 2, 3, 4, 5])))
            .toBe(hex(type1Bytes(4506, [...float32(1), ...float32(2), ...float32(3), 4, 0, 0, 0, 5, 0, 0, 0])));
    });

    it("keeps mechanical calibration writes unresolved with their real warning", () => {
        expect(commandNamed("Write pour radius")).toMatchObject({
            tier: "unresolved",
            contradiction: expect.stringContaining("Mechanical calibration, single-source (HomoLand), range 400-1000 in steps of 80")
        });
        expect(commandNamed("Write vibration amplitude")).toMatchObject({
            tier: "unresolved",
            contradiction: expect.stringContaining("Mechanical calibration, single-source (HomoLand), range 1000-1500 in steps of 100")
        });
    });
});

describe("reading the machine's own state", () => {
    // The console could send thirty commands but not ask the one question the
    // brew gate depends on. Whether the machine volunteers its vitals or only
    // answers when asked cannot be investigated without a way to ask.
    it("offers the info request the brew path uses", () => {
        const command = COMMANDS.find((c) => c.code === 40521);
        expect(command).toBeDefined();
        expect(command?.tier).toBe("inert");
        expect(command?.args).toEqual([]);
    });

    it("builds the same frame the brew path builds", () => {
        const command = COMMANDS.find((c) => c.code === 40521)!;
        expect(Array.from(frameFor(command, []))).toEqual(type1(40521, []));
    });
});
