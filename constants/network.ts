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

import {SHARE_API_URL} from "@/constants/share";

/** Where the source of a given file can be read. */
export const REPO_URL = "https://github.com/hessius/XBRecipeWriterPlus";

/**
 * The host the mint actually reaches in this build.
 *
 * `SHARE_API_URL` can be pointed elsewhere at build time, so the published
 * hostname is a default rather than a fact about the app in your hand. Reading
 * it here means a build aimed at a preview deployment says where it is really
 * sending, and stops claiming the address is pinned when it is not.
 */
const SHARE_HOST = ((): string => {
    try {
        return new URL(SHARE_API_URL).host;
    } catch {
        return SHARE_API_URL;
    }
})();

const SHARE_HOST_PINNED = process.env.EXPO_PUBLIC_SHARE_API_URL === undefined;

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
    /**
     * Whether that host is a literal in this app's source.
     *
     * False where the address comes out of somebody else's reply: a photo on a
     * catalogue row is fetched from whatever URL xBloom put on the row, so no
     * hostname written here would be the whole truth. Required rather than
     * defaulted, so a new entry cannot be waved through without the question
     * being answered.
     */
    hostPinned: boolean;
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
        hostPinned: true,
        owner:   "xBloom",
        carries: [
            "The recipe ID or pod code you pasted.",
            "Which xBloom you told Settings you have, so a pod returns the grind for that machine.",
            "A handful of fixed values xBloom's endpoint requires and that say nothing about you: an interface version, the constant skey every client sends, a language, a client version string, and a refresh flag.",
            "Nothing about you, and nothing from your library."
        ],
        source:  ["library/XBloomRecipe.ts", "library/importInput.ts"]
    },
    {
        id:      "brewMind",
        title:   "Open BrewMind to build a recipe",
        trigger: "You choose BrewMind under New recipe.",
        host:    "brewmind.coffee",
        hostPinned: true,
        owner:   "BrewMind",
        carries: [
            "Nothing from your library, and nothing about your machine.",
            "Two fixed values in the address: that the visitor is this app, and which version of the handoff it can read.",
            "Whatever any web page sees when you visit it, because this is a browser and not a single request: your IP address, the name and version of the browser engine, and any cookies that page sets.",
            "Whatever you type or choose on BrewMind's own page, which goes to them under their privacy policy and not ours.",
            "A recipe comes back only as a link you tapped. Nothing is sent from this app to make that happen."
        ],
        source:  ["components/BrewMindBrowser.tsx", "hooks/useBrewMindCreate.ts"],
        unverifiable: "This opens a page you can browse, so where it goes after the first address is up to the page and to you. The address it starts at is the one named here."
    },
    {
        id:      "signIn",
        title:   "Sign in to your xBloom account",
        trigger: "You enter your xBloom email and password in Settings.",
        host:    "client-api.xbloom.com",
        hostPinned: true,
        owner:   "xBloom",
        carries: [
            "Your email address and password, over HTTPS, to xBloom's own login endpoint, the same one their app uses.",
            "Six fixed values xBloom's endpoint requires and that say nothing about you: an interface version, the constant skey every client sends, a phone type, a client type, a language, and an empty push identifier.",
            "Nothing else. Your credentials go to xBloom and nowhere else, they are never logged, and the password is never written to storage."
        ],
        source:  ["library/cloud/session.ts", "library/cloud/transport.ts"]
    },
    {
        id:      "cloudLibrary",
        title:   "Bring across your account's recipes",
        trigger: "You import from your xBloom account, once you are signed in.",
        host:    "client-api.xbloom.com",
        hostPinned: true,
        owner:   "xBloom",
        carries: [
            "The session token xBloom gave you, and your xBloom account number, encrypted with xBloom's public key the way their own client does it.",
            "The five fixed values the sign in also sends, but not the push identifier, which this call does not carry. With them, which page of your own recipes is being asked for and how many rows a page, for both machine models.",
            "Nothing is written back. XBRW++ never creates, changes or deletes anything in your xBloom account."
        ],
        source:  ["library/cloud/cloudLibrary.ts", "library/cloud/transport.ts", "library/cloud/rsa.ts"]
    },
    {
        id:      "hub",
        title:   "Browse the community catalogue",
        trigger: "You open the hub, or open one of its recipes.",
        host:    "collective-api.xbloom.com",
        hostPinned: true,
        owner:   "xBloom",
        carries: [
            "A page number, a page size, a sort field and direction, a fixed recipe type that keeps tea out of a coffee list, and which machine's catalogue to return.",
            "For the list of filter values the chips are built from, an empty body.",
            "The ID of a recipe you opened, and a fixed type saying it is a catalogue recipe.",
            "No account, no search text, and nothing from your library. Searching and filtering happen on this phone, over the rows already fetched."
        ],
        source:  ["library/hub/hubApi.ts", "library/hub/hubCatalogue.ts"]
    },
    {
        id:      "share",
        title:   "Create a share link",
        trigger: "You tap Share on a recipe and ask for a link.",
        host:    SHARE_HOST,
        hostPinned: SHARE_HOST_PINNED,
        owner:   "XBRW++",
        carries: [
            "The recipe's name, accent colour, dose, ratio, grind size, whether the grinder is on, grinder RPM, cup type, whether bypass is on and its temperature and volume.",
            "How many stages there are, and every stage's volume, temperature, flow rate, pattern, pause and agitation.",
            "Which xBloom the recipe is for, and four fixed values xBloom's own format requires: a subset id, a subset type, an app placement and a shortcut flag.",
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
            "and for a day it remembers what it just made against that hash and the " +
            "one-off key, so that pressing Share again returns the same link instead of " +
            "minting a second copy. What it remembers is the link and the number xBloom " +
            "gave the recipe. It stores no IP address, no recipe and nothing else. " +
            "You cannot watch it do any of that, so its source is in this repository under " +
            "api/ and is linked below."
    },
    {
        id:      "images",
        title:   "Load a photo",
        trigger: "You open the hub, an import preview, or a saved recipe that carries a pod photo or the avatar of whoever shared it.",
        host:    "whichever host xBloom named in its own reply",
        hostPinned: false,
        owner:   "xBloom, or whoever xBloom points at",
        carries: [
            "Nothing but the request itself: your IP address, and the address of the picture.",
            "No recipe, no account and nothing you have typed.",
            "The address comes from xBloom's reply rather than from this app, so it is not a fixed one. XBRW++ drops any address that is not https, and sends it nothing.",
            "This is the one request that can happen while you are only looking at your own library, because a recipe imported from xBloom remembers the photo that came with it."
        ],
        source:  [
            "library/podCoffee.ts",
            "library/hub/hubRow.ts",
            "components/PodSection.tsx",
            "components/FromSection.tsx",
            "components/HubRow.tsx",
            "components/ImportResult.tsx",
            "app/hubRecipe.tsx"
        ]
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
        detail: "Recipes, tags, shelves and notes are stored in a database on this phone. There is no sync, no account of our own, and no server that holds a copy. The one exception is a photo: a recipe imported from xBloom remembers where its picture came from, and opening that recipe fetches it. The Load a photo entry below says what that carries."
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
