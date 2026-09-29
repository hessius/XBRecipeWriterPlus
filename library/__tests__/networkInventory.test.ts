import fs from "fs";
import path from "path";

import {OUTBOUND_CALLS, SILENT_CAPABILITIES, sourceUrl} from "@/constants/network";
import {SHARE_API_URL} from "@/constants/share";

const ROOT = path.join(__dirname, "..", "..");

/**
 * What the walk does not enter.
 *
 * An exclusion list and not an allow-list of source directories. The first
 * draft named six directories, which meant a request written in a seventh
 * would have been invisible to the very test whose job is to find one.
 *
 * `tools/` is the one judgement call: it holds a separate Next.js app for
 * generating store screenshots on a laptop. Nothing in it ships to a phone, so
 * nothing in it can leave a user's device.
 */
const SKIPPED = new Set([
    "node_modules", "__tests__", "ios", "android", ".git", ".expo",
    "dist", "coverage", "scripts", "docs", "assets", ".github", "test-utils",
    "tools"
]);

/** A path as the inventory writes it: forward slashes, whatever the platform. */
function rel(full: string): string {
    return path.relative(ROOT, full).split(path.sep).join("/");
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (SKIPPED.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
            continue;
        }
        if (/\.[jt]sx?$/.test(entry.name)) out.push(rel(full));
    }
    return out;
}

/**
 * Comments, stripped.
 *
 * This file, the inventory and the screen all *write* about `fetch(` without
 * calling it, and a scan that counted prose would demand entries for three
 * files that send nothing.
 */
