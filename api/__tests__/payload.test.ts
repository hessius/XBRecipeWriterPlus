import {validateSharePayload} from "../_lib/payload";

function valid() {
    return {
        theName:             "Ethiopia Guji",
        theColor:            "#C9D5B8",
        dose:                18,
        grandWater:          16,
        grinderSize:         55,
        isSetGrinderSize:    1,
        rpm:                 90,
        cupType:             2,
        bypassTemp:          85,
        bypassVolume:        0,
        subSetType:          2,
        theSubsetId:         0,
        appPlace:            [4],
        isShortcuts:         2,
        isEnableBypassWater: 2,
        adaptedModel:        1,
        pourCount:           2,
        pourDataJSONStr:     JSON.stringify([
            {theName: "Bloom", volume: 50, temperature: 93, flowRate: 3.5,
             pattern: 1, pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2},
            {theName: "Pour 2", volume: 238, temperature: 92, flowRate: 3,
             pattern: 2, pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 1}
        ])
    };
}

describe("validateSharePayload", () => {
    it("accepts a well-formed payload", () => {
        expect(validateSharePayload(valid())).toBeNull();
    });

    // Three shapes the app can legitimately produce that an earlier, tighter
    // set of ranges refused. Each one failed with a 400, which the app renders
    // as "check the pour volumes and dose" -- sending the user to look at the
    // one thing that was not wrong, with no way to fix it.
    it("accepts a three-steep tea, whose ratio is 54", () => {
        expect(validateSharePayload({...valid(), dose: 5, grandWater: 54, cupType: 4,
                                     isSetGrinderSize: 2, grinderSize: 50})).toBeNull();
    });

    it("accepts the grinder-off sentinel", () => {
        // 81 is what a card with the grinder disabled carries, and the importer
        // reads it back as "grinder disabled". It is a value, not an overflow.
        expect(validateSharePayload({...valid(), grinderSize: 81,
                                     isSetGrinderSize: 2})).toBeNull();
    });

    it("accepts the most pours a card can hold", () => {
        // 31, because the card writes the count as `length << 3` in one byte.
        const pours = Array.from({length: 31}, (_, i) => ({
            theName: i === 0 ? "Bloom" : `Pour ${i + 1}`, volume: 10, temperature: 93,
            flowRate: 3.5, pattern: 1, pausing: 0,
            isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
        }));
        expect(validateSharePayload({
            ...valid(), pourCount: 31, pourDataJSONStr: JSON.stringify(pours)
        })).toBeNull();
    });

    it("rejects a non-object", () => {
        expect(validateSharePayload(null)).toBe("payload must be an object");
        expect(validateSharePayload("nope")).toBe("payload must be an object");
    });

    it("rejects a missing field", () => {
        const p: Record<string, unknown> = valid();
        delete p.dose;
        expect(validateSharePayload(p)).toBe("dose must be a finite number");
    });

    it("rejects a name that is empty or absurdly long", () => {
        expect(validateSharePayload({...valid(), theName: "   "}))
            .toBe("theName must be a non-empty string of at most 120 characters");
        expect(validateSharePayload({...valid(), theName: "x".repeat(121)}))
            .toBe("theName must be a non-empty string of at most 120 characters");
    });

    it("rejects a colour that is not a hex triplet", () => {
        expect(validateSharePayload({...valid(), theColor: "red"}))
            .toBe("theColor must be a #RRGGBB colour");
    });

    it("rejects a dose outside the machine's range", () => {
        expect(validateSharePayload({...valid(), dose: 0})).toBe("dose is out of range");
        expect(validateSharePayload({...valid(), dose: 999})).toBe("dose is out of range");
    });

    it("rejects a cup type the machine does not have", () => {
        expect(validateSharePayload({...valid(), cupType: 7})).toBe("cupType is out of range");
    });

    it("rejects pour data that is not a JSON array", () => {
        expect(validateSharePayload({...valid(), pourDataJSONStr: "{}"}))
            .toBe("pourDataJSONStr must encode an array of 1 to 31 pours");
        expect(validateSharePayload({...valid(), pourDataJSONStr: "not json"}))
            .toBe("pourDataJSONStr must encode an array of 1 to 31 pours");
    });

    it("rejects a pour whose volume is out of range", () => {
        const pours = JSON.parse(valid().pourDataJSONStr);
        pours[0].volume = 5000;
        expect(validateSharePayload({...valid(), pourDataJSONStr: JSON.stringify(pours)}))
            .toBe("pour 1: volume is out of range");
    });

    it("rejects a pourCount that disagrees with the pour data", () => {
        expect(validateSharePayload({...valid(), pourCount: 3}))
            .toBe("pourCount must match the number of pours");
    });

    it("rejects a payload larger than the size ceiling", () => {
        const pours = JSON.parse(valid().pourDataJSONStr);
        pours[0].theName = "x".repeat(9000);
        expect(validateSharePayload({...valid(), pourDataJSONStr: JSON.stringify(pours)}))
            .toBe("payload is too large");
    });
});
