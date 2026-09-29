import fs from "fs";
import path from "path";

import {OUTBOUND_CALLS, SILENT_CAPABILITIES, sourceUrl} from "@/constants/network";

const ROOT = path.join(__dirname, "..", "..");

/** Where a network call could plausibly be written. */
const SCANNED = ["api", "app", "components", "constants", "hooks", "library"];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "node_modules") continue;
            walk(full, out);
            continue;
        }
        if (/\.tsx?$/.test(entry.name)) out.push(path.relative(ROOT, full));
    }
    return out;
}

/**
 * Every file in the app that performs an HTTP request.
 *
 * Comments are stripped before the match, because this file, the inventory and
 * the screen all *write* about `fetch(` without calling it, and a scan that
 * counted prose would demand entries for three files that send nothing.
 *
 * `\bfetch\(` and not `fetch` on its own: `fetchHubPage(` is a call into this
 * app, not out of it, and a scan that counted it would drown the real answer.
 */
function code(body: string): string {
    return body
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function callSites(): string[] {
    return SCANNED
        .flatMap((dir) => walk(path.join(ROOT, dir)))
        .filter((file) =>
            /\bfetch\(/.test(code(fs.readFileSync(path.join(ROOT, file), "utf8"))));
}

const listed = new Set(OUTBOUND_CALLS.flatMap((call) => call.source));

/**
 * The inventory has to stay true or it is worse than no inventory.
 *
 * A screen that lists what leaves the device is a promise, and the only way to
 * keep a promise like that across a year of changes is to make breaking it
 * fail the build. So this walks the source for the thing that actually sends a
 * request and insists each file be named by an entry. Adding a request means
 * telling a user about it in the same commit.
 */
describe("the outbound inventory", () => {
    it("finds the files that make requests", () => {
        // A guard on the guard. If the walk or the pattern ever stops matching,
        // every check below would pass by having nothing to check.
        const sites = callSites();
        expect(sites.length).toBeGreaterThanOrEqual(5);
        expect(sites).toContain(path.join("library", "hub", "hubApi.ts"));
    });

    it.each(callSites())("%s is named by an entry", (file) => {
        // Written with forward slashes in the data, because that is what a
        // GitHub URL wants; normalise rather than making the data platform
        // specific.
        expect(listed).toContain(file.split(path.sep).join("/"));
    });

    it.each(OUTBOUND_CALLS.flatMap((call) => call.source))("%s exists", (file) => {
        expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    });

    it.each(OUTBOUND_CALLS)("$id names a host its own source contains", (call) => {
        // Stops the host being prose. The string a user reads is the string
        // that is in the code, so it can be compared against a proxy log.
        const bodies = call.source.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"));
        expect(bodies.some((body) => body.includes(call.host))).toBe(true);
    });

    it("says something about every entry", () => {
        for (const call of OUTBOUND_CALLS) {
            expect(call.carries.length).toBeGreaterThan(0);
            expect(call.trigger.length).toBeGreaterThan(0);
            expect(call.source.length).toBeGreaterThan(0);
        }
        expect(SILENT_CAPABILITIES.length).toBeGreaterThan(0);
    });

    it("has unique ids", () => {
        const ids = [...OUTBOUND_CALLS.map((c) => c.id), ...SILENT_CAPABILITIES.map((c) => c.id)];
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("links a file to this repository", () => {
        expect(sourceUrl("api/share.ts"))
            .toBe("https://github.com/hessius/XBRecipeWriterPlus/blob/main/api/share.ts");
    });
});
