/**
 * Every command the machine is known to take.
 *
 * A catalogue, not a whitelist: the console offers all of it, because the
 * protocol varies between firmware revisions and a user whose brew will not
 * start can otherwise report only that it did not start.
 *
 * Provenance and tier are part of the data because the console shows them. The
 * `unresolved` tier carries the actual disagreement, not a generic warning —
 * somebody about to fire an ambiguous command should be reading the ambiguity.
 *
 * Source: `docs/machine-integration/ble-protocol.md`.
 */

import {ascii, buildType1Bytes, buildType2} from "@/library/machine/protocol";

export type PacketType = "type1" | "type1Bytes" | "type2";
export type ArgumentKind = "int" | "float32";
export type CommandArgument = {label: string; kind: ArgumentKind};

/**
 * How dangerous a command is, which is a different axis from how well
 * understood it is.
 */
export type Tier =
    /** Reads and navigation. Send freely. */
    | "inert"
    /** Starts a motor, a heater, or rewrites the machine's own settings. */
    | "moves"
    /** Nobody agrees what it does. Confirm, with the disagreement shown. */
    | "unresolved";

export type Command = {
    code: number;
    name: string;
    packet: PacketType;
    /** One descriptor per argument. Empty for a command that takes none. */
    args: CommandArgument[];
    tier: Tier;
    /** Fixed raw payload for commands whose documented payload is not numeric. */
    payload?: Uint8Array;
    note?: string;
    /** Required when `tier` is `unresolved`. Shown at the point of sending. */
    contradiction?: string;
};

const int = (label: string): CommandArgument => ({label, kind: "int"});
const float32 = (label: string): CommandArgument => ({label, kind: "float32"});

function encodeArguments(args: CommandArgument[], values: number[]): Uint8Array {
    const out = new Uint8Array(args.length * 4);
    args.forEach((arg, index) => {
        const view = new DataView(out.buffer, index * 4, 4);
        if (arg.kind === "float32") {
            view.setFloat32(0, values[index] ?? 0, true);
        } else {
            view.setUint32(0, values[index] ?? 0, true);
        }
    });
    return out;
}

export function frameFor(command: Command, values: number[]): Uint8Array {
    const payload = command.payload ?? encodeArguments(command.args, values);
    switch (command.packet) {
        case "type1":      return buildType1Bytes(command.code, payload);
        case "type1Bytes": return buildType1Bytes(command.code, payload);
        case "type2":      return buildType2(command.code, payload);
    }
}