function code(body: string): string {
    return body
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The ways this app can cause an HTTP request.
 *
 * `\bfetch\(` and not `fetch` on its own: `fetchHubPage(` is a call into this
 * app, not out of it, and a scan that counted it would drown the real answer.
 *
 * `source={{uri` earns its place the hard way. The first version of this guard
 * looked for `fetch(` alone, and so could not see the five `<Image>` sites that
 * GET a photo from a host xBloom names, two of which draw on the editor deck of
 * a recipe already in the library. That was a whole request missing from a
 * screen whose entire purpose is to miss none.
 */
const OUTBOUND_PATTERNS = [
    /\bfetch\s*\(/g,
    /\bXMLHttpRequest\b/g,
    /\bnew\s+WebSocket\s*\(/g,
    /source\s*=\s*\{\{\s*uri/g
];

/**
 * Every endpoint path in the app, as a literal.
 *
 * Counting calls is not enough on its own, because `transport.post` and
 * `hubApi.post` are generic senders: three hub endpoints and four xBloom ones
 * go through two `fetch(` calls between them, so a fourth hub endpoint would
 * leave every count where it was. The paths themselves are what move when an
 * endpoint is added, so those are pinned as well.
 *
 * Both shapes are matched wherever they are written, so it does not matter
 * which file a new one is added in.
 */
const ENDPOINT_PATTERNS = [
    // Matched up to the closing quote rather than from the opening one,
    // because two of them are written as whole URLs and the rest as bare
    // paths, and the endpoint is the part they have in common.
    /[A-Za-z][A-Za-z0-9]*\.(?:html|thtml|tuhtml)(?=")/g,
    /\/communityRecipe\/[^"]+(?=")/g
];

/** Endpoint paths the inventory has been written against. */
const EXPECTED_ENDPOINTS = [
    "/communityRecipe/index/page",
    "/communityRecipe/recipe/criteria",
    "/communityRecipe/recipe/detail",
    "RecipeDetail.html",
    "tMemberLogin.thtml",
    "tRecipeDetailOfPods.thtml",
    "tuMyTeaRecipeCreated.tuhtml",
    "tuRecipeAdd.tuhtml"
];

/** Every endpoint literal the source contains, sorted and deduplicated. */
function endpoints(): string[] {
    const found = new Set<string>();
    for (const file of walk(ROOT)) {
        const body = code(fs.readFileSync(path.join(ROOT, file), "utf8"));
        for (const pattern of ENDPOINT_PATTERNS) {
            for (const hit of body.match(pattern) ?? []) found.add(hit);
        }
    }
    return [...found].sort();
}

/** Every file that reaches the network, with how many times it does so. */
function callSites(): Map<string, number> {
    const found = new Map<string, number>();
    for (const file of walk(ROOT)) {
        const body = code(fs.readFileSync(path.join(ROOT, file), "utf8"));
        const count = OUTBOUND_PATTERNS
            .reduce((sum, pattern) => sum + (body.match(pattern)?.length ?? 0), 0);
        if (count > 0) found.set(file, count);
    }
    return found;
}

/**
 * How many outbound calls each listed file is known to make.
 *
 * Pinned because the file is too coarse a unit on its own: `transport.post`
 * and `hubApi.post` are generic senders, so a new endpoint added beside an old
 * one in a file already on the list would otherwise ship without a word to the
 * user. A count that moves is a request that moved, and whoever moved it has
 * to come back here and say what it now carries.
 */
const EXPECTED_CALLS: Record<string, number> = {
    "api/_lib/store.ts":           2,
    "api/_lib/xbloom.ts":          1,
    "app/hubRecipe.tsx":           1,
    "components/FromSection.tsx":  1,
    "components/HubRow.tsx":       1,
    "components/ImportResult.tsx": 1,
    "components/PodSection.tsx":   1,
    "hooks/useShareRecipe.ts":     1,
    "library/XBloomRecipe.ts":     1,
    "library/cloud/transport.ts":  1,
    "library/hub/hubApi.ts":       1
};

const listed = new Set(OUTBOUND_CALLS.flatMap((call) => call.source));

/**
 * The inventory has to stay true or it is worse than no inventory.
 *
 * A screen that lists what leaves the device is a promise, and the only way to
 * keep a promise like that across a year of changes is to make breaking it
 * fail the build. So this walks the source for the things that actually reach
 * a server and insists each file be named by an entry, and that each file's
 * number of calls is the number somebody has already described.
 */
describe("the outbound inventory", () => {
    const sites = callSites();

    it("finds the files that reach the network", () => {
        // A guard on the guard. If the walk or the patterns ever stop matching,
        // every check below would pass by having nothing to check.
        expect(sites.size).toBeGreaterThanOrEqual(10);
        expect([...sites.keys()]).toContain("library/hub/hubApi.ts");
        expect([...sites.keys()]).toContain("components/PodSection.tsx");
    });

    it.each([...callSites().keys()])("%s is named by an entry", (file) => {
        expect(listed).toContain(file);
    });

    it("reaches exactly the endpoints the inventory was written against", () => {
        // The half of the promise a per-file count cannot keep: a fourth path
        // posted through `hubApi.post` moves nothing else in this test.
        expect(endpoints()).toEqual(EXPECTED_ENDPOINTS);
    });

    it("makes exactly the calls the inventory was written against", () => {
        // Compared whole rather than file by file, so a call site that vanishes
        // from the scan fails as loudly as one that appears.
        expect(Object.fromEntries([...sites.entries()].sort()))
            .toEqual(EXPECTED_CALLS);
    });

    it.each(OUTBOUND_CALLS.flatMap((call) => call.source))("%s exists", (file) => {
        expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    });

    it.each(OUTBOUND_CALLS.filter((call) => call.hostPinned))(
        "$id names a host its own source contains", (call) => {
            // Stops the host being prose. The string a user reads is the string
            // in the code, so it can be compared against a proxy log. An entry
            // whose host comes out of somebody else's reply is exempt by
            // declaring `hostPinned: false`, not by silence.
            const bodies = call.source
                .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"));
            expect(bodies.some((body) => body.includes(call.host))).toBe(true);
        });

    it("reports the mint host this build actually sends to", () => {
        // The published hostname is a default: EXPO_PUBLIC_SHARE_API_URL can
        // replace the whole endpoint at build time. Reading it from the same
        // constant the sender uses means a build aimed somewhere else cannot
        // keep telling the user it reaches the published service. A literal
        // here would satisfy the pinned-host test above and still be a lie.
        const share = OUTBOUND_CALLS.find((call) => call.id === "share");
        expect(share).toBeDefined();
        expect(share!.host).toBe(new URL(SHARE_API_URL).host);
        expect(share!.hostPinned)
            .toBe(process.env.EXPO_PUBLIC_SHARE_API_URL === undefined);
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
