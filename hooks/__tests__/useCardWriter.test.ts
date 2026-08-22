import {act, renderHook} from "@testing-library/react-native";
import {Alert} from "react-native";

import {useCardWriter} from "@/hooks/useCardWriter";
import Recipe from "@/library/Recipe";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

// react-native-nfc-manager reaches for a NativeEventEmitter that does not
// exist under jest, and throws merely by being imported — so an automock
// (which still evaluates the real module to learn its shape) is not enough.
// None of these tests exercise the read path, so a plain stub suffices.
jest.mock("@/library/NFC", () => ({
    __esModule:     true,
    default:        jest.fn().mockImplementation(() => ({
        getIsClosed: jest.fn(() => true),
        close:       jest.fn(),
        readCard:    jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {notify} = require("@/components/XbrwToast");

function invalidRecipe(): Recipe {
    const r = new Recipe();
    // Pour volumes that do not add up to dosage x ratio. The machine rejects
    // this, which is why it must be reported before a card is touched.
    r.dosage = 18;
    r.ratio = 16;
    return r;
}

describe("useCardWriter", () => {
    beforeEach(() => (notify as jest.Mock).mockClear());

    it("does not use a native Alert for the volume mismatch", async () => {
        const alert = jest.spyOn(Alert, "alert");
        const {result} = await renderHook(() => useCardWriter());

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
    });

    it("reports the volume mismatch as a persistent state, not a toast", async () => {
        // A validation error you dismiss and then have to remember is the bug
        // this replaces. It belongs beside the save button until it is fixed.
        const {result} = await renderHook(() => useCardWriter());

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(result.current.volumeError).toBeTruthy();
        expect(notify).not.toHaveBeenCalled();
    });

    it("clears the mismatch once a valid recipe is written", async () => {
        const {result} = await renderHook(() => useCardWriter());
        await act(async () => result.current.writeCard(invalidRecipe()));

        const valid = invalidRecipe();
        jest.spyOn(valid, "isPourVolumeValid").mockReturnValue(true);
        jest.spyOn(valid, "writeCard").mockResolvedValue(undefined);

        await act(async () => result.current.writeCard(valid));

        expect(result.current.volumeError).toBeNull();
    });
});
