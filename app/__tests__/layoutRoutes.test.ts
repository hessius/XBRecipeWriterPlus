import fs from "fs";
import path from "path";

const APP = path.join(__dirname, "..");

function read(file: string): string {
    return fs.readFileSync(path.join(APP, file), "utf8");
}

/** Every route file in `app/`, by route name. */
function routeFiles(): string[] {
    return fs.readdirSync(APP)
        .filter((name) => name.endsWith(".tsx"))
        .filter((name) => !name.startsWith("_") && !name.startsWith("+"))
        .filter((name) => !name.startsWith("["));
}

/**
 * A screen that draws `ScreenHeader` must have the native bar switched off in
 * the layout, and it must be switched off *there*.
 *
 * Both halves are load-bearing and both have been got wrong. `brewHistory` and
 * `brewRecord` were registered nowhere at all, so they fell through to the
 * default native bar; emptying that bar's title from inside the screen hid the
 * words and left the bar, a blank strip and a system chevron above the app's
 * own header. And `ScreenHeader`'s own doc explains why the layout is the only
 * right place: an effect runs after the first paint, so a screen that hides its
 * own bar hands it one frame to flash.
 *
 * Reading the layout as text is the same trick `DotMatrixText.test.tsx` uses to
 * check font registration, and for the same reason — a route's options are not
 * reachable from a unit test any other way.
 */
describe("pushed screens and the native navigation bar", () => {
    const layout = read("_layout.tsx");

    const headered = routeFiles().filter((file) =>
        read(file).includes("@/components/ScreenHeader"));

    it("finds the screens that draw their own header", () => {
        // A guard on the guard: if the glob or the import path ever stops
        // matching, every check below would pass by having nothing to check.
        expect(headered.length).toBeGreaterThanOrEqual(6);
        expect(headered).toContain("brewHistory.tsx");
        expect(headered).toContain("brewRecord.tsx");
    });

    it.each(headered)("%s is registered with the native bar off", (file) => {
        const route = file.replace(/\.tsx$/, "");
        const registration = new RegExp(
            `<Stack\\.Screen\\s+name="${route}"[\\s\\S]{0,200}?headerShown:\\s*false`
        );
        expect(layout).toMatch(registration);
    });

    it.each(headered)("%s does not dress the bar from inside itself", (file) => {
        // `setOptions` on one of these screens means the bar is back: the only
        // reason to set a title is to have one.
        expect(read(file)).not.toContain("setOptions");
    });
});
