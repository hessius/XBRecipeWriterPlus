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

export type PacketType = "type1" | "type1Bytes" | "type2";

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
    /** One label per integer argument. Empty for a command that takes none. */
    args: string[];
    tier: Tier;
    note?: string;
    /** Required when `tier` is `unresolved`. Shown at the point of sending. */
    contradiction?: string;
};

export const COMMANDS: Command[] = [
    // — Session ————————————————————————————————————————————————————
    {code: 8100, name: "Session handshake", packet: "type1", args: ["185", "1"], tier: "inert",
     note: "Must arrive within about 200 ms of connecting. Until it does, the machine ignores everything else."},
    {code: 8022, name: "Back to home", packet: "type1", args: [], tier: "inert"},
    {code: 8500, name: "Scale tare", packet: "type1", args: [], tier: "inert",
     note: "Zeroes the scale instantly. Confirmed on hardware."},
    {code: 8003, name: "Scale enter", packet: "type1", args: [], tier: "inert"},
    {code: 8014, name: "Scale exit", packet: "type1", args: [], tier: "inert"},

    // — Brewing a recipe ———————————————————————————————————————————
    {code: 8102, name: "Bypass and dose", packet: "type1", args: ["bypass volume", "bypass temp x10", "dose g"], tier: "inert",
     note: "Carries the dose even with bypass off. Skipping it makes the grind drift."},
    {code: 8001, name: "Recipe send (grind)", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 8004, name: "Recipe send (no grind)", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 8002, name: "Commit", packet: "type1", args: [], tier: "moves",
     note: "Arms the machine. It then either proceeds by itself or parks waiting for the button."},
    {code: 40519, name: "Cancel", packet: "type1", args: ["1"], tier: "moves"},
    {code: 4513, name: "Tea recipe upload", packet: "type1Bytes", args: [], tier: "moves"},
    {code: 4512, name: "Tea recipe execute", packet: "type1", args: [], tier: "moves"},

    // — Grinder and brewer, standalone —————————————————————————————
    {code: 3500, name: "Grinder start", packet: "type1", args: ["1000", "grind size", "speed"], tier: "moves",
     note: "The leading 1000 is a constant from the official app's grinder screen."},
    {code: 3505, name: "Grinder stop", packet: "type1", args: [], tier: "moves"},
    {code: 8006, name: "Grinder enter", packet: "type1", args: ["grind size", "speed"], tier: "inert"},
    {code: 8012, name: "Grinder quit", packet: "type1", args: [], tier: "inert"},
    {code: 4507, name: "Brewer stop", packet: "type1", args: [], tier: "moves"},
    {code: 8019, name: "Brewer pause", packet: "type1", args: [], tier: "moves"},
    {code: 8021, name: "Brewer resume", packet: "type1", args: [], tier: "moves"},
    {code: 8013, name: "Brewer quit", packet: "type1", args: [], tier: "moves"},

    // — Machine settings ———————————————————————————————————————————
    {code: 11511, name: "Mode switch", packet: "type2", args: [], tier: "moves",
     note: "Payload is the text 00000000 for PRO or 91327856 for EASY. Byte-exact, confirmed on hardware."},
    {code: 8103, name: "Display brightness", packet: "type1", args: ["1, 8 or 15"], tier: "moves"},
    {code: 4508, name: "Water source", packet: "type1", args: ["0 tank, 1 tap"], tier: "moves"},

    // — Unresolved —————————————————————————————————————————————————
    {code: 40518, name: "Start / confirm / pause", packet: "type1", args: ["1"], tier: "unresolved",
     contradiction:
        "saya6k tried this live on 2026-07-19 and watched it bounce the state backwards to recipe_loaded " +
        "rather than start the brew. Janczykkkko verified that sending it into a running brew aborts that brew. " +
        "HomoLand names the same code COFFEE_PAUSE. XBRW++ never sends this during a brew."},
    {code: 8104, name: "Set cup", packet: "type1", args: ["max x10", "min x10"], tier: "unresolved",
     contradiction:
        "Three implementations send three materially different value sets — (200, 80), (110, 90), (80-90, 40) — " +
        "the machine reportedly brews correctly regardless, and nobody knows what the field means. " +
        "XBRW++ omits it."},
    {code: 8005, name: "Weight unit", packet: "type1", args: ["unit"], tier: "unresolved",
     contradiction:
        "brAzzi64 reads the values as 0 g, 1 oz, 2 ml. HomoLand reads them as 0 ml, 1 g, 2 oz. " +
        "These cannot both be right and no one has checked against a machine."},
    {code: 8010, name: "Temperature unit", packet: "type1", args: ["unit"], tier: "unresolved",
     contradiction:
        "brAzzi64 reads the values as 0 Celsius, 1 Fahrenheit. HomoLand reads them the other way round. " +
        "Unverified either way."},
    {code: 11507, name: "Write pour radius", packet: "type2", args: [], tier: "unresolved",
     contradiction:
        "Mechanical calibration, single-source (HomoLand), range 400-1000 in steps of 80. " +
        "Nobody has confirmed what a wrong value does to the arm."},
    {code: 11509, name: "Write vibration amplitude", packet: "type2", args: [], tier: "unresolved",
     contradiction:
        "Mechanical calibration, single-source (HomoLand), range 1000-1500 in steps of 100. Unverified."}
];

const BY_CODE = new Map(COMMANDS.map((command) => [command.code, command]));

export function commandByCode(code: number): Command | undefined {
    return BY_CODE.get(code);
}
