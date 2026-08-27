import React from "react";
import {screen} from "@testing-library/react-native";

import LicencesScreen from "@/app/licences";
import {LICENCES} from "@/constants/licences";
import {renderWithProviders} from "@/test-utils/render";

describe("LicencesScreen", () => {
    it("names a package and the licence it is under", async () => {
        await renderWithProviders(<LicencesScreen/>);

        // The first entry is whatever sorts first; asserting on it rather than
        // a package we happen to remember keeps this from breaking on a
        // dependency bump while still proving a row rendered.
        const first = LICENCES[0];
        expect(screen.getByText(
            new RegExp(`${first.name} ${first.version} — ${first.licence}`)
        )).toBeTruthy();
    });

    it("reproduces the copyright notice where the licence requires one", async () => {
        // MIT and BSD both oblige the notice to be reproduced, not merely the
        // licence named. The generator collects it; dropping it here would put
        // the app out of compliance while looking complete.
        const withNotice = LICENCES.find((entry) => entry.copyright !== undefined);
        expect(withNotice).toBeDefined();

        await renderWithProviders(<LicencesScreen entries={[withNotice!]}/>);

        expect(screen.getByText(withNotice!.copyright!)).toBeTruthy();
    });

    it("carries every generated entry, so nothing is quietly dropped", () => {
        expect(LICENCES.length).toBeGreaterThan(700);
        expect(LICENCES.some((entry) => entry.copyright !== undefined)).toBe(true);
    });

    it("says so when a licence was inferred rather than read", async () => {
        // Five @tamagui packages ship no licence field and no licence file. The
        // list records them as MIT on the strength of their monorepo's root
        // licence, which is a reasonable inference and not a fact read off the
        // package -- so the list has to show its working.
        const inferred = LICENCES.filter((entry) => entry.note !== undefined);
        expect(inferred.length).toBeGreaterThan(0);
        for (const entry of inferred) {
            expect(entry.licence).not.toBe("See package");
            expect(entry.note).toMatch(/monorepo/);
        }

        await renderWithProviders(<LicencesScreen entries={inferred.slice(0, 1)}/>);
        expect(screen.getByText(/Ships no licence of its own/)).toBeTruthy();
    });

    it("leaves no package without a licence at all", () => {
        // "See package" means the generator found nothing and nobody has since
        // worked out what the package is under. That is an unanswered question
        // in a document whose whole job is answering it.
        const unresolved = LICENCES.filter((entry) => entry.licence === "See package");
        expect(unresolved.map((entry) => entry.name)).toEqual([]);
    });
});
