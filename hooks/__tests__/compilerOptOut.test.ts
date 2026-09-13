import * as babel from "@babel/core";

/**
 * The one bug class in this app that no ordinary test can see.
 *
 * The React Compiler is on in `app.json`, but it is not on under jest, so every
 * runtime test here renders un-memoised code and passes while the device fails.
 * That is not a hypothetical: it is how a stale editor shipped. `useRecipeEditor`
 * derives the target volume, the pour balance and the card-write problems by
 * calling methods on a `Recipe` that is edited *in place*, and the compiler keys
 * its cache on the object reference:
 *
 *     if ($[5] !== recipe) { t4 = recipe?.getTotalVolume() ?? 0; ... }
 *
 * A reference that never changes makes that test false forever, so the target
 * line stopped following the ratio, Auto fix could not clear its own banner, and
 * Brew stayed disabled until the screen was closed and reopened on a freshly
 * parsed recipe.
 *
 * So this compiles the file the way the device does and asserts the hazard is
 * absent. It fails if someone drops the `"use no memo"` directive, and it fails
 * if a new derivation keyed on a mutated model appears in a file that has one.
 */

/** The domain objects this app edits in place rather than replacing. */
const MUTATED_IN_PLACE = ["recipe", "pour", "pours"];

function compile(file: string): string {
    const result = babel.transformFileSync(file, {
        filename:   file,
        babelrc:    false,
        configFile: false,
        // Dropped, because this repo documents the hazard in prose directly
        // above the directive that prevents it -- and a comment quoting the
        // generated code would otherwise match the search below.
        comments:   false,
        presets:    [["@babel/preset-typescript", {
            isTSX: file.endsWith(".tsx"), allExtensions: true
        }]],
        plugins:    [["babel-plugin-react-compiler", {target: "19"}]]
    });
    if (!result?.code) throw new Error(`could not compile ${file}`);
    return result.code;
}

/** Every memo-cache slot the compiler keyed on a mutated domain object. */
function slotsKeyedOnMutatedModels(code: string): string[] {
    const pattern = new RegExp(
        String.raw`\$\[\d+\]\s*!==\s*(${MUTATED_IN_PLACE.join("|")})\b`, "g"
    );
    return [...code.matchAll(pattern)].map((match) => match[1]);
}

describe("the React Compiler and the models this app mutates in place", () => {
    it("does not memoise the editor's derivations on the recipe it mutates", () => {
        const slots = slotsKeyedOnMutatedModels(compile("hooks/useRecipeEditor.ts"));

        expect(slots).toEqual([]);
    });

    it("would have caught the stale editor, so it is not a tautology", () => {
        // The same file without its directive, to prove the check has teeth.
        // If this ever comes back empty the assertion above means nothing.
        const withoutOptOut = babel.transformSync(
            `import {useState} from "react";
             export function useThing(model) {
                 const [key, setKey] = useState(0);
                 const balance = {target: model?.getTotalVolume() ?? 0};
                 return {balance, key, setKey};
             }`,
            {
                babelrc: false, configFile: false, filename: "probe.ts",
                plugins: [["babel-plugin-react-compiler", {target: "19"}]]
            }
        )?.code ?? "";

        expect(withoutOptOut).toMatch(/\$\[\d+\]\s*!==\s*model\b/);
    });
});
