import {COMMANDS, commandByCode} from "@/library/machine/commands";

describe("the command catalogue", () => {
    it("knows the commands the brew path sends", () => {
        for (const code of [8100, 8022, 8102, 8001, 8004, 8002, 40519, 4512, 4513, 8500, 11511]) {
            expect(commandByCode(code)).toBeDefined();
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
});
