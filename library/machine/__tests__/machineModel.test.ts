import {
    ADAPTED_MODEL,
    adaptedModelFor,
    isMachineModel,
    MACHINE_MODELS,
    modelFromAdapted
} from "@/library/machine/machineModel";

describe("the machine model", () => {
    it("maps the Studio onto xBloom's partition 1", () => {
        expect(adaptedModelFor("studio")).toBe(1);
    });

    it("maps the original xBloom onto partition 2", () => {
        expect(adaptedModelFor("original")).toBe(2);
    });

    it("offers exactly the two models xBloom returns rows for", () => {
        // 0 and 3 come back empty from every endpoint. A third model here
        // would be a partition with nothing in it.
        expect([...MACHINE_MODELS]).toEqual(["studio", "original"]);
        expect(Object.values(ADAPTED_MODEL).sort()).toEqual([1, 2]);
    });

    it("reads a stored value back, and refuses one it did not write", () => {
        expect(isMachineModel("studio")).toBe(true);
        expect(isMachineModel("original")).toBe(true);
        expect(isMachineModel("j15")).toBe(false);
        expect(isMachineModel("")).toBe(false);
        expect(isMachineModel(undefined)).toBe(false);
    });

    it("turns a wire value back into a model", () => {
        expect(modelFromAdapted(1)).toBe("studio");
        expect(modelFromAdapted(2)).toBe("original");
    });

    it("treats an unknown wire value as the Studio", () => {
        // The default has to be the common machine: a wrong guess of Studio
        // is what every user got before this existed, and a wrong guess of
        // Original would be a regression for almost everybody.
        expect(modelFromAdapted(0)).toBe("studio");
        expect(modelFromAdapted(7)).toBe("studio");
    });
});
