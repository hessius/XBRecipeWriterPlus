import {brewFilename, toExportJson} from "@/library/brew/brewExport";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: Date.UTC(2026, 8, 3, 7, 42),
    endedAt: Date.UTC(2026, 8, 3, 7, 46), outcome: "done", failure: null,
    pours: 5, waterTotal: 250, cupTotal: 244, heldSeconds: 14, hasStream: true
};

const samples: BrewSample[] = [{at: 0, water: 0, cup: 0, pour: 1}];

describe("brewExport", () => {
    it("carries the summary and the stream", () => {
        const exported = JSON.parse(toExportJson(record, samples));
        expect(exported.brew.recipeName).toBe("Ethiopia Guji");
        expect(exported.samples).toHaveLength(1);
    });

    it("stamps the export with a version", () => {
        // Something else will read these one day, and a file that cannot say
        // what shape it is in is a file nobody can safely parse.
        expect(JSON.parse(toExportJson(record, samples)).version).toBe(1);
    });

    it("writes times as ISO as well as milliseconds", () => {
        // Milliseconds are for a program, the ISO string is for a person
        // opening the file in a text editor.
        const exported = JSON.parse(toExportJson(record, samples));
        expect(exported.brew.startedAtISO).toBe("2026-09-03T07:42:00.000Z");
    });

    it("names the file after the brew and its date", () => {
        expect(brewFilename(record, "json")).toBe("ethiopia-guji-2026-09-03.json");
    });

    it("makes a filename out of a name that is all punctuation", () => {
        // A name of "···" would otherwise produce a file called ".json",
        // which is hidden on every platform that matters.
        expect(brewFilename({...record, recipeName: "···"}, "png"))
            .toBe("brew-2026-09-03.png");
    });

    it("handles a record with no samples", () => {
        const exported = JSON.parse(toExportJson(record, []));
        expect(exported.samples).toHaveLength(0);
        expect(exported.brew.recipeName).toBe("Ethiopia Guji");
    });
});