export const COMMANDS: Command[] = [
    // — Session ————————————————————————————————————————————————————
    {code: 8100, name: "Session handshake", packet: "type1", args: [int("185"), int("1")], tier: "inert",
     note: "Must arrive within about 200 ms of connecting. Until it does, the machine ignores everything else."},
    {code: 8022, name: "Back to home", packet: "type1", args: [], tier: "inert"},
    {code: 8500, name: "Scale tare", packet: "type1", args: [], tier: "inert",
     note: "Zeroes the scale instantly. Confirmed on hardware."},
    {code: 8003, name: "Scale enter", packet: "type1", args: [], tier: "inert"},
    {code: 8014, name: "Scale exit", packet: "type1", args: [], tier: "inert"},

    // — Brewing a recipe ———————————————————————————————————————————
    {code: 8102, name: "Bypass and dose", packet: "type1",
     args: [float32("bypass volume"), float32("bypass temp x10"), int("dose g")], tier: "inert",
     note: "Carries the dose even with bypass off. Skipping it makes the grind drift."},
    {code: 8001, name: "Recipe send (grind)", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 8004, name: "Recipe send (no grind)", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 8002, name: "Commit", packet: "type1", args: [], tier: "moves",
     note: "Arms the machine. It then either proceeds by itself or parks waiting for the button."},
    {code: 40519, name: "Cancel", packet: "type1", args: [int("1")], tier: "moves"},
    {code: 40524, name: "Coffee resume", packet: "type1", args: [int("1")], tier: "moves",
     note: "Resume after a pause. Single-source from HomoLand."},
    {code: 4513, name: "Tea recipe upload", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 4512, name: "Tea recipe execute", packet: "type1", args: [], tier: "moves"},

    // — Grinder and brewer, standalone —————————————————————————————
    {code: 3500, name: "Grinder start", packet: "type1", args: [int("1000"), int("grind size"), int("speed")], tier: "moves",
     note: "The leading 1000 is a constant from the official app's grinder screen."},
    {code: 3505, name: "Grinder stop", packet: "type1", args: [], tier: "moves"},
    {code: 8006, name: "Grinder enter", packet: "type1", args: [int("grind size"), int("speed")], tier: "inert"},
    {code: 8012, name: "Grinder quit", packet: "type1", args: [], tier: "inert"},
    {code: 8018, name: "Grinder pause", packet: "type1", args: [], tier: "moves"},
    {code: 8020, name: "Grinder resume", packet: "type1", args: [], tier: "moves"},
    {code: 8007, name: "Brewer enter", packet: "type1", args: [int("pattern byte"), float32("temp x10")], tier: "inert",
     note: "Navigate to the FreeSolo brewer screen."},
    {code: 4506, name: "Brewer start", packet: "type1",
     args: [float32("flow x10"), float32("volume x10"), float32("temp x10"), int("water feed"), int("pattern")],
     tier: "moves", note: "FreeSolo water dispense."},
    {code: 4507, name: "Brewer stop", packet: "type1", args: [], tier: "moves"},
    {code: 8019, name: "Brewer pause", packet: "type1", args: [], tier: "moves"},
    {code: 8021, name: "Brewer resume", packet: "type1", args: [], tier: "moves"},
    {code: 8013, name: "Brewer quit", packet: "type1", args: [], tier: "moves"},
    {code: 8017, name: "Recipe start quit", packet: "type1", args: [], tier: "inert",
     note: "Exit the pre-start recipe screen."},
    {code: 8016, name: "Brewer set pattern", packet: "type1", args: [int("pattern byte")], tier: "moves",
     note: "Change the pattern during a brew."},
    {code: 4510, name: "Brewer set temperature", packet: "type1", args: [int("temp C x10")], tier: "moves",
     note: "Change the temperature during a pour; plain integer x10, not float bits."},

    // — Machine settings ———————————————————————————————————————————
    // The console's argument fields are numeric. These payloads are not; they
    // are two byte-exact hardware tokens, so the honest UI is two zero-arg rows.
    {code: 11511, name: "Switch to PRO", packet: "type2", args: [], tier: "moves",
     payload: ascii("00000000"), note: "Byte-exact, confirmed on hardware."},
    {code: 11511, name: "Switch to EASY", packet: "type2", args: [], tier: "moves",
     payload: ascii("91327856"), note: "Byte-exact, confirmed on hardware."},
    {code: 40525, name: "Send recipe count", packet: "type1", args: [int("count")], tier: "moves",
     note: "Sends the count of recipes being synced."},
    {code: 11506, name: "Read pour radius", packet: "type2", args: [], tier: "inert",
     note: "Read current mechanical pour radius. Response format is not documented."},
    {code: 11508, name: "Read vibration amplitude", packet: "type2", args: [], tier: "inert",
     note: "Read current vibration amplitude setting. Response format is not documented."},
    {code: 8103, name: "Display brightness", packet: "type1", args: [int("1, 8 or 15")], tier: "moves"},
    {code: 4508, name: "Water source", packet: "type1", args: [int("0 tank, 1 tap")], tier: "moves"},
    {code: 8111, name: "Easy mode begin", packet: "type1", args: [], tier: "inert",
     note: "Initiate Auto Mode recipe display."},
    {code: 40526, name: "CurrentGrinder / back to normal", packet: "type1", args: [], tier: "inert",
     note: "Return from grinder to normal state."},

    // — Unresolved —————————————————————————————————————————————————
    {code: 40518, name: "Start / confirm / pause", packet: "type1", args: [int("1")], tier: "unresolved",
     contradiction:
        "saya6k tried this live on 2026-07-19 and watched it bounce the state backwards to recipe_loaded " +
        "rather than start the brew. Janczykkkko verified that sending it into a running brew aborts that brew. " +
        "HomoLand names the same code COFFEE_PAUSE. XBRW++ never sends this during a brew."},
    {code: 8104, name: "Set cup", packet: "type1", args: [float32("max"), float32("min")], tier: "unresolved",
     contradiction:
        "Three implementations send three materially different value sets — (200, 80), (110, 90), (80-90, 40) — " +
        "the machine reportedly brews correctly regardless, and nobody knows what the field means. " +
        "XBRW++ omits it."},
    {code: 8005, name: "Weight unit", packet: "type1", args: [int("unit")], tier: "unresolved",
     contradiction:
        "brAzzi64 reads the values as 0 g, 1 oz, 2 ml. HomoLand reads them as 0 ml, 1 g, 2 oz. " +
        "These cannot both be right and no one has checked against a machine."},
    {code: 8010, name: "Temperature unit", packet: "type1", args: [int("unit")], tier: "unresolved",
     contradiction:
        "brAzzi64 reads the values as 0 Celsius, 1 Fahrenheit. HomoLand reads them the other way round. " +
        "Unverified either way."},
    {code: 11507, name: "Write pour radius", packet: "type2", args: [int("value")], tier: "unresolved",
     contradiction:
        "Mechanical calibration, single-source (HomoLand), range 400-1000 in steps of 80. " +
        "Nobody has confirmed what a wrong value does to the arm."},
    {code: 11509, name: "Write vibration amplitude", packet: "type2", args: [int("value")], tier: "unresolved",
     contradiction:
        "Mechanical calibration, single-source (HomoLand), range 1000-1500 in steps of 100. Unverified."}
];

const BY_CODE = new Map(COMMANDS.map((command) => [command.code, command]));

export function commandByCode(code: number): Command | undefined {
    return BY_CODE.get(code);
}
