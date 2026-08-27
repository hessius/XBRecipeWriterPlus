import {act, renderHook} from "@testing-library/react-native";
import {Alert, Platform} from "react-native";

import {useCardWriter} from "@/hooks/useCardWriter";
import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import type NFC from "@/library/NFC";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

jest.mock("@/library/RecipeDatabase");

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {setNfcAlertIOS} = require("@/library/NFC");

function invalidRecipe(): Recipe {
    const r = new Recipe();
    // Pour volumes that do not add up to dosage x ratio. The machine rejects
    // this, which is why it must be reported before a card is touched.
    r.dosage = 18;
    r.ratio = 16;
    return r;
}

function validRecipe(): Recipe {
    const r = new Recipe();
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 15;
    r.ratio = 15;
    r.grinder = false;
    r.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return r;
}

describe("useCardWriter", () => {
    beforeEach(() => {
        (notify as jest.Mock).mockClear();
        (setNfcAlertIOS as jest.Mock).mockClear();
    });

    it("does not use a native Alert for the volume mismatch", async () => {
        const alert = jest.spyOn(Alert, "alert");
        const onVolumeError = jest.fn();
        const {result} = await renderHook(() => useCardWriter(onVolumeError));

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
    });

    it("reports the volume mismatch through the callback, not a toast", async () => {
        // A validation error you dismiss and then have to remember is the bug
        // this replaces. It belongs beside the save button until it is fixed,
        // which is why the hook reports into a caller-owned setter rather
        // than a toast or a local state atom of its own.
        const onVolumeError = jest.fn();
        const {result} = await renderHook(() => useCardWriter(onVolumeError));

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(onVolumeError).toHaveBeenCalledWith(
            "The recipe cannot be written to the card. Check that all values are within range."
        );
        expect(notify).not.toHaveBeenCalled();
    });

    it("clears the mismatch via the callback once a valid recipe is written", async () => {
        const onVolumeError = jest.fn();
        const {result} = await renderHook(() => useCardWriter(onVolumeError));
        await act(async () => result.current.writeCard(invalidRecipe()));

        const valid = validRecipe();
        jest.spyOn(valid, "writeCard").mockResolvedValue(undefined);

        await act(async () => result.current.writeCard(valid));

        expect(onVolumeError).toHaveBeenLastCalledWith(null);
    });

    // Regression test: the pour-volume mismatch used to live in two separate
    // state atoms — one in useCardWriter, one in useRecipeEditor — and
    // neither hook could clear the other's copy. A user could tap "write
    // card" on an invalid recipe (setting the writer's copy), then tap AUTO
    // to fix the pours (clearing only the editor's copy), and the message
    // would stay on screen claiming the volumes did not add up, though they
    // now did. Wiring useCardWriter to report into useRecipeEditor's own
    // setter means there is exactly one atom, so the editor's own clear path
    // reliably empties the same value the write path set.
    it("lets the editor's AUTO fix clear an error set by a failed write", async () => {
        const invalidJSON = JSON.stringify(invalidRecipe());

        const {result} = await renderHook(() => {
            const editor = useRecipeEditor({
                recipeJSON:           invalidJSON,
                temperatureUnit:      "C",
                onSaved:              jest.fn()
            });
            const writer = useCardWriter(editor.setVolumeError);
            return {editor, writer};
        });

        // Simulate the user tapping "write card" on the invalid recipe.
        await act(async () => result.current.writer.writeCard(result.current.editor.getRecipe()));
        expect(result.current.editor.volumeError).toBeTruthy();

        // Simulate the user then tapping AUTO, which genuinely fixes the
        // recipe's pour volumes.
        await act(async () => result.current.editor.autoAdjustPourVolumes());

        // The very same atom the screen renders must now be empty — not
        // still holding the writer's stale message.
        expect(result.current.editor.volumeError).toBeNull();
    });

    it("advances the bloom on iOS too, not only on Android", async () => {
        // The overlay reaches iOS for the first time in this sub-project. Its
        // progress used to be set in the `else` of a platform check, so on iOS
        // the bloom sat at zero for the whole write while the only moving part
        // was Apple's own spinner.
        Platform.OS = "ios";
        const {result} = await renderHook(() => useCardWriter(jest.fn()));

        const valid = validRecipe();
        jest.spyOn(valid, "writeCard").mockImplementation(
            async (_nfc: NFC, progress: (progress: number, id?: string) => Promise<string | undefined>) => {
                await progress(60);
            }
        );

        await act(async () => result.current.writeCard(valid));

        expect(result.current.writeProgress).toBe(60);
        Platform.OS = "android";
    });

    it("gives the iOS sheet the placement copy, not a percentage", async () => {
        // That one line is the only part of the system sheet we control, and
        // it sits where the user is already looking. A percentage there
        // duplicates Apple's own spinner, while the placement teaching now
        // exists nowhere else on iOS: our half no longer repeats it.
        Platform.OS = "ios";
        const {result} = await renderHook(() => useCardWriter(jest.fn()));

        const valid = validRecipe();
        jest.spyOn(valid, "writeCard").mockImplementation(
            async (_nfc: NFC, progress: (progress: number, id?: string) => Promise<string | undefined>) => {
                await progress(60);
            }
        );

        await act(async () => result.current.writeCard(valid));

        expect(setNfcAlertIOS).toHaveBeenCalledWith(
            expect.stringMatching(/hold the card to the top of the phone/i)
        );
        expect(setNfcAlertIOS).not.toHaveBeenCalledWith(expect.stringContaining("%"));
        Platform.OS = "android";
    });
});

describe("the transport it writes through", () => {
    it("is the same one across renders, so Cancel closes what is writing", async () => {
        // Showing the overlay is a state change, so by the time the user can
        // press Cancel the handler they press belongs to a later render. Built
        // per render, that handler closed an `NFC` nobody was writing to: the
        // ceremony vanished and the native session carried on.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NFC = require("@/library/NFC").default;
        NFC.mockClear();

        const {result, rerender} = await renderHook(() => useCardWriter(jest.fn()));
        await rerender(undefined);
        await rerender(undefined);

        expect(NFC).toHaveBeenCalledTimes(1);
        expect(result.current.showNfcOverlay).toBe(false);
    });
});
