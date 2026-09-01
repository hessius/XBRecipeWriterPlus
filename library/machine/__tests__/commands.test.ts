import {COMMANDS, commandByCode, frameFor} from "@/library/machine/commands";

function hex(frame: Uint8Array): string {
    return Array.from(frame, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function commandNamed(name: string) {
    const command = COMMANDS.find((candidate) => candidate.name === name);
    if (command === undefined) throw new Error(`Missing command ${name}`);
    return command;
}

describe("the command catalogue", () => {
    it("knows the commands the brew path sends", () => {
        for (const code of [8100, 8022, 8102, 8001, 8004, 8002, 40519, 4512, 4513, 8500, 11511]) {
            expect(commandByCode(code)).toBeDefined();
        }
    });

    it("includes every documented app-to-machine command", () => {
        const documented = [
            "Session handshake",
            "Back to home",
            "Bypass and dose",
            "Recipe send (grind)",
            "Recipe send (no grind)",
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
            "Easy recipe send",
            "Switch to PRO",
            "Switch to EASY",
            "Recipe order",
            "Send recipe count",
            "Read pour radius",
            "Write pour radius",
            "Read vibration amplitude",
            "Write vibration amplitude",
            "Tea recipe execute",
            "Tea recipe upload",
            "Easy mode begin",
            "CurrentGrinder / back to normal"
        ];

        for (const name of documented) {
            expect(commandNamed(name)).toBeDefined();
        }
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

    it("declares an argument shape for every command", () => {
        for (const command of COMMANDS) {
            expect(Array.isArray(command.args)).toBe(true);
        }
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
            .toBe("5801019A1120000000010100000002000000030000000400000005000000E3E3");
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
