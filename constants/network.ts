/**
 * Every outbound request XBRW++ is capable of making.
 *
 * The app's privacy claim is that almost nothing leaves the phone, and that
 * what does leaves because somebody asked for it. That claim used to live only
 * in `PRIVACY.md`, which is prose: a reader has to trust that the prose was
 * updated when the code was. This list is read by the screen a user can open
 * and by `library/__tests__/networkInventory.test.ts`, which walks the source
 * for `fetch(` call sites and fails when one of them is not named here. A new
 * request therefore cannot ship silently.
 *
 * That guard is why `source` holds repo-relative paths rather than URLs: the
 * paths are matched against the files the scan finds, and `sourceUrl` turns
 * one into a link only at the moment it is drawn.
 *
 * Everything here is written for somebody who does not read code. `carries` is
 * the honest field list, not a summary of it: if a value is sent, it is on the
 * list, and a request that sends nothing about the user says so in words.
 */

/** Where the source of a given file can be read. */
export const REPO_URL = "https://github.com/hessius/XBRecipeWriterPlus";

/** A link to one file in this repository, on the default branch. */
export function sourceUrl(path: string): string {
    return `${REPO_URL}/blob/main/${path}`;
}

export type OutboundCall = {
    id: string;
    /** Plain name for the request, as a user would describe it. */
    title: string;
    /** What the user did to cause it. Nothing here happens on its own. */
    trigger: string;
    /** The host it reaches, bare, so it can be compared against a proxy log. */
    host: string;
    /** Whose server that is. */
    owner: string;
    /** Every value that leaves, one line each. */
    carries: string[];
    /** Files in this repo that perform or shape the request. */
    source: string[];
    /**
     * What a reader cannot check from their own phone.
     *
     * Set only where it is true. The mint is the real case: the request leaves
     * the device and the rest happens on a server, so the source is the only
     * thing a reader can hold it to.
     */
    unverifiable?: string;
};

export const OUTBOUND_CALLS: OutboundCall[] = [
    {
        id:      "import",
        title:   "Look up a shared recipe",
        trigger: "You paste an xBloom link or a pod code, or share a link into the app.",
        host:    "client-api.xbloom.com",
        owner:   "xBloom",
        carries: [
            "The recipe ID or pod code you pasted.",
            "Which xBloom you told Settings you have, so a pod returns the grind for that machine.",
            "Nothing about you, and nothing from your library."
        ],
        source:  ["library/XBloomRecipe.ts", "library/importInput.ts"]
    },
    {
        id:      "signIn",
        title:   "Sign in to your xBloom account",
        trigger: "You enter your xBloom email and password in Settings.",
        host:    "client-api.xbloom.com",
        owner:   "xBloom",
        carries: [
            "Your email address and password, over HTTPS, to xBloom's own login endpoint, the same one their app uses.",
            "Nothing else. They go to xBloom and nowhere else, they are never logged, and the password is never written to storage."
        ],
        source:  ["library/cloud/session.ts", "library/cloud/transport.ts"]
    },
    {
        id:      "cloudLibrary",
        title:   "Bring across your account's recipes",
        trigger: "You import from your xBloom account, once you are signed in.",
        host:    "client-api.xbloom.com",
        owner:   "xBloom",
        carries: [
            "The session token xBloom gave you, and your xBloom account number, encrypted with xBloom's public key the way their own client does it.",
            "Which page of your own recipes is being asked for, for both machine models.",
            "Nothing is written back. XBRW++ never creates, changes or deletes anything in your xBloom account."
        ],
        source:  ["library/cloud/cloudLibrary.ts", "library/cloud/transport.ts", "library/cloud/rsa.ts"]
    },
    {
        id:      "hub",
        title:   "Browse the community catalogue",
        trigger: "You open the hub, or open one of its recipes.",
        host:    "collective-api.xbloom.com",
        owner:   "xBloom",
        carries: [
            "A page number, and which machine's catalogue to return.",
            "The ID of a recipe you opened.",
            "No account, no search text, and nothing from your library. Searching and filtering happen on this phone, over the rows already fetched."
        ],
        source:  ["library/hub/hubApi.ts", "library/hub/hubCatalogue.ts"]
    },
    {
        id:      "share",
        title:   "Create a share link",
        trigger: "You tap Share on a recipe and ask for a link.",
        host:    "xbrwplusplus.vercel.app",
        owner:   "XBRW++",
        carries: [
            "The recipe's name, accent colour, dose, ratio, grind size, grinder RPM, cup type and bypass settings.",
            "Every stage's volume, temperature, flow rate, pattern, pause and agitation.",
            "Which xBloom the recipe is for.",
            "A random one-off key, so pressing Share twice cannot mint two copies.",
            "No device identifier, no account, no location and no usage data."
        ],
        source:  [
            "hooks/useShareRecipe.ts",
            "library/shareLink.ts",
            "constants/share.ts",
            "api/share.ts",
            "api/_lib/payload.ts",
            "api/_lib/xbloom.ts",
            "api/_lib/rateLimit.ts",
            "api/_lib/store.ts"
        ],
        unverifiable:
            "This is the one request you cannot follow to the end from your own phone. " +
            "The recipe goes to a small service run by XBRW++, which adds it to an xBloom " +
            "account belonging to XBRW++ and hands back a link. That service keeps a count " +
            "of recent links against a salted hash of your IP address so it cannot be abused, " +
            "and stores no address, no recipe and no record of what you shared. You cannot " +
            "watch it do that, so its source is in this repository under api/ and is linked below."
    }
];

/** Something the app does that reaches no server at all. */
export type SilentCapability = {
    id: string;
    title: string;
    detail: string;
};

/**
 * The other half of the answer.
 *
 * A list of requests alone reads as a list of things to worry about. Most of
 * what this app does sends nothing, and that is worth stating in the same
 * place and with the same directness.
 */
export const SILENT_CAPABILITIES: SilentCapability[] = [
    {
        id:     "cards",
        title:  "Reading and writing cards",
        detail: "Card contents never leave this phone. Reading, editing and writing a card all work with the network off."
    },
    {
        id:     "library",
        title:  "Your library",
        detail: "Recipes, tags, shelves and notes are stored in a database on this phone. There is no sync, no account of our own, and no server that holds a copy."
    },
    {
        id:     "brewing",
        title:  "Brewing",
        detail: "A brew goes to the machine in the room with you over Bluetooth, and no further. Nothing about a brew is sent over the network, and brew history stays on this phone."
    },
    {
        id:     "backup",
        title:  "Backup and restore",
        detail: "A backup file is handed to the system share sheet and goes only where you send it. Nothing is uploaded anywhere."
    },
    {
        id:     "telemetry",
        title:  "Analytics, ads and crash reporting",
        detail: "There are none. No usage data is collected, and no third party is told that you opened the app."
    }
];
