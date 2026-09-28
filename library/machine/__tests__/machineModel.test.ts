import {
    ADAPTED_MODEL,
    adaptedModelFor,
    asMachineModel,
    isMachineModel,
    MACHINE_MODELS
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
        expect(Object.values(ADAPTED_MODEL).sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it("reads a stored value back, and refuses one it did not write", () => {        expect(isMachineModel("studio")).toBe(true);
        expect(isMachineModel("original")).toBe(true);
        expect(isMachineModel("j15")).toBe(false);
        expect(isMachineModel("")).toBe(false);
        expect(isMachineModel(undefined)).toBe(false);
    });

    it("coerces a value it does not recognise to the Studio", () => {
        // A stored setting comes back widened to `string`, so a stale or
        // hand-edited row can hold anything. A reader wants an answer, not a
        // refusal, and Studio is the documented default.
        expect(asMachineModel("original")).toBe("original");
        expect(asMachineModel("studio")).toBe("studio");
        expect(asMachineModel("toaster")).toBe("studio");
        expect(asMachineModel("")).toBe("studio");
        expect(asMachineModel(undefined)).toBe("studio");
        expect(asMachineModel(2)).toBe("studio");
    });

    it("gives every model a distinct wire value", () => {
        // The Record forces an entry per model, but not a *different* one. Two
        // models sharing a partition would read as one machine to every endpoint.
        const values = MACHINE_MODELS.map(adaptedModelFor);
        expect(new Set(values).size).toBe(MACHINE_MODELS.length);
    });
});
