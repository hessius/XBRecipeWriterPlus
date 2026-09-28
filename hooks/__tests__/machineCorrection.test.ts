import {applyMachineReading} from "@/hooks/useMachine";
import {DEFAULTS} from "@/library/Settings";

// `STUDIO_MODEL_STRINGS` ships empty on purpose: nobody has read a model string
// off a real Studio yet, and an empty list matches nothing, so the correction is
// inert. That leaves its one interesting branch unexercised in the tests that
// use the real constant. This file stands a known string up in place of the
// empty list so the rule itself is pinned today, rather than becoming testable
// only once Task 11 has hardware in its hands.
jest.mock("@/constants/machine", () => ({
    ...jest.requireActual("@/constants/machine"),
    STUDIO_MODEL_STRINGS: ["XB-STUDIO-1"]
}));

// `library/machine/Transport` (imported transitively by the hook) builds a
// BleManager singleton at module load, which throws under Jest. Nothing here
// touches the radio, so a bare stand-in is all the import needs.
jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));

// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest.
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

function store() {
    const {sharedSettings} = require("@/hooks/useSetting");
    const settings = sharedSettings();
    for (const key of ["machineModel", "machineModelString", "machineName"] as const) {
        settings.set(key, DEFAULTS[key]);
    }
    return settings;
}

describe("believing the machine over the user", () => {
    it("corrects the setting when the model string is a known Studio", () => {
        const settings = store();
        settings.set("machineModel", "original");

        expect(applyMachineReading(settings, {model: "XB-STUDIO-1", name: ""})).toBe(true);

        expect(settings.get("machineModel")).toBe("studio");
    });

    it("does not report a correction it did not have to make", () => {
        // Every connect passes through here, and the console line exists to be
        // worth reading. Saying "corrected" on each one would make it noise.
        const settings = store();

        expect(applyMachineReading(settings, {model: "XB-STUDIO-1", name: ""})).toBe(false);

        expect(settings.get("machineModel")).toBe("studio");
    });

    it("leaves the setting alone for a model string it has never seen", () => {
        const settings = store();
        settings.set("machineModel", "original");

        // An unfamiliar string is not evidence of an original xBloom. It is
        // just as likely to be a firmware revision of the Studio.
        applyMachineReading(settings, {model: "XB-STUDIO-2", name: ""});

        expect(settings.get("machineModel")).toBe("original");
        expect(settings.get("machineModelString")).toBe("XB-STUDIO-2");
    });

    it("never corrects on a machine that said nothing", () => {
        const settings = store();
        settings.set("machineModel", "original");

        applyMachineReading(settings, {model: "", name: ""});

        expect(settings.get("machineModel")).toBe("original");
    });
});
