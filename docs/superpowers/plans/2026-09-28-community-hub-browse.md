# Community hub browse — Phase 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let somebody browse xBloom's 3,020-recipe community catalogue inside XBRW++, and save one or many of those recipes into their own library.

**Architecture:** A new `library/hub/` of pure TypeScript that talks to `collective-api.xbloom.com`, normalises its fairly dirty rows, and builds its one search request. Above that, one new browse route and one new detail route, reached from `ImportSheet`. Saving reuses the existing share-link importer unchanged: a hub row carries a `shareRecipeLink`, and `parseImportInput` is already host-agnostic.

**Tech Stack:** TypeScript, React Native, Expo Router, Tamagui, Jest with `@testing-library/react-native` v14.

---

## Before you write anything

Read `docs/superpowers/specs/2026-09-28-community-hub-design.md` §2 and §5. The
short version of what that evidence forces:

1. **Never convert a grind size between machines.** The catalogue publishes the
   same recipe once per machine, which makes it a paired dataset, and the pairs
   say the two scales are not one number in two units: best linear fit
   R² = 0.444, within two steps on 20% of pairs, worst case 35 steps off. The
   machine to browse comes from the `machineModel` setting and is **not**
   user-selectable. Browsing the other machine's recipes has no use, because
   the grind numbers would be wrong for the machine you own and cannot be
   corrected.
2. **The rows are dirty and the normaliser is the only place that deals with
   it.** Official rows pre-join facet arrays into one element using three
   different separators; some `process` values are unparsed JSON that leaked
   through as the literal string `["Washed"]`; some names carry mojibake from a
   UTF-8 string decoded as Mac Roman. None of that reaches a component.
3. **The catalogue is not a community.** 2,974 of 3,020 rows are published by
   `xBloom Official`. Treat the screen as a catalogue browser. `likesCount` is
   not displayed, because the numbers do not behave like a popularity signal.
4. **Nothing under `library/hub/` imports `Recipe`.** A hub row becomes a
   `Recipe` only at save, and only through the existing importer. `Pour` is
   allowed, because the detail screen draws a stage plan before anything is
   owned.

The API is live and unauthenticated. You can and should curl it while working:

```bash
curl -s -X POST https://collective-api.xbloom.com/communityRecipe/index/page \
  -H 'Content-Type: application/json' \
  -d '{"pageIndex":1,"pageSize":2,"recipeType":1,"machineList":["J15"]}' | head -60
```

## Corrections to the spec, already made

Three things in §5 do not survive contact with the code. They are resolved
here; do not "fix" them back.

- **§5.2 says rows reuse `SelectableRecipeRow`.** They cannot: that component
  takes a `Recipe`, and a hub row is not one and must not become one before
  save. Task 7 builds `HubRow`, which copies its 26 pt tick and its
  `accessibilityRole="checkbox"` contract so the interaction is the same one
  the shelf member picker already teaches.
- **§5.3 says `EmptyLibrary` gains a CTA.** `components/EmptyLibrary.tsx`
  carries a comment saying it deliberately has no button, because the three CTA
  tiles stay on screen above it and its own copy points at them. The hub door
  goes in `ImportSheet` only, which §5.3 already calls the honest home, and the
  import tile above the empty state is how a new user reaches it.
- **§5.3 says nothing in `app/index.tsx` changes, and that holds**, but only
  because `app/index.tsx` already calls `library.refresh()` in a
  `useFocusEffect`. Saving from the hub writes through `RecipeDatabase` and the
  library picks it up on the way back. Do not add a callback or a param to the
  library route.

### Corrections found during Task 2, counted across all 2,966 live rows

- **There are six separators, not three**, and the way to find them is a
  census of every non-ASCII punctuation mark in every facet value, not a list
  of the ones you expect. Middle dot 3,801, bullet 191, katakana middle dot
  169, **ideographic comma 113**, plus ASCII comma and semicolon. The first
  pass missed the ideographic comma, which is more common than the semicolon
  it did include. Split on all of them at once, not on the first one found:
  rows mix two (`Ginger flower · Ripe plum · Hints of cocoa, Tangerine zest`).
- **En dash and em dash are not separators.** Flavour lists use them as one,
  but origin and process use them as qualifiers (`Rwanda – Gakenke District`,
  `Natural – Dry Fermentation`), and shredding an address is the worse mistake.
  Fullwidth comma likewise: all seven live uses are prose.
- **`type` is a facet wearing a string's clothes.** The server's own
  `coffeeTypeList` has three members but the field is free text, so it carries
  `N/A` on 11 rows, `???` on two and a joiner on 25. It goes through the same
  cleaner and takes the first value, because it draws as one badge.
- **A value with no letter and no digit is not a value.** A rule rather than a
  longer list of punctuation, because whatever the next person types instead of
  answering will not be on any list we wrote.
- **`roast` is bounded, not just non-zero.** `roastList` has exactly five
  entries, and a 7 would index off the end of it.
- **`&` and `/` are not separators.** `Herbs & Spices` is one flavour,
  `Geisha/Gesha` is one varietal, `N/A` is not two of anything.
- **The plain space is the dangerous one and the vocabulary gate is right.**
  Real live values include `Washed Thermal Shock`, `Anaerobic Slow Dry (ASD)
  Natural` and `72h Anaerobic Mosto & Panela Honey Fermentation + Thermal
  Shock Natural`. A blind split would shred far more than it rescued.
- **38 values are somebody declining to answer**: `N/A` 21, `NONE` 8, `-` 8,
  `none` 1. Dropped, or they become a filter chip offering to find coffees
  whose flavour is "N/A".

### Corrections found during Task 1, verified live

- **`fetchHubDetail` takes the *community* id.** A list row carries both
  `communityRecipeId: 164` and `recipeId: 576` as plain numbers. Passing the
  wrong one compiles, answers HTTP 200 with envelope code 200, and returns a
  real recipe that is not the one somebody tapped. The parameter is named
  `communityRecipeId` for that reason, and `HubRecipe.id` is the community id.
- **The detail endpoint sends no `pourCount`.** `HubDetailRow` omits it, so
  `normaliseRow(detail)` is a compile error; supply `pourList.length`.
- **`recipeType` is required, not optional.** Omitting it returns 3,020 rows
  instead of 2,966, and the extra 54 are tea.
- **`sortType` is the direction**, 1 ascending and 2 descending, and it does
  nothing without `sort`. It is not a second sort key.
- **`type: 1` on the detail request is not the coffee/tea switch.** `type: 2`
  answers "This requires you to log in first", and a tea row fetches fine with
  `type: 1`. Tea is excluded by `recipeType` on the list request.
- **The envelope's `code` is kept on the error**, because a removed recipe
  comes back as code 400 inside an HTTP 200 and is an ordinary thing to render
  calmly, while code 500 is worth a retry. `HubApiError.isRefusal` is that
  question, so no screen has to match on English prose. The hub's `msg` is
  kept as `detail.serverMessage` for diagnosis and is never displayed.
- **An offline phone throws a bare `TypeError`**, which `post` turns into a
  `HubApiError`. An `AbortError` is deliberately rethrown as itself so a screen
  that cancelled its own load on unmount stays silent.

## File structure

**New, pure TypeScript, no React:**

| File | Responsibility |
| --- | --- |
| `library/hub/hubApi.ts` | The three endpoints and their wire types. The only file that calls `fetch`. |
| `library/hub/hubRow.ts` | Normalising one list row into a `HubRecipe`. Every mess in §2.4 is contained here. |
| `library/hub/hubCriteria.ts` | The facet vocabularies, fetched once per session. Owns the roast mapping, including that `0` and null are unset. |
| `library/hub/hubQuery.ts` | Builds the one search request, the way `libraryQuery.ts` builds the one library statement. |
| `library/hub/hubStages.ts` | Turns a detail row's `pourList` into `Pour` objects so `BrewStageLadder` can draw it. |

**New React:**

| File | Responsibility |
| --- | --- |
| `hooks/useHubBrowse.ts` | The browse state machine: query, paging, loading, failure, selection. |
| `hooks/useHubSave.ts` | Saving one or many rows, sequentially, reporting partial failure. |
| `components/HubRow.tsx` | One photo-led catalogue row, with the select tick. |
| `components/HubFilterSheet.tsx` | The picker the rail chips open, populated from the server's vocabularies. |
| `components/HubSaveBar.tsx` | The bottom bar shown in select mode. |
| `app/hub.tsx` | The browse destination. |
| `app/hubRecipe.tsx` | One recipe, before it is owned. |

**Modified:**

| File | Change |
| --- | --- |
| `app/_layout.tsx` | Two `Stack.Screen` declarations with `headerShown: false`. |
| `components/ImportSheet.tsx` | One row that closes the sheet and pushes `/hub`. |
| `.github/copilot-instructions.md` | The `library/hub/` entry. |

---

## Task 1: The wire

**Files:**
- Create: `library/hub/hubApi.ts`
- Test: `library/hub/__tests__/hubApi.test.ts`

This file owns the network and nothing else. No normalising, no mapping, no
opinions about what a row means. It exists so that every other file in
`library/hub/` can be tested without a `fetch` mock.

- [ ] **Step 1: Write the failing test**

Create `library/hub/__tests__/hubApi.test.ts`:

```ts
/**
 * The hub's three endpoints, and nothing else.
 *
 * `fetch` is mocked the way `library/__tests__/XBloomRecipe.test.ts` mocks it,
 * which is the house pattern: assign `global.fetch` in a `beforeEach` and read
 * the request back out of the mock's calls.
 */
import {fetchHubCriteria, fetchHubDetail, fetchHubPage, HubApiError} from "@/library/hub/hubApi";

const PAGE = "https://collective-api.xbloom.com/communityRecipe/index/page";
const CRITERIA = "https://collective-api.xbloom.com/communityRecipe/recipe/criteria";
const DETAIL = "https://collective-api.xbloom.com/communityRecipe/recipe/detail";

function respond(data: unknown, code = 200) {
    return {ok: true, status: 200, json: async () => ({code, msg: "Operation Successful", data})};
}

function lastRequest() {
    const calls = (global.fetch as jest.Mock).mock.calls;
    return {url: calls[calls.length - 1][0], init: calls[calls.length - 1][1]};
}

beforeEach(() => {
    global.fetch = jest.fn(async () => respond({})) as unknown as typeof fetch;
});

describe("asking the hub for a page", () => {
    it("posts the search to the page endpoint", async () => {
        global.fetch = jest.fn(async () =>
            respond({pageIndex: 1, pageSize: 100, totalPage: 3, total: 280, list: []})
        ) as unknown as typeof fetch;

        const page = await fetchHubPage({pageIndex: 1, pageSize: 100, machineList: ["J15"]});

        const {url, init} = lastRequest();
        expect(url).toBe(PAGE);
        expect(init.method).toBe("POST");
        expect(init.headers["content-type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({pageIndex: 1, pageSize: 100, machineList: ["J15"]});
        expect(page.total).toBe(280);
        expect(page.list).toEqual([]);
    });

    it("passes an abort signal through", async () => {
        // Every screen that fetches here can be left before the answer arrives.
        const controller = new AbortController();

        await fetchHubPage({pageIndex: 1, pageSize: 1}, controller.signal);

        expect(lastRequest().init.signal).toBe(controller.signal);
    });

    it("refuses a page the transport did not deliver", async () => {
        global.fetch = jest.fn(async () => ({
            ok: false, status: 503, json: async () => ({})
        })) as unknown as typeof fetch;

        await expect(fetchHubPage({pageIndex: 1, pageSize: 1})).rejects.toThrow(HubApiError);
    });

    it("refuses a page the server answered with a failure code", async () => {
        // The transport says 200 and the envelope says otherwise. Reading
        // `data` off that would hand a screen an undefined list and call it an
        // empty catalogue.
        global.fetch = jest.fn(async () =>
            ({ok: true, status: 200, json: async () => ({code: 500, msg: "boom", data: null})})
        ) as unknown as typeof fetch;

        await expect(fetchHubPage({pageIndex: 1, pageSize: 1})).rejects.toThrow("boom");
    });
});

describe("asking the hub for its vocabularies", () => {
    it("posts an empty body to the criteria endpoint", async () => {
        global.fetch = jest.fn(async () => respond({
            originList: [{name: "Brazil", value: "1"}],
            varietalList: [], roastList: [], flavorList: [],
            machineList: [], cupTypeList: [], processingList: [], coffeeTypeList: []
        })) as unknown as typeof fetch;

        const criteria = await fetchHubCriteria();

        expect(lastRequest().url).toBe(CRITERIA);
        expect(JSON.parse(lastRequest().init.body)).toEqual({});
        expect(criteria.originList[0]).toEqual({name: "Brazil", value: "1"});
    });
});

describe("asking the hub about one recipe", () => {
    it("posts the id and the coffee type", async () => {
        global.fetch = jest.fn(async () =>
            respond({communityRecipeId: 164, recipeName: "Brian's Recipe"})
        ) as unknown as typeof fetch;

        const detail = await fetchHubDetail(164);

        expect(lastRequest().url).toBe(DETAIL);
        expect(JSON.parse(lastRequest().init.body)).toEqual({id: 164, type: 1});
        expect(detail.recipeName).toBe("Brian's Recipe");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/hub/__tests__/hubApi.test.ts`
Expected: FAIL, `Cannot find module '@/library/hub/hubApi'`.

- [ ] **Step 3: Write the client**

Create `library/hub/hubApi.ts`:

```ts
/**
 * The community catalogue's three endpoints.
 *
 * A different backend from `client-api.xbloom.com`, which the rest of the app
 * uses: no auth, no RSA, no `skey`, and a bare `Content-Type: application/json`
 * POST is enough. Endpoint names were taken from `saya6k/hacs-xbloom` (MIT) and
 * then verified live.
 *
 * This file performs every fetch in `library/hub/` and makes no judgements
 * about what a row means, so the normaliser, the vocabularies and the query
 * builder are all testable without a network stand-in.
 */

const BASE = "https://collective-api.xbloom.com";

/** A failure that is the hub's fault rather than the caller's. */
export class HubApiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = "HubApiError";
    }
}

/** One entry in a facet vocabulary. `value` is a string even when it is a number. */
export type HubCriteriaItem = {name: string; value: string};

export type HubCriteria = {
    originList: HubCriteriaItem[];
    varietalList: HubCriteriaItem[];
    roastList: HubCriteriaItem[];
    flavorList: HubCriteriaItem[];
    machineList: HubCriteriaItem[];
    cupTypeList: HubCriteriaItem[];
    processingList: HubCriteriaItem[];
    coffeeTypeList: HubCriteriaItem[];
};

/**
 * A row as the server sends it, before `hubRow.ts` has cleaned it up.
 *
 * Deliberately permissive about the facet arrays: they arrive as arrays of
 * strings, but official rows pack a whole joined list into element zero, and
 * some elements are unparsed JSON. That is the normaliser's problem, not this
 * file's.
 */
export type HubListRow = {
    communityRecipeId: number;
    recipeId: number;
    recipeName: string;
    imageUrl: string | null;
    userName: string | null;
    userAvatar: string | null;
    official: number;
    model: string;
    cupType: string;
    cupTypeInt: number;
    type: string | null;
    origin: string[] | null;
    varietal: string[] | null;
    process: string[] | null;
    flavor: string[] | null;
    roast: number | null;
    dose: number;
    grinderSize: number;
    rpm: number;
    pourCount: number;
    grandWater: number;
    volume: string;
    likesCount: number;
    shareRecipeLink: string;
};

/** One stage of a detail row's plan. */
export type HubPour = {
    theName: string;
    volume: number;
    temperature: number;
    pausing: number;
    pattern: number;
};

export type HubDetailRow = Omit<HubListRow, "pourCount"> & {
    uploadDate: string | null;
    introduce: string | null;
    pourList: HubPour[] | null;
};

export type HubPageRequest = {
    pageIndex: number;
    pageSize: number;
    keyword?: string;
    recipeType: number;
    recipeUserType?: number;
    sort?: number;
    sortType?: number;
    originIds?: string[];
    varietalIds?: string[];
    processIds?: string[];
    roastList?: string[];
    flavorIds?: string[];
    machineList?: string[];
    cupTypeList?: string[];
};

export type HubPage = {
    pageIndex: number;
    pageSize: number;
    totalPage: number;
    total: number;
    list: HubListRow[];
};

/**
 * POST a JSON body and unwrap the envelope.
 *
 * Two failures, not one. A transport failure never reached the server; an
 * envelope whose `code` is not 200 did, and carries a reason worth showing.
 * Both become a `HubApiError` so a caller has one thing to catch, but the
 * message differs because the user-facing sentence does.
 */
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {"content-type": "application/json", accept: "application/json"},
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        throw new HubApiError(`The recipe hub is not answering (${response.status}).`,
                              response.status);
    }

    const envelope = await response.json() as {code?: number; msg?: string; data?: T};
    if (envelope.code !== 200) {
        throw new HubApiError(envelope.msg ?? "The recipe hub refused that request.");
    }
    return envelope.data as T;
}

export function fetchHubPage(request: HubPageRequest, signal?: AbortSignal): Promise<HubPage> {
    return post<HubPage>("/communityRecipe/index/page", request, signal);
}

export function fetchHubCriteria(signal?: AbortSignal): Promise<HubCriteria> {
    return post<HubCriteria>("/communityRecipe/recipe/criteria", {}, signal);
}

/**
 * One recipe in full.
 *
 * `type: 1` is the coffee catalogue. The tea catalogue is `2` and is not
 * browsed here: a tea recipe has no grind and no dose, so most of what this
 * screen shows about a row would be blank.
 */
export function fetchHubDetail(id: number, signal?: AbortSignal): Promise<HubDetailRow> {
    return post<HubDetailRow>("/communityRecipe/recipe/detail", {id, type: 1}, signal);
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest library/hub/__tests__/hubApi.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add library/hub/hubApi.ts library/hub/__tests__/hubApi.test.ts
git commit -m "Reach the community catalogue" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: The mess, contained

**Files:**
- Create: `library/hub/hubRow.ts`
- Test: `library/hub/__tests__/hubRow.test.ts`

Every example below was taken from the live catalogue. Do not soften them.

- [ ] **Step 1: Write the failing test**

Create `library/hub/__tests__/hubRow.test.ts`:

```ts
/**
 * The catalogue's data is dirty and this is the only place that knows it.
 *
 * Every input below was observed in the live catalogue on 2026-09-28. A test
 * here that stops holding is a row rendering as punctuation soup on the browse
 * screen, so treat a changed expectation as a regression until proven
 * otherwise.
 */
import type {HubListRow} from "@/library/hub/hubApi";
import {normaliseHubRow, splitFacet} from "@/library/hub/hubRow";

function row(over: Partial<HubListRow> = {}): HubListRow {
    return {
        communityRecipeId: 164, recipeId: 576, recipeName: "Brian's Recipe",
        imageUrl: "https://example.com/a.png", userName: "xBloom Official",
        userAvatar: null, official: 1, model: "Studio", cupType: "xPod",
        cupTypeInt: 1, type: "Single Origin", origin: ["Colombia"],
        varietal: ["Mix"], process: ["Washed"], flavor: [], roast: 1,
        dose: 15, grinderSize: 52, rpm: 120, pourCount: 5, grandWater: 16,
        volume: "240", likesCount: 910,
        shareRecipeLink: "https://share-h5.xbloom.com/?id=abc",
        ...over
    };
}

describe("splitting a facet the server pre-joined", () => {
    it("splits on all three separators the catalogue uses", () => {
        // Official rows pack a whole list into element zero, and three
        // different separators are in use across the catalogue. Picking one
        // would leave two thirds of the rows showing a single run-on value.
        expect(splitFacet(["Washed \u00b7 Anaerobic"])).toEqual(["Washed", "Anaerobic"]);
        expect(splitFacet(["Washed \u2022 Anaerobic"])).toEqual(["Washed", "Anaerobic"]);
        // The third separator is a plain space, and it is only safe with the
        // vocabulary in hand. See the next test for why.
        expect(splitFacet(["Colombia Brazil"], ["Colombia", "Brazil"]))
            .toEqual(["Colombia", "Brazil"]);
    });

    it("keeps a multi-word value that was never joined", () => {
        // The plain-space separator cannot be applied blindly: "Washed Thermal
        // Shock" is one process and "Costa Rica" is one country. Only split on
        // a space when neither of the two real separators is present AND every
        // piece is a word the vocabulary knows.
        expect(splitFacet(["Washed Thermal Shock"], ["Washed", "Natural"]))
            .toEqual(["Washed Thermal Shock"]);
        expect(splitFacet(["Washed Natural"], ["Washed", "Natural"]))
            .toEqual(["Washed", "Natural"]);
    });

    it("throws away JSON that leaked through as a string", () => {
        // Literally what the server sends for some rows.
        expect(splitFacet(['["Washed"]'])).toEqual(["Washed"]);
        expect(splitFacet(['["Washed","Natural"]'])).toEqual(["Washed", "Natural"]);
    });

    it("drops blanks, trims, and de-duplicates", () => {
        expect(splitFacet(["  Washed  ", "", "Washed", null as unknown as string]))
            .toEqual(["Washed"]);
    });

    it("survives a missing facet entirely", () => {
        expect(splitFacet(null)).toEqual([]);
        expect(splitFacet(undefined)).toEqual([]);
    });
});

describe("normalising a row", () => {
    it("repairs a name that was decoded with the wrong codepage", () => {
        // "\u00ac\u2211" is the UTF-8 bytes of "\u00b7" read as Mac Roman. It is in real
        // recipe names, and it renders as visible rubbish.
        expect(normaliseHubRow(row({
            recipeName: "Colombia Washed \u00ac\u2211 Double Anaerobic"
        })).name).toBe("Colombia Washed \u00b7 Double Anaerobic");
    });

    it("reads an unset roast as unset rather than as the lightest", () => {
        // 479 of 3,020 rows are 0 or null. Showing those as "Light Roast"
        // would be inventing a fact about somebody's coffee.
        expect(normaliseHubRow(row({roast: 0})).roast).toBeNull();
        expect(normaliseHubRow(row({roast: null})).roast).toBeNull();
        expect(normaliseHubRow(row({roast: 3})).roast).toBe(3);
    });

    it("keeps the share link verbatim, because the importer parses it", () => {
        const link = "https://share-h5.xbloom.com/?id=MiGJDhQMUdG%2BttuEO8p8aQ%3D%3D";
        expect(normaliseHubRow(row({shareRecipeLink: link})).shareLink).toBe(link);
    });

    it("reads the volume, which arrives as a string on every row", () => {
        expect(normaliseHubRow(row({volume: "240"})).volume).toBe(240);
    });

    it("survives a volume the wire type says cannot happen", () => {
        // Checked across all 2,966 coffee rows: `volume` is always a non-empty
        // string, which is why `HubListRow` types it that way. This file is
        // the quarantine, though, so the defence stays and the cast is the
        // honest way to say these were never seen rather than pretending the
        // wire is looser than it is.
        const off = (volume: unknown) => row({volume} as Partial<HubListRow>);
        expect(normaliseHubRow(off(240)).volume).toBe(240);
        expect(normaliseHubRow(off(null)).volume).toBeNull();
        expect(normaliseHubRow(off("")).volume).toBeNull();
        expect(normaliseHubRow(off("not a number")).volume).toBeNull();
    });

    it("says whether a row is xBloom's own", () => {
        expect(normaliseHubRow(row({official: 1})).official).toBe(true);
        expect(normaliseHubRow(row({official: 2})).official).toBe(false);
    });

    it("gives a row with no author an empty author rather than the word null", () => {
        expect(normaliseHubRow(row({userName: null})).author).toBe("");
    });

    it("does not carry the likes count forward at all", () => {
        // Every figure in the catalogue sits in the same narrow band, so it is
        // not a popularity signal. Not displayed, and therefore not modelled:
        // a field on the type is an invitation to show it.
        expect("likes" in normaliseHubRow(row())).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/hub/__tests__/hubRow.test.ts`
Expected: FAIL, `Cannot find module '@/library/hub/hubRow'`.

- [ ] **Step 3: Write the normaliser**

Create `library/hub/hubRow.ts`:

```ts
/**
 * One catalogue row, cleaned up.
 *
 * The catalogue's metadata is dirty in ways that are inherited rather than
 * fixable, so this is the one place in the app that knows about any of it.
 * Nothing downstream should ever split a string or second-guess a roast.
 *
 * Deliberately does not import `Recipe`. A hub row is a thing you are looking
 * at; it becomes a recipe only when somebody saves it, and only through the
 * existing share-link importer.
 */
import type {HubListRow} from "./hubApi";

/** The separators official rows use to pre-join a facet array into one element. */
const JOINERS = /[\u00b7\u2022\u30fb\uff65\u3001,;]/;

/**
 * Mojibake seen in real recipe names.
 *
 * These are UTF-8 bytes that were decoded as Mac Roman somewhere upstream of
 * us, most often a middle dot. Repaired rather than stripped, because the
 * character is doing real work as a separator in the name.
 */
const MISDECODED: [string, string][] = [
    ["\u00ac\u2211", "\u00b7"],
    ["\u00e2\u0080\u00a2", "\u2022"],
    ["\u00e2\u0080\u0099", "\u2019"]
];

export type HubRecipe = {
    id: number;
    name: string;
    imageURL: string | null;
    author: string;
    official: boolean;
    machine: string;
    cupType: string;
    coffeeType: string;
    origin: string[];
    varietal: string[];
    process: string[];
    flavour: string[];
    /** 1 to 5, or null when the row does not say. */
    roast: number | null;
    dose: number;
    grind: number;
    rpm: number;
    pourCount: number;
    ratio: number;
    volume: number | null;
    shareLink: string;
};

function repair(text: string): string {
    return MISDECODED.reduce((out, [wrong, right]) => out.split(wrong).join(right), text).trim();
}

/**
 * Turn a facet array into the list of values it was trying to be.
 *
 * Three shapes arrive here. A genuine array (`["Washed", "Natural"]`), a single
 * element with the whole list joined into it, and a single element that is
 * unparsed JSON the server stringified by accident.
 *
 * The plain-space separator is the awkward one and is why `vocabulary` exists.
 * "Washed Thermal Shock" is one process and "Costa Rica" is one country, so a
 * blind split on spaces would shred more rows than it rescued. A space is only
 * treated as a separator when neither real separator is present and **every**
 * piece is a value the server's own vocabulary lists. Without a vocabulary,
 * spaces are left alone.
 */
export function splitFacet(
    values: readonly (string | null)[] | null | undefined,
    vocabulary: readonly string[] = []
): string[] {
    if (!values) return [];
    const out: string[] = [];

    for (const raw of values) {
        if (typeof raw !== "string") continue;
        const text = repair(raw);
        if (text === "") continue;

        if (text.startsWith("[") && text.endsWith("]")) {
            try {
                const parsed: unknown = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    out.push(...parsed.filter((v): v is string => typeof v === "string"));
                    continue;
                }
            } catch {
                // Not JSON after all. Fall through and treat it as text, which
                // is better than dropping a value because of a stray bracket.
            }
        }

        const joiner = JOINERS.find((j) => text.includes(j));
        if (joiner !== undefined) {
            out.push(...text.split(joiner));
            continue;
        }

        const pieces = text.split(/\s+/);
        const known = new Set(vocabulary.map((v) => v.toLowerCase()));
        if (pieces.length > 1 && pieces.every((p) => known.has(p.toLowerCase()))) {
            out.push(...pieces);
            continue;
        }

        out.push(text);
    }

    const seen = new Set<string>();
    return out
        .map((value) => value.trim())
        .filter((value) => {
            if (value === "" || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

/** What the browse and detail screens actually read. */
export function normaliseHubRow(
    raw: HubListRow,
    vocabulary: {origin?: readonly string[]; process?: readonly string[]} = {}
): HubRecipe {
    const volume = typeof raw.volume === "number"
        ? raw.volume
        : typeof raw.volume === "string" && raw.volume.trim() !== ""
            ? Number(raw.volume)
            : null;

    return {
        id: raw.communityRecipeId,
        name: repair(raw.recipeName ?? ""),
        imageURL: raw.imageUrl === "" ? null : raw.imageUrl,
        author: repair(raw.userName ?? ""),
        official: raw.official === 1,
        machine: raw.model ?? "",
        cupType: raw.cupType ?? "",
        coffeeType: repair(raw.type ?? ""),
        origin: splitFacet(raw.origin, vocabulary.origin),
        varietal: splitFacet(raw.varietal),
        process: splitFacet(raw.process, vocabulary.process),
        flavour: splitFacet(raw.flavor),
        // 0 and null both mean "not stated", and 479 of 3,020 rows are in that
        // state. Anything that treated 0 as an index would show them all as
        // the lightest roast, which is a fact about somebody's coffee that
        // nobody told us.
        roast: raw.roast === null || raw.roast === 0 ? null : raw.roast,
        dose: raw.dose,
        grind: raw.grinderSize,
        rpm: raw.rpm,
        pourCount: raw.pourCount,
        // `grandWater` is the ratio, not a water figure, despite the name:
    // a live row reads dose 15, grandWater 16, volume "240", and 15 x 16 = 240.
    ratio: raw.grandWater,
        volume: volume === null || Number.isNaN(volume) ? null : volume,
        shareLink: raw.shareRecipeLink
    };
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest library/hub/__tests__/hubRow.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the space rule with real data**

Run this and read the output. It is a check on judgement, not an assertion:

```bash
curl -s -X POST https://collective-api.xbloom.com/communityRecipe/index/page \
  -H 'Content-Type: application/json' \
  -d '{"pageIndex":1,"pageSize":100,"recipeType":1,"machineList":["J15"]}' \
  | python3 -c "import json,sys; [print(repr(r['process'])) for r in json.load(sys.stdin)['data']['list'] if r.get('process')]" | sort | uniq -c | sort -rn | head -20
```

Expected: a spread of single values, some joined with `·` or `•`, and some
multi-word processes such as `Washed Thermal Shock`. If a multi-word process
would have been shredded by the rule you wrote, fix the rule, not the test.

- [ ] **Step 6: Commit**

```bash
git add library/hub/hubRow.ts library/hub/__tests__/hubRow.test.ts
git commit -m "Contain the catalogue's mess in one file" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: The vocabularies

**Files:**
- Create: `library/hub/hubCriteria.ts`
- Test: `library/hub/__tests__/hubCriteria.test.ts`

The chips filter by the server's own ids rather than by free text, which is the
only thing that keeps filtering correct on rows whose own text is malformed. A
row filed under origin `Colombia` still answers an origin filter for Colombia
even when its name says Brazil.

- [ ] **Step 1: Write the failing test**

Create `library/hub/__tests__/hubCriteria.test.ts`:

```ts
/**
 * The facet vocabularies, and the one fetch that gets them.
 *
 * `fetchHubCriteria` is mocked at the module boundary rather than through
 * `global.fetch`, because what is being tested here is the caching and the
 * roast mapping, not the wire.
 */
import {loadHubCriteria, roastLabel, __resetHubCriteria} from "@/library/hub/hubCriteria";

const mockFetch = jest.fn();
jest.mock("@/library/hub/hubApi", () => ({
    ...jest.requireActual("@/library/hub/hubApi"),
    fetchHubCriteria: (...args: unknown[]) => mockFetch(...args)
}));

const CRITERIA = {
    originList: [{name: "Brazil", value: "1"}, {name: "Colombia", value: "5"}],
    varietalList: [{name: "Bourbon", value: "23"}],
    roastList: [
        {name: "Light Roast", value: "1"},
        {name: "Medium-Light Roast", value: "2"},
        {name: "Medium Roast", value: "3"}
    ],
    flavorList: [{name: "Apple", value: "47"}],
    machineList: [{name: "Studio", value: "J15"}, {name: "Original", value: "J20"}],
    cupTypeList: [{name: "xPod", value: "1"}],
    processingList: [{name: "Washed", value: "87"}],
    coffeeTypeList: [{name: "Single Origin", value: "95"}]
};

beforeEach(() => {
    __resetHubCriteria();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(CRITERIA);
});

describe("loading the vocabularies", () => {
    it("fetches them once and holds them for the session", async () => {
        // 28 origins, 49 varietals and 93 flavours do not change while
        // somebody is browsing, and every chip needs them.
        await loadHubCriteria();
        await loadHubCriteria();

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not fetch twice for two callers that overlap", async () => {
        // The screen opens and asks; a chip mounts and asks before the first
        // answer has landed. One request, both answered.
        const [a, b] = await Promise.all([loadHubCriteria(), loadHubCriteria()]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
    });

    it("lets a failed load be retried", async () => {
        // A cached rejection would mean one flight-mode moment cost the chips
        // for the whole session.
        mockFetch.mockRejectedValueOnce(new Error("offline"));

        await expect(loadHubCriteria()).rejects.toThrow("offline");
        await expect(loadHubCriteria()).resolves.toBe(CRITERIA);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});

describe("naming a roast", () => {
    it("names one the row stated", () => {
        expect(roastLabel(2, CRITERIA)).toBe("Medium-Light Roast");
    });

    it("says nothing about a roast the row left unset", () => {
        // `normaliseHubRow` has already turned 0 into null. This is the other
        // half of the same rule: no label, rather than a guessed one.
        expect(roastLabel(null, CRITERIA)).toBeNull();
    });

    it("says nothing about a roast outside the vocabulary", () => {
        expect(roastLabel(9, CRITERIA)).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/hub/__tests__/hubCriteria.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `library/hub/hubCriteria.ts`:

```ts
/**
 * The catalogue's own filter vocabularies.
 *
 * Filtering goes through the server's ids rather than through the text on a
 * row, and that is deliberate: the text is dirty. `Brazil Anaerobic Honey` is
 * filed under origin Colombia, and its description is about a third lot again.
 * An id filter still returns it for Colombia, which is the honest answer to
 * "what does the catalogue think this is". Free-text search alone would miss
 * every row whose own text is wrong.
 *
 * Held for the session rather than persisted. 28 origins, 49 varietals and 93
 * flavours are not worth a migration, and they are wanted only while somebody
 * is actually browsing.
 */
import {fetchHubCriteria, type HubCriteria} from "./hubApi";

let held: HubCriteria | null = null;
let inFlight: Promise<HubCriteria> | null = null;

/**
 * The vocabularies, fetched at most once.
 *
 * The in-flight promise is shared so that a screen and a chip mounting
 * together make one request rather than two, and it is cleared on failure so a
 * user who was in a tunnel can try again. A cached rejection would cost the
 * chips for the rest of the session.
 */
export function loadHubCriteria(signal?: AbortSignal): Promise<HubCriteria> {
    if (held !== null) return Promise.resolve(held);
    if (inFlight !== null) return inFlight;

    inFlight = fetchHubCriteria(signal)
        .then((criteria) => {
            held = criteria;
            inFlight = null;
            return criteria;
        })
        .catch((error: unknown) => {
            inFlight = null;
            throw error;
        });

    return inFlight;
}

/** The vocabularies if they are already here, for a caller that cannot wait. */
export function heldHubCriteria(): HubCriteria | null {
    return held;
}

/** Tests only. Production has one session and never needs to forget. */
export function __resetHubCriteria(): void {
    held = null;
    inFlight = null;
}

/**
 * What to call a roast, or nothing.
 *
 * The vocabulary's `value` is a string and a row's `roast` is an int, so the
 * comparison has to go through `String`. A roast this list does not describe
 * gets no label rather than a nearest guess: `podCoffee.ts` already applies
 * that rule to roast, and an invented value is worse than no value.
 */
export function roastLabel(roast: number | null, criteria: HubCriteria | null): string | null {
    if (roast === null || criteria === null) return null;
    return criteria.roastList.find((item) => item.value === String(roast))?.name ?? null;
}

/** The plain names of a vocabulary, for `splitFacet`'s space rule. */
export function vocabularyNames(items: readonly {name: string}[] | undefined): string[] {
    return (items ?? []).map((item) => item.name);
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest library/hub/__tests__/hubCriteria.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add library/hub/hubCriteria.ts library/hub/__tests__/hubCriteria.test.ts
git commit -m "Filter on the catalogue's own vocabulary, not on its text" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: The one search request

**Files:**
- Create: `library/hub/hubQuery.ts`
- Test: `library/hub/__tests__/hubQuery.test.ts`

The same shape `library/libraryQuery.ts` has for the library: one place that
turns the rail's question into the request, so a screen never assembles one.

- [ ] **Step 1: Write the failing test**

Create `library/hub/__tests__/hubQuery.test.ts`:

```ts
/**
 * The rail's question, turned into the one request that answers it.
 *
 * Pure. No fetch, no mocks. The point of this file existing is that a screen
 * can never build a request of its own, the way no screen builds a library SQL
 * statement.
 */
import {buildHubRequest, EMPTY_HUB_QUERY, HUB_SORTS, machineCode} from "@/library/hub/hubQuery";

describe("which machine is asked about", () => {
    it("asks about the machine the user owns", () => {
        expect(machineCode("studio")).toBe("J15");
        expect(machineCode("original")).toBe("J20");
    });

    it("never asks about both at once", () => {
        // The catalogue publishes the same recipe once per machine, so asking
        // for both returns every recipe twice with different grind numbers and
        // no way to tell which is yours. And the grind scales do not convert:
        // best linear fit R^2 = 0.444 over 1,053 pairs.
        expect(buildHubRequest(EMPTY_HUB_QUERY, "studio", 1).machineList).toEqual(["J15"]);
        expect(buildHubRequest(EMPTY_HUB_QUERY, "original", 1).machineList).toEqual(["J20"]);
    });
});

describe("building the request", () => {
    it("asks for coffee, a hundred at a time, newest first", () => {
        expect(buildHubRequest(EMPTY_HUB_QUERY, "studio", 1)).toEqual({
            pageIndex: 1,
            pageSize: 100,
            recipeType: 1,
            machineList: ["J15"],
            sort: HUB_SORTS.date.sort,
            sortType: HUB_SORTS.date.sortType
        });
    });

    it("leaves an empty keyword out rather than sending an empty string", () => {
        // An undocumented endpoint asked for `keyword: ""` is being asked
        // something, and what it does with it is not written down anywhere.
        expect("keyword" in buildHubRequest({...EMPTY_HUB_QUERY, keyword: "   "}, "studio", 1))
            .toBe(false);
    });

    it("sends a keyword that has something in it", () => {
        expect(buildHubRequest({...EMPTY_HUB_QUERY, keyword: " ethiopia "}, "studio", 1).keyword)
            .toBe("ethiopia");
    });

    it("leaves an empty facet out rather than sending an empty array", () => {
        const request = buildHubRequest(EMPTY_HUB_QUERY, "studio", 1);
        expect("originIds" in request).toBe(false);
        expect("roastList" in request).toBe(false);
        expect("flavorIds" in request).toBe(false);
        expect("processIds" in request).toBe(false);
    });

    it("sends the facets that were chosen", () => {
        const request = buildHubRequest({
            ...EMPTY_HUB_QUERY,
            originIds: ["1", "5"], roastIds: ["2"], processIds: ["87"], flavourIds: ["47"]
        }, "studio", 2);

        expect(request.originIds).toEqual(["1", "5"]);
        expect(request.roastList).toEqual(["2"]);
        expect(request.processIds).toEqual(["87"]);
        expect(request.flavorIds).toEqual(["47"]);
        expect(request.pageIndex).toBe(2);
    });

    it("carries the chosen sort", () => {
        expect(buildHubRequest({...EMPTY_HUB_QUERY, sort: "downloads"}, "studio", 1))
            .toMatchObject({sort: HUB_SORTS.downloads.sort, sortType: 2});
    });

    it("has no sort by likes, because the likes are not a signal", () => {
        // Every likesCount in the catalogue sits in one narrow band, so
        // ordering by it would be ordering by noise while looking like a
        // popularity ranking.
        expect(Object.keys(HUB_SORTS)).toEqual(["date", "downloads"]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/hub/__tests__/hubQuery.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `library/hub/hubQuery.ts`:

```ts
/**
 * The rail's question, and the single request that answers it.
 *
 * `library/libraryQuery.ts` is the same idea for the library: one statement, in
 * one place, so no screen assembles its own. The reason is stronger here,
 * because the endpoint is undocumented and every extra field sent to it is a
 * guess about a server nobody has the source of.
 */
import type {MachineModel} from "@/library/machine/machineModel";

import type {HubPageRequest} from "./hubApi";

/** How many rows a page holds. The server honours 100. */
export const HUB_PAGE_SIZE = 100;

/**
 * The orders the catalogue can be put in.
 *
 * Likes are missing on purpose. Every `likesCount` in the catalogue sits in one
 * narrow band, so an order by likes would be an order by noise wearing the
 * clothes of a popularity ranking.
 */
export const HUB_SORTS = {
    date: {label: "NEWEST", sort: 1, sortType: 2},
    downloads: {label: "MOST SAVED", sort: 3, sortType: 2}
} as const;

export type HubSort = keyof typeof HUB_SORTS;

export type HubQuery = {
    keyword: string;
    originIds: readonly string[];
    roastIds: readonly string[];
    processIds: readonly string[];
    flavourIds: readonly string[];
    sort: HubSort;
};

export const EMPTY_HUB_QUERY: HubQuery = {
    keyword: "",
    originIds: [],
    roastIds: [],
    processIds: [],
    flavourIds: [],
    sort: "date"
};

/** Whether the rail is asking for anything narrower than the whole catalogue. */
export function hubQueryIsNarrowed(query: HubQuery): boolean {
    return query.keyword.trim() !== ""
        || query.originIds.length > 0
        || query.roastIds.length > 0
        || query.processIds.length > 0
        || query.flavourIds.length > 0;
}

/** The catalogue's code for a machine. */
export function machineCode(model: MachineModel): string {
    return model === "original" ? "J20" : "J15";
}

/**
 * Build the page request.
 *
 * The machine is not a filter the user can change. The catalogue publishes the
 * same recipe once per machine with independently retuned grind numbers, so
 * browsing the other machine's half would hand somebody a grind that is wrong
 * for the machine they own, and nothing in the app can correct it: the scales
 * do not convert. Across 1,053 pairs the best linear fit is R^2 = 0.444 and
 * lands within two grind steps one time in five.
 *
 * Empty fields are omitted rather than sent empty. The endpoint is
 * undocumented, and an empty array or an empty string is still an instruction.
 */
export function buildHubRequest(
    query: HubQuery, model: MachineModel, pageIndex: number
): HubPageRequest {
    const order = HUB_SORTS[query.sort];
    const request: HubPageRequest = {
        pageIndex,
        pageSize: HUB_PAGE_SIZE,
        recipeType: 1,
        machineList: [machineCode(model)],
        sort: order.sort,
        sortType: order.sortType
    };

    const keyword = query.keyword.trim();
    if (keyword !== "") request.keyword = keyword;
    if (query.originIds.length > 0) request.originIds = [...query.originIds];
    if (query.roastIds.length > 0) request.roastList = [...query.roastIds];
    if (query.processIds.length > 0) request.processIds = [...query.processIds];
    if (query.flavourIds.length > 0) request.flavorIds = [...query.flavourIds];

    return request;
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest library/hub/__tests__/hubQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Check the request the real server accepts**

```bash
curl -s -X POST https://collective-api.xbloom.com/communityRecipe/index/page \
  -H 'Content-Type: application/json' \
  -d '{"pageIndex":1,"pageSize":100,"recipeType":1,"machineList":["J20"],"sort":1,"sortType":2,"originIds":["5"]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d['total'], [r['origin'] for r in d['list'][:3]], [r['model'] for r in d['list'][:3]])"
```

Expected: a non-zero total, origins that are Colombia, and every `model` being
`Original`. If the origin ids differ from the ones in your criteria response,
the vocabulary is the truth; do not hardcode any id.

- [ ] **Step 6: Commit**

```bash
git add library/hub/hubQuery.ts library/hub/__tests__/hubQuery.test.ts
git commit -m "One request, built in one place" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: A stage plan you do not own yet

**Files:**
- Create: `library/hub/hubStages.ts`
- Test: `library/hub/__tests__/hubStages.test.ts`

The detail screen draws the recipe's stages with `BrewStageLadder`, which takes
`Pour[]`. This is the one file in `library/hub/` allowed to import a domain
type, and `Pour` only. It must not import `Recipe`.

**The trap:** the catalogue's `pattern` numbering is not the app's.
`POUR_PATTERN` is `CENTERED 0, CIRCULAR 1, SPIRAL 2`; the API sends
`1 centered, 2 spiral, 3 circular`. `library/XBloomRecipe.ts:207` already has
this mapping for the share endpoint and it is the same one. Feeding a raw hub
`pattern` to `glyphForPattern` would draw a spiral where the recipe says
centred, on every single row.

- [ ] **Step 1: Write the failing test**

Create `library/hub/__tests__/hubStages.test.ts`:

```ts
/**
 * Turning a catalogue stage plan into pours the ladder can draw.
 *
 * The recipe is not owned at this point and must not be: this produces `Pour`
 * objects for a drawing, not a `Recipe` for a library.
 */
import type {HubPour} from "@/library/hub/hubApi";
import {hubPours} from "@/library/hub/hubStages";
import {POUR_PATTERN} from "@/library/Pour";

function stage(over: Partial<HubPour> = {}): HubPour {
    return {theName: "Bloom", volume: 60, temperature: 95, pausing: 40, pattern: 3, ...over};
}

describe("reading a catalogue stage plan", () => {
    it("maps the catalogue's pattern numbers onto the app's", () => {
        // The two numberings disagree and neither is wrong. Getting this
        // backwards draws a spiral on a recipe that says centred, everywhere.
        expect(hubPours([stage({pattern: 1})])[0].pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(hubPours([stage({pattern: 2})])[0].pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(hubPours([stage({pattern: 3})])[0].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
    });

    it("falls back to circular for a pattern it has not met", () => {
        // What `XBloomRecipe` already does with the share endpoint's plans.
        expect(hubPours([stage({pattern: 9})])[0].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
    });

    it("numbers the pours from one", () => {
        const pours = hubPours([stage(), stage({theName: "Pour2"})]);
        expect(pours.map((p) => p.pourNumber)).toEqual([1, 2]);
    });

    it("carries volume, temperature and pause across", () => {
        const [pour] = hubPours([stage({volume: 45, temperature: 92, pausing: 17})]);
        expect(pour.volume).toBe(45);
        expect(pour.temperature).toBe(92);
        expect(pour.pauseTime).toBe(17);
    });

    it("leaves the flow rate unset, because the catalogue does not say", () => {
        // `pourSeconds` already falls back to the default flow for a pour with
        // no flow rate. Writing a number in here would be inventing one, and
        // the ladder would draw it as though the recipe had asked for it.
        expect(hubPours([stage()])[0].flowRate).toBeLessThanOrEqual(0);
    });

    it("leaves agitation alone, because the catalogue does not say", () => {
        // `Pour.agitation` starts at -1, and every bit of -1 is set, so
        // reading `agitationBefore` off an unset pour returns true. The ladder
        // does not read it; nothing here should set it either way.
        expect(hubPours([stage()])[0].agitation).toBe(-1);
    });

    it("survives a plan the server did not send", () => {
        expect(hubPours(null)).toEqual([]);
        expect(hubPours([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/hub/__tests__/hubStages.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `library/hub/hubStages.ts`:

```ts
/**
 * A catalogue stage plan, as pours the brew ladder can draw.
 *
 * The only file under `library/hub/` that imports a domain type, and it imports
 * `Pour` alone. A hub row is something you are looking at; it becomes a
 * `Recipe` only at save, through the share-link importer, which is also the
 * only thing that knows how to fill in everything this drawing does not need.
 */
import Pour, {POUR_PATTERN} from "@/library/Pour";

import type {HubPour} from "./hubApi";

/**
 * The catalogue's pattern numbering is not the app's.
 *
 * `POUR_PATTERN` is CENTERED 0, CIRCULAR 1, SPIRAL 2, and the wire sends
 * 1 centered, 2 spiral, 3 circular. `library/XBloomRecipe.ts` maps the share
 * endpoint's plans with the same table. Circular is the fallback there too.
 */
function patternOf(wire: number): number {
    switch (wire) {
        case 1: return POUR_PATTERN.CENTERED;
        case 2: return POUR_PATTERN.SPIRAL;
        case 3: return POUR_PATTERN.CIRCULAR;
        default: return POUR_PATTERN.CIRCULAR;
    }
}

/**
 * Build the pours.
 *
 * Flow rate and agitation are deliberately left at `Pour`'s defaults. The
 * catalogue does not carry either, `pourSeconds` already falls back to the
 * default flow for a pour that has no rate, and a number written in here would
 * be drawn as though the recipe had asked for it.
 */
export function hubPours(plan: readonly HubPour[] | null | undefined): Pour[] {
    if (!plan) return [];
    return plan.map((stage, index) => new Pour(
        index + 1,
        stage.volume,
        stage.temperature,
        undefined,
        undefined,
        patternOf(stage.pattern),
        stage.pausing
    ));
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest library/hub/__tests__/hubStages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add library/hub/hubStages.ts library/hub/__tests__/hubStages.test.ts
git commit -m "Draw a plan before the recipe is owned" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: The browse state machine (rewritten after the amendment)

**Files:**
- Create: `hooks/useHubBrowse.ts`
- Test: `hooks/__tests__/useHubBrowse.test.ts`

> **This task was rewritten.** The version written before the amendment drove a
> server paging state machine: `wanted`, `answer`, `more()`, `hasMore`, and
> facets held as the server's ids. None of that survives. The server's filters
> were measured not to work, the whole partition now arrives locally in under
> three seconds, and every question is answered over the rows in hand. Read
> this version, not the one in the history.

Everything stateful about browsing lives here, so `app/hub.tsx` stays close to
layout. This is the same division `useLibraryQuery` and `app/index.tsx` have.

**What the hook owns now:**

1. **One load, started once.** `loadHubCatalogue(model, onProgress, signal)`
   for the machine the user set. It is session-cached per machine, so a second
   mount is free and the hook does not need to know that.
2. **Progressive arrival.** `onProgress` fires after every page with the rows so
   far. The hook holds those rows and the page counters, so the screen can draw
   the first hundred immediately and keep drawing.
3. **The question**, as a `HubQuery`: keyword, four value facets, roasts, sort.
4. **The answer**, computed at render from the rows in hand:
   `sortHubRows(rows.filter((r) => matchesHubQuery(r, query)), query.sort)`.
5. **The chips**, from `hubFacetCounts(rows, facet)`, so a chip can never offer
   a value that finds nothing.
6. **Three states that must stay distinct**, because two of them are different
   claims about the world:
   - `failed` — the load threw. A broken connection.
   - `arriving` — rows are still coming.
   - `empty` — the load finished, rows arrived, and the *question* matches none
     of them.
   The screen must never say "nothing here" on the evidence of a failure.

**The React Compiler constraints that shape this file.**
`react-hooks/set-state-in-effect` is an **error**, so no state may be set
synchronously in an effect body. A setter called from an asynchronous callback
the effect started is fine, because it is an event and not a render. So the
effect starts the load and sets state only inside `onProgress` and in the
promise's `.then`/`.catch`.

Do not hand-write `useMemo` or `useCallback`; the compiler owns that.
Destructure rather than reading a whole options object inside the hook.
`try`/`finally` bails the compiler out of the whole component, so use
`.then`/`.catch`, not `await` in a `try`.

**The machine.** `useSetting("machineModel")` gives the `MachineModel`. When it
changes, the question stays but the rows are the other machine's, so the hook
must reload and must not show the old partition against the new machine's name.
Hold the rows together with the model they came from and discard them at render
when the two disagree, which is the house answer (`hooks/useTraceAnimation.ts`'s
`ticked.phase`, `hooks/useBrewRun.ts`'s `heard.from`).

**The shape:**

```ts
export type HubBrowse = {
    /** The rows that match the question, in the chosen order. */
    rows: HubRecipe[];
    /** Every row of this machine's partition that has arrived. */
    all: HubRecipe[];
    query: HubQuery;
    /** True until the last page lands. */
    arriving: boolean;
    /** Pages in and pages expected, for a progress line. */
    page: number;
    totalPage: number;
    /** Set if the load threw. A broken connection, not an empty catalogue. */
    failed: HubApiError | Error | null;
    setKeyword(keyword: string): void;
    setSort(sort: HubSort): void;
    /** Replace one facet wholesale, which is what the filter sheet reports. */
    setFacet(facet: HubFacet, values: readonly string[]): void;
    /** Add or remove one value, which is what a rail chip does. */
    toggleFacet(facet: HubFacet, value: string): void;
    setRoasts(roasts: readonly number[]): void;
    clearQuery(): void;
    /** Commonest first, counted over `all`. Never offers a value finding zero. */
    chips(facet: HubFacet): {value: string; count: number}[];
    /** Try the load again after a failure. */
    retry(): void;
};
```

`HubFacet` is `"origins" | "processes" | "varietals" | "flavours"`, which
`hubQuery.ts` already names in `hubFacetCounts`'s signature; export it there if
it is not exported yet.

**Keyword debounce.** The rail's field types into this hook. Filtering 1,300
rows locally is fast enough that a debounce is not needed for the work, but it
is needed so the list does not thrash a character at a time. `hooks/useRailSearch.ts`
already owns exactly this for the library rail. **Read it first** and reuse it
rather than writing a second debounce; if its shape does not fit, say so in
your report rather than duplicating it.

- [ ] **Step 1: Write the failing tests**

Create `hooks/__tests__/useHubBrowse.test.ts`. Mock at the **catalogue**
boundary, not the wire, because what is under test is the state machine:

```ts
jest.mock("@/library/hub/hubCatalogue", () => ({
    loadHubCatalogue: (...args: unknown[]) => mockLoad(...args),
    __resetHubCatalogue: () => {}
}));
```

`mockLoad` should call its `onProgress` argument more than once, so progressive
arrival is actually exercised rather than assumed.

Cover at least:

1. **Rows arrive progressively.** Two `onProgress` calls, and after the first
   the hook already reports rows and `arriving` true; after the promise settles,
   `arriving` is false.
2. **A filter narrows locally.** `toggleFacet("origins", "Colombia")` leaves only
   the Colombian rows, with no second network call. Assert `mockLoad` was called
   **once**.
3. **`setFacet` replaces rather than adds**, which is what the sheet reports.
4. **Chips never offer nothing.** Every value `chips("origins")` returns finds
   at least one row when applied as a filter. Assert the counts equal the filter
   results, since that agreement is the whole promise of the chip.
5. **Empty and failed are different.** A load that throws leaves `failed` set
   and `rows` empty; a load that succeeds against a question matching nothing
   leaves `failed` null and `rows` empty. A test must be able to tell them apart
   from the hook's surface alone.
6. **`retry()` after a failure loads again** and clears `failed`.
7. **Changing the machine does not show the other machine's rows.** Assert that
   at no observed render do rows from the first model appear while the setting
   says the second.
8. **Sort is local.** `setSort("name")` reorders without a network call.
9. **Unmounting mid-load does not set state.** Follow the house pattern:
   `await act(async () => { unmount(); })`, then settle the pending promise and
   assert no warning and no call.

Remember: RNTL v14's `renderHook` is **async** — omit the `await` and `result`
is `undefined`. Wrap `unmount()` in `await act(...)`.

Use `require("@/test-utils/settingsMock").settingsMock()` to mock
`@/hooks/useSetting`, the way the existing hook tests do. **Read
`test-utils/settingsMock.ts` first** and follow whatever shape it actually has.

- [ ] **Step 2: Implement `hooks/useHubBrowse.ts`**

Write it to pass the tests. Keep the file about the state machine; anything
about matching, sorting or counting belongs in `hubQuery.ts` and is already
there.

- [ ] **Step 3: Verify**

`npx jest hooks/__tests__/useHubBrowse.test.ts`, `npm run typecheck`,
`npx eslint hooks library`. Zero lint errors. Mutation-test every guard,
especially the one keeping `empty` and `failed` apart and the one discarding
the other machine's rows.


## Task 7: One catalogue row

**Files:**
- Modify: `library/hub/hubRow.ts` (add `hubAccent`)
- Create: `components/HubRow.tsx`
- Test: `components/__tests__/HubRow.test.tsx`

The row is photo-led: a 104 pt bag shot, the name in Inter, origin and process
in Doto caps, and dose, ratio and grind as accented Doto figures.

**Why not `SelectableRecipeRow`.** It takes a `Recipe`, and a hub row must not
become one before somebody saves it. What is copied from it deliberately is the
interaction: the same 26 pt tick, the same `accessibilityRole="checkbox"` and
`accessibilityState.checked`, so multi-select here is the interaction the shelf
member picker already teaches rather than a second one to learn.

- [ ] **Step 1: Add the accent**

Append to `library/hub/hubRow.ts`:

```ts
/**
 * A stable colour for a catalogue row.
 *
 * Not `resolveAccent`: that one needs a `Recipe` and writes an accent index
 * onto it, and a hub row is not owned by anybody. Keyed on the catalogue id so
 * the browse row and the detail screen agree about a recipe's colour, and so
 * the same recipe looks the same on the way back to it.
 */
export function hubAccent(id: number): string {
    return accents.coffee[Math.abs(id) % accents.coffee.length];
}
```

with `import {accents} from "@/constants/colors";` at the top. Note that this
makes `hubRow.ts` import from `constants/`, which is fine: `constants/colors.ts`
is a plain module with no React in it. It still must not import `Recipe`.

- [ ] **Step 2: Write the failing test**

Create `components/__tests__/HubRow.test.tsx`:

```tsx
/**
 * One row of the catalogue.
 *
 * RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so
 * these assert on what the renderer produced -- text, test ids and accessible
 * state -- rather than on a child's props.
 */
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import HubRow from "@/components/HubRow";
import type {HubRecipe} from "@/library/hub/hubRow";
import {renderWithProviders} from "@/test-utils/render";

function recipe(over: Partial<HubRecipe> = {}): HubRecipe {
    return {
        id: 164, name: "Brian's Recipe", imageURL: "https://example.com/a.png",
        author: "xBloom Official", official: true, machine: "Studio",
        cupType: "xPod", coffeeType: "Single Origin", origin: ["Colombia"],
        varietal: ["Mix"], process: ["Washed"], flavour: [], roast: 1,
        dose: 15, grind: 52, rpm: 120, pourCount: 5, ratio: 16, volume: 240,
        shareLink: "https://share-h5.xbloom.com/?id=abc", ...over
    };
}

describe("a catalogue row", () => {
    it("shows the name, the origin and the process", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.getByText("Brian's Recipe")).toBeTruthy();
        expect(screen.getByText(/COLOMBIA/)).toBeTruthy();
        expect(screen.getByText(/WASHED/)).toBeTruthy();
    });

    it("shows dose, ratio and grind", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.getByTestId("hub-row-dose")).toHaveTextContent("15");
        expect(screen.getByTestId("hub-row-ratio")).toHaveTextContent("16");
        expect(screen.getByTestId("hub-row-grind")).toHaveTextContent("52");
    });

    it("never shows a likes count", async () => {
        // Every figure in the catalogue sits in one narrow band, so showing it
        // would dress noise up as a popularity signal.
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-likes")).toBeNull();
    });

    it("says nothing about a roast the catalogue left unset", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe({roast: null})} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-roast")).toBeNull();
    });

    it("is a button when browsing and a checkbox when choosing", async () => {
        // The same control means two things, so it has to say which.
        const {rerender} = await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );
        expect(screen.getByTestId("hub-row-164").props.accessibilityRole).toBe("button");

        await rerender(
            <HubRow recipe={recipe()} selecting selected
                    onPress={() => {}} onLongPress={() => {}}/>
        );
        const row = screen.getByTestId("hub-row-164");
        expect(row.props.accessibilityRole).toBe("checkbox");
        expect(row.props.accessibilityState.checked).toBe(true);
    });

    it("opens on a press and starts choosing on a long press", async () => {
        const onPress = jest.fn();
        const onLongPress = jest.fn();
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={onPress} onLongPress={onLongPress}/>
        );

        await fireEvent.press(screen.getByTestId("hub-row-164"));
        expect(onPress).toHaveBeenCalled();

        await fireEvent(screen.getByTestId("hub-row-164"), "longPress");
        expect(onLongPress).toHaveBeenCalled();
    });

    it("draws without a photo rather than leaving a hole", async () => {
        // 3,020 rows and an S3 bucket in two regions: some will not load.
        await renderWithProviders(
            <HubRow recipe={recipe({imageURL: null})} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-photo")).toBeNull();
        expect(screen.getByTestId("hub-row-photo-blank")).toBeTruthy();
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest components/__tests__/HubRow.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Write it**

Create `components/HubRow.tsx`. Declare it at module scope; a component defined
inside another component's body is a new type on every render and React throws
its state away, a bug this codebase has fixed twice.

Requirements, all of which the tests above pin:

- Root is a `Pressable` with `testID={`hub-row-${recipe.id}`}`,
  `onPress`, `onLongPress`, `accessibilityLabel={recipe.name}`, and
  `accessibilityRole` of `"checkbox"` while `selecting` and `"button"`
  otherwise. When `selecting`, pass `accessibilityState={{checked: selected}}`.
- A 104 pt square photo, `borderRadius={8}`, from
  `import {Image} from "react-native"` with `source={{uri: recipe.imageURL}}`
  and `testID="hub-row-photo"`. Hold a `const [failed, setFailed] = useState(false)`
  and set it from `onError`, exactly as `components/PodSection.tsx` does. When
  there is no URL or it failed, draw a `YStack` of the same size with
  `backgroundColor={palette.raised}` and `testID="hub-row-photo-blank"`.
- The name in Tamagui `Text` (Inter), `numberOfLines={2}`.
- A Doto caps line joining `recipe.origin` and `recipe.process` with `" · "`,
  upper-cased, `color={palette.dim}`, `numberOfLines={1}`. Omit the line
  entirely when both are empty rather than drawing an empty rule.
- A roast line with `testID="hub-row-roast"`, rendered **only** when
  `roastLabel(recipe.roast, heldHubCriteria())` returns a string.
- Three figures in `DotMatrixText` with `color={hubAccent(recipe.id)}` and
  testIDs `hub-row-dose`, `hub-row-ratio`, `hub-row-grind`, each with a
  `palette.muted` Doto caption (`DOSE`, `RATIO`, `GRIND`). Dose is
  `${recipe.dose} g`, ratio is `1:${recipe.ratio}`, grind is the bare number.
- The 26 pt tick from `SelectableRecipeRow`, drawn only while `selecting`:
  a `YStack` of `width={26} height={26} borderRadius={13}`, border
  `selected ? palette.text : palette.line`, fill `selected ? palette.text : palette.none`,
  containing `<DotIcon name="success" size={14} color={onAccent.text}/>` when
  selected.
- No likes anywhere. No `hub-row-likes` test id exists.

All colours from `constants/colors.ts`. No hex literals.

- [ ] **Step 5: Run the test**

Run: `npx jest components/__tests__/HubRow.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add library/hub/hubRow.ts components/HubRow.tsx components/__tests__/HubRow.test.tsx
git commit -m "Draw a catalogue row" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: The chips' picker (rewritten after the amendment)

**Files:**
- Create: `components/HubFilterSheet.tsx`
- Test: `components/__tests__/HubFilterSheet.test.tsx`

> **This task was rewritten.** The version written before the amendment fed the
> sheet the **server's vocabulary** as `{name, value}` pairs with `value` an id,
> on the reasoning that the rows' own text is dirty and the vocabulary is
> clean. That reasoning was right about the text and wrong about the outcome:
> the server does not index against its own vocabulary, so a sheet built from
> it offers 93 flavours that find nothing, and on the Original machine every
> single origin finds nothing. Read this version, not the one in the history.

One sheet, reused by every facet chip. Modelled on `components/BeanFilterSheet.tsx`,
which takes an already-built list and reports the whole new selection back.

**What it is fed now.** `hubFacetCounts(rows, facet)` from `library/hub/hubQuery.ts`,
which returns `{value: string; count: number}[]`, commonest first, counted over
the rows actually in hand. Two consequences that are the whole point:

1. **Every option finds at least one recipe.** The count is not decoration, it
   is the promise. Show it.
2. **The values are the catalogue's own cleaned words**, so what the sheet
   offers and what the chip says are the same string. `hubRow.ts` already did
   the cleaning: splitting run-on lists on six different separators, repairing
   mojibake, and dropping placeholders like `N/A` and `???`.

**The shape:**

```tsx
type Props = {
    open: boolean;
    onOpenChange(open: boolean): void;
    /** What this facet is called on the chip: ORIGIN, PROCESS, VARIETAL, FLAVOUR. */
    title: string;
    /** From `hubFacetCounts`. Commonest first. Never contains a dead option. */
    options: readonly {value: string; count: number}[];
    /** The values currently chosen. */
    selected: readonly string[];
    /** The whole new selection, which is what `setFacet` takes. */
    onChange(values: string[]): void;
};
```

Reporting the **whole new array** rather than one toggle is deliberate and
matches `BeanFilterSheet`: it is what `useHubBrowse`'s `setFacet` takes, and it
lets CLEAR be one call rather than a loop.

**A long list.** Flavours run to hundreds of distinct values once the partition
has landed. The sheet needs to stay usable, so: commonest first (already done
for you), and a filter field if `BeanFilterSheet` has one. **Read
`BeanFilterSheet.tsx` and follow whatever it does** rather than inventing a
second answer. If it has no field and the list would be unusable without one,
say so in your report instead of silently adding one.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/HubFilterSheet.test.tsx`. Pressing a control
inside an `XbrwSheet` needs a retry loop, because during the sheet's entrance
the node is findable but the press is discarded. Use the `pressOnSheet` helper
from `app/__tests__/brewHistory.test.tsx`:

```tsx
async function pressOnSheet(label: string) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
    });
}
```

Cover at least:

1. **Every option is listed, commonest first**, in the order given.
2. **Each option shows its count**, because the count is the promise that the
   option finds something.
3. **Choosing an unchosen option reports the whole new array**, with the new
   value added.
4. **Choosing a chosen option reports the array without it.**
5. **CLEAR reports an empty array**, in one call.
6. **An empty `options` list does not render an empty sheet with no
   explanation.** This happens legitimately while the catalogue is still
   arriving, so it must say something rather than look broken.
7. **The selected options are marked accessibly**, with
   `accessibilityState={{selected: true}}` or whatever `BeanFilterSheet`
   actually uses. Follow it; a picker in this app should feel like the others.

Remember RNTL v14: `render` and `fireEvent` are async, `UNSAFE_getAllByType`
and `root.findAllByType` are gone, and assertions go on rendered text, test IDs
and accessible state. Render via `renderWithProviders` from
`test-utils/render.tsx` and `await` it.

- [ ] **Step 2: Implement `components/HubFilterSheet.tsx`**

Built on `XbrwSheet`, which already wraps the `Dialog` + `Adapt platform="touch"`
+ `Sheet` pattern so no consumer re-derives it. See `ImportSheet.tsx` for a
consumer.

**If this sheet is hosted alongside another open sheet on the same screen,
every open sheet must be named in the host's `screenCovered` guard.** On
Android, `accessibilityViewIsModal` on the sheet does not hide sibling screen
content. That is Task 10's problem, but note it here so Task 10 does not miss it.

- [ ] **Step 3: Verify**

`npx jest components/__tests__/HubFilterSheet.test.tsx`, `npm run typecheck`,
`npx eslint components` with zero errors, and mutation-test every guard.


## Task 9: Saving, one at a time

**Files:**
- Create: `hooks/useHubSave.ts`
- Create: `components/HubSaveBar.tsx`
- Test: `hooks/__tests__/useHubSave.test.ts`
- Test: `components/__tests__/HubSaveBar.test.tsx`

A hub row carries a `shareRecipeLink`, and `parseImportInput` is deliberately
host-agnostic: it accepts any `http(s)` URL with a non-empty `?id=`, checking
neither host nor path, and there is a test in
`library/__tests__/importInput.test.ts` pinning that with `example.com`. So
saving is the existing importer, unmodified.

**Sequential, not parallel.** The endpoint is undocumented and its rate limits
are unknown. Fifty parallel requests is the thing most likely to get the
service account or the app's traffic throttled, and there is nobody to ask.

**Partial failure is reported by name.** A batch that resolves to one boolean
tells somebody who saved forty rows nothing about which three did not land.

**Verified live before this task was dispatched, and all three are worth a test:**

1. **Every row has a share link.** All 100 rows of a sampled page carry
   `shareRecipeLink`, so there is no rowless case to design for. Still guard
   it: this is an undocumented endpoint and the type says it can be absent.

2. **The share link's id is percent-encoded, and the share endpoint rejects it
   that way.** A live link reads
   `https://share-h5.xbloom.com/?id=Nh1muSi2bE%2F0Ttj0jn4eKQ%3D%3D`. Posted with
   the `%2F` and `%3D` intact, `RecipeDetail.html` answers
   `{"info":"The selected recipe does not exist","result":"fail"}`. Posted
   decoded, it answers with the recipe.

   **This already works**, because `parseImportInput` reads the id through
   `url.searchParams.get("id")`, which decodes, and its comment says so. But it
   works by a detail of another module that nothing currently pins from this
   side. **Write a test with a real percent-encoded hub link** asserting the id
   handed to `XBloomRecipe` is the decoded one. Without it, a future change to
   that parser breaks every hub save and no test says why.

3. **`XBloomRecipe`'s constructor takes two arguments**: `(source: ImportSource,
   model: MachineModel)`. The model comes from `useSetting("machineModel")`.
   It only changes the request for a pod code, not for a share link, but pass
   it correctly anyway. `getRecipe()` returns `Recipe | null`, so the null is
   a case, not an impossibility.

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useHubSave.test.ts`:

```ts
/**
 * Saving catalogue rows into the library.
 *
 * `XBloomRecipe` is mocked at the module boundary: what is under test is the
 * sequencing, the de-duplication and the partial-failure reporting, and the
 * share endpoint has its own tests.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useHubSave} from "@/hooks/useHubSave";
import type {HubRecipe} from "@/library/hub/hubRow";
import Recipe from "@/library/Recipe";

const mockFetchDetail = jest.fn();
const mockGetRecipe = jest.fn();
const mockConstructed: unknown[] = [];

jest.mock("@/library/XBloomRecipe", () => ({
    __esModule: true,
    XBloomRecipe: class {
        constructor(...args: unknown[]) { mockConstructed.push(args); }
        fetchRecipeDetail(...args: unknown[]) { return mockFetchDetail(...args); }
        getRecipe() { return mockGetRecipe(); }
    }
}));

const mockUpdate = jest.fn();
const mockAll = jest.fn(() => [] as Recipe[]);
jest.mock("@/library/RecipeDatabase", () => ({
    __esModule: true,
    default: class {
        updateRecipe(...args: unknown[]) { return mockUpdate(...args); }
        getRecipes() { return mockAll(); }
    }
}));

jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

function hubRow(id: number): HubRecipe {
    return {
        id, name: `Recipe ${id}`, imageURL: null, author: "xBloom Official",
        official: true, machine: "Studio", cupType: "xPod",
        coffeeType: "Single Origin", origin: [], varietal: [], process: [],
        flavour: [], roast: null, dose: 15, grind: 52, rpm: 120, pourCount: 3,
        ratio: 16, volume: 240, shareLink: `https://share-h5.xbloom.com/?id=${id}`
    };
}

function madeUpRecipe(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

beforeEach(() => {
    mockFetchDetail.mockReset().mockResolvedValue(undefined);
    mockGetRecipe.mockReset().mockImplementation(() => madeUpRecipe("Saved"));
    mockUpdate.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockConstructed.length = 0;
});

describe("saving one row", () => {
    it("parses the share link and writes the recipe", async () => {
        const {result} = await renderHook(() => useHubSave());

        await act(async () => { await result.current.save([hubRow(7)]); });

        expect(mockConstructed[0][0]).toEqual({kind: "share", id: "7"});
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("asks the importer for the machine the user owns", async () => {
        // The share endpoint ignores it, but the constructor is required to
        // take it and a literal here is exactly what issue #138 was.
        const {sharedSettings} = require("@/hooks/useSetting");
        sharedSettings().set("machineModel", "original");
        const {result} = await renderHook(() => useHubSave());

        await act(async () => { await result.current.save([hubRow(7)]); });

        expect(mockConstructed[0][1]).toBe("original");
    });
});

describe("saving a batch", () => {
    it("saves them one after another, not all at once", async () => {
        // The endpoint is undocumented and its rate limits are unknown, so a
        // batch of fifty parallel requests is the thing most likely to get the
        // app throttled, with nobody to ask about it.
        let running = 0;
        let mostAtOnce = 0;
        mockFetchDetail.mockImplementation(async () => {
            running += 1;
            mostAtOnce = Math.max(mostAtOnce, running);
            await Promise.resolve();
            running -= 1;
        });
        const {result} = await renderHook(() => useHubSave());

        await act(async () => {
            await result.current.save([hubRow(1), hubRow(2), hubRow(3)]);
        });

        expect(mostAtOnce).toBe(1);
        expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    it("counts as it goes, so the bar can say where it is", async () => {
        const seen: string[] = [];
        mockFetchDetail.mockImplementation(async () => {
            seen.push(`${result.current.progress.done}/${result.current.progress.total}`);
        });
        const {result} = await renderHook(() => useHubSave());

        await act(async () => { await result.current.save([hubRow(1), hubRow(2)]); });

        expect(seen).toEqual(["0/2", "1/2"]);
    });

    it("keeps going after one row fails, and names the ones that did not land", async () => {
        // Resolving to a single boolean tells somebody who saved forty rows
        // nothing about which three did not.
        mockFetchDetail
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("timed out"))
            .mockResolvedValueOnce(undefined);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => {
            outcome = await result.current.save([hubRow(1), hubRow(2), hubRow(3)]);
        });

        expect(outcome.saved).toBe(2);
        expect(outcome.failed).toEqual(["Recipe 2"]);
    });

    it("treats a recipe the endpoint would not give up as a failure, not a save", async () => {
        // `getRecipe()` returning null is the importer saying it could not
        // make a recipe out of the answer. Writing nothing and counting it as
        // saved would be the worst of both.
        mockGetRecipe.mockReturnValueOnce(null);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => { outcome = await result.current.save([hubRow(4)]); });

        expect(outcome.saved).toBe(0);
        expect(outcome.failed).toEqual(["Recipe 4"]);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("saving something already held", () => {
    it("does not add a second copy", async () => {
        // Exactly what any other import does. `resolveOnOpen` hands back the
        // stored recipe rather than making a copy.
        const held = madeUpRecipe("Held");
        mockGetRecipe.mockReturnValue(held);
        mockAll.mockReturnValue([held]);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => { outcome = await result.current.save([hubRow(1)]); });

        expect(outcome.alreadyHeld).toBe(1);
        expect(outcome.saved).toBe(0);
    });
});

describe("while it is running", () => {
    it("refuses a second batch rather than interleaving two", async () => {
        let release: () => void = () => {};
        mockFetchDetail.mockImplementation(() => new Promise<void>((r) => { release = () => r(); }));
        const {result} = await renderHook(() => useHubSave());

        let first!: Promise<unknown>;
        await act(async () => { first = result.current.save([hubRow(1)]); });
        await waitFor(() => expect(result.current.saving).toBe(true));

        const second = await result.current.save([hubRow(2)]);
        expect(second.saved).toBe(0);
        expect(second.refused).toBe(true);

        await act(async () => { release(); await first; });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useHubSave.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `hooks/useHubSave.ts`:

```ts
/**
 * Putting catalogue rows into the library.
 *
 * A hub row carries a `shareRecipeLink`, and that is the whole mechanism: the
 * link goes through `parseImportInput` and `XBloomRecipe` exactly as a link
 * pasted into the import sheet does. Both work unmodified, because
 * `parseImportInput` checks neither host nor path -- only that it is an
 * http(s) URL with an `?id=`.
 *
 * Sequential on purpose. The catalogue endpoint is undocumented, its rate
 * limits are unknown and there is nobody to ask, so a batch of fifty parallel
 * requests is the single most likely way to get this app's traffic throttled.
 */
import {useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {resolveOnOpen} from "@/library/duplicates";
import type {HubRecipe} from "@/library/hub/hubRow";
import {parseImportInput} from "@/library/importInput";
import {asMachineModel} from "@/library/machine/machineModel";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {Settings} from "@/library/Settings";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import {assignAccent} from "@/library/accent";

export type HubSaveOutcome = {
    saved: number;
    alreadyHeld: number;
    /** The names of the rows that did not land, so the report can say which. */
    failed: string[];
    /** True when a batch was already running and this one was not started. */
    refused: boolean;
};

export type HubSave = {
    saving: boolean;
    progress: {done: number; total: number};
    save: (rows: readonly HubRecipe[]) => Promise<HubSaveOutcome>;
};

export function useHubSave(settings?: Settings): HubSave {
    const [storedModel] = useSetting("machineModel", settings);
    const model = asMachineModel(storedModel);
    const [progress, setProgress] = useState({done: 0, total: 0});
    const [saving, setSaving] = useState(false);

    async function save(rows: readonly HubRecipe[]): Promise<HubSaveOutcome> {
        if (saving) return {saved: 0, alreadyHeld: 0, failed: [], refused: true};

        setSaving(true);
        setProgress({done: 0, total: rows.length});

        const store = new RecipeDatabase();
        const outcome: HubSaveOutcome = {saved: 0, alreadyHeld: 0, failed: [], refused: false};

        for (const [index, row] of rows.entries()) {
            try {
                const source = parseImportInput(row.shareLink);
                if (source === null) throw new Error("That share link is not one we can read.");

                const importer = new XBloomRecipe(source, model);
                await importer.fetchRecipeDetail();
                const candidate = importer.getRecipe();
                if (candidate === null) throw new Error("The recipe could not be read.");

                // The same de-duplication every other import goes through.
                // "brew" rather than the card-bytes default, because an
                // imported recipe carries its bypass and a card cannot.
                const stored = store.getRecipes();
                const {recipe, isExisting} = resolveOnOpen(stored, candidate, "brew");
                if (isExisting) {
                    outcome.alreadyHeld += 1;
                } else {
                    // Settled here rather than left to the editor, because a
                    // batch never opens one. Idempotent, so a recipe that
                    // already holds a valid index for its half is untouched.
                    assignAccent(recipe, stored);
                    store.updateRecipe(recipe.uuid, recipe);
                    outcome.saved += 1;
                }
            } catch {
                // Named rather than counted. Somebody who saved forty rows
                // learns nothing from "three failed".
                outcome.failed.push(row.name);
            }
            setProgress({done: index + 1, total: rows.length});
        }

        setSaving(false);
        return outcome;
    }

    return {saving, progress, save};
}

export default useHubSave;
```

- [ ] **Step 4: The bar**

Create `components/HubSaveBar.tsx`, modelled on `components/ShelfPickerBar.tsx`
(absolutely positioned, `left={0} right={0} bottom={0}`), with:

```ts
type Props = {
    count: number;
    saving: boolean;
    progress: {done: number; total: number};
    onCancel: () => void;
    onSave: () => void;
    paddingBottom?: number;
};
```

- `testID="hub-save-bar"`, a cancel control `testID="hub-save-cancel"`, and a
  save control `testID="hub-save-confirm"` with `accessibilityRole="button"`.
- The save label is `SAVE {count}` when idle and `{done} OF {total}` while
  saving, both in `DotMatrixText`.
- While `saving`, the save control has `accessibilityState={{disabled: true}}`
  and no `onPress`, and cancel is gone: a half-finished sequential batch has
  already written rows, and a cancel that leaves the library in an unnamed
  middle state is worse than waiting out the rest.
- With `count === 0` the save control is disabled the same way.

Create `components/__tests__/HubSaveBar.test.tsx` covering: the idle label
naming the count; the progress label while saving; the save control disabled
and cancel absent while saving; cancel and save firing their handlers when idle.

- [ ] **Step 5: Run both tests**

Run: `npx jest hooks/__tests__/useHubSave.test.ts components/__tests__/HubSaveBar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/useHubSave.ts hooks/__tests__/useHubSave.test.ts components/HubSaveBar.tsx components/__tests__/HubSaveBar.test.tsx
git commit -m "Save catalogue rows through the importer that already exists" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: The catalogue screen (rewritten after the amendment)

**Files:**
- Create: `app/hub.tsx`
- Modify: `app/_layout.tsx` (register the route)
- Test: `app/__tests__/hub.test.tsx`

> **This task was rewritten.** The version written before the amendment drove
> server paging (`onEndReached`, `browse.more()`, `loadingMore`), held facets as
> the server's id names (`originIds`, `flavorIds`), fed the filter sheet the
> server's vocabulary, and kept the selection inside `useHubBrowse`. None of
> that is true any more. Read this version, not the one in the history.

The browse screen. A header, a rail, a list, and a save bar that appears only
once somebody is choosing.

**Nothing in `app/index.tsx` changes.** It already calls `library.refresh()` in
a `useFocusEffect`, so a separate route can write to SQLite and the library
picks the rows up on the way back. Do not add a callback, a param or a return
value to the library route to carry saved recipes home.

**What the screen owns and what it does not.** `useHubBrowse` owns the
catalogue, the question and the answer. `useHubSave` owns writing rows into the
library. The screen owns three things only: **which sheet is open**, **whether
the user is choosing**, and **which rows are chosen**. The selection is not in
either hook, deliberately: it is about this screen's mode, not about the
catalogue.

- [ ] **Step 1: Register the route**

In `app/_layout.tsx`, beside the existing `brewHistory` and `brewRecord` lines:

```tsx
<Stack.Screen name="hub" options={{headerShown: false}}/>
<Stack.Screen name="hubRecipe" options={{headerShown: false}}/>
```

Both screens draw the app's own `ScreenHeader`, so the native one is off, the
same way every other route here does.

- [ ] **Step 2: Write the failing test**

Create `app/__tests__/hub.test.tsx`. Mock `@/library/hub/hubCatalogue` so the
screen is tested against answers rather than the network, and mock
`@/hooks/useSetting` with the shared settings mock. Cover:

```
describe("the catalogue screen")
  it("names what it is and how much of it there is")
      -- ScreenHeader title CATALOGUE with the count of rows shown. The Doto
         superscript only appears above zero, which is ScreenTitle's own rule,
         so pass the number rather than guarding it here.
  it("draws the first rows before the rest have arrived")
      -- the whole point of the progressive load: one page in, rows on screen,
         and a line saying more is still coming.
  it("says the catalogue is still arriving rather than that it is empty")
  it("offers a retry when the load failed, and never calls it empty")
      -- the distinction the spec insists on: an empty catalogue and a broken
         connection are different claims, and the failure state must never make
         the first one.
  it("asks again when the retry is pressed")
  it("says nothing matches, only once the catalogue really answered")
      -- rows in hand, a question that matches none of them, load finished.
  it("narrows on a facet without asking the network again")
      -- assert the catalogue was loaded exactly once across the whole test.
  it("searches on what was typed")
      -- through RailSearchField driven by `browse.search`. The debounce is
         useRailSearch's and has its own tests, so advance timers here.
  it("opens the detail screen on a press")
      -- router.push called with /hubRecipe and the row's id.
  it("starts choosing on a long press, and then a press picks instead of opens")
      -- the one interaction that changes meaning; pin both halves.
  it("shows the save bar only while choosing")
  it("stops choosing and clears what was chosen when the bar is cancelled")
  it("tells the user by name which rows did not land")
      -- useHubSave mocked to report one failure; assert the notify message
         contains that row's name.
  it("leaves choosing and goes back to browsing once a batch has landed")
```

Use `renderWithProviders` and `await` it. `render` and `fireEvent` are async.
Pressing anything inside an `XbrwSheet` needs the `pressOnSheet` retry loop
from `app/__tests__/brewHistory.test.tsx`.

- [ ] **Step 3: Run it and watch it fail**

`npx jest app/__tests__/hub.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 4: Write it**

Create `app/hub.tsx`:

```tsx
export default function HubScreen() {
    const browse = useHubBrowse();
    const save = useHubSave();
    const [openFacet, setOpenFacet] = useState<HubFacet | null>(null);
    const [sortOpen, setSortOpen] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
    ...
}
```

- **Header.** `<ScreenHeader title="CATALOGUE" count={browse.rows.length}
  onBack={() => router.back()}/>`.
- **The rail.** A horizontal `ScrollView` holding, in order: the search chip
  and field driven by **`browse.search`** (not a second `useRailSearch`; the
  hook already owns one and hands out the whole `RailSearch`), a sort
  `RailChip` opening the sort sheet, and one `RailChip` per facet in
  `["origins", "processes", "varietals", "flavours"]`. A chip is `active` when
  `browse.query[facet].length > 0`. Its `onPress` is `setOpenFacet(facet)`; the
  chip opens nothing itself, the screen owns which sheet is up.

  Roast is a chip too, but its values are the server's five words rather than
  free text, so it uses `browse.setRoasts` and `roastLabel` from
  `library/hub/hubCriteria.ts`. Load the criteria in an effect that sets state
  **only in the promise continuation**; `react-hooks/set-state-in-effect` is an
  error. `loadHubCriteria()` caches, so a second visit costs nothing. **If the
  criteria have not arrived, the roast chip should not be drawn at all** rather
  than drawn with numbers for names.
- **The sheet.** One `<HubFilterSheet>`, driven by `openFacet`, with
  `options={openFacet ? browse.chips(openFacet) : []}`,
  `selected={openFacet ? browse.query[openFacet] : []}` and
  `onChange={(values) => openFacet && browse.setFacet(openFacet, values)}`.
  The options come from `browse.chips`, which counts over the rows in hand, so
  the sheet can never offer a value that finds nothing.
- **The list.** A `FlatList` with `testID="hub-list"`, `data={browse.rows}`,
  `keyExtractor={(row) => String(row.id)}`, rendering `<HubRow>` with
  `selecting={choosing}`, `selected={chosen.has(row.id)}`, `onPress` that
  toggles when choosing and otherwise pushes
  `{pathname: "/hubRecipe", params: {id: String(row.id)}}`, and `onLongPress`
  that turns choosing on and selects that row in one go.

  **There is no `onEndReached`.** The whole partition is already coming. While
  `browse.arriving`, `ListFooterComponent` says so, using `browse.page` and
  `browse.totalPage` if a proportion helps.
- **The three states, kept apart.** While `browse.arriving` and the list is
  empty, draw an arriving state. When `browse.failed !== null`, draw the failure
  with a retry calling `browse.retry()`. Only when neither holds and
  `browse.rows.length === 0` may the screen say nothing matches. A broken
  connection and an empty catalogue are different claims and the screen must
  never make the second on the evidence of the first.

  Note the ordering this implies: a failure that arrives **after** some rows
  landed still shows those rows. `hubCatalogue` fires a last `onProgress`
  before it rethrows for exactly that reason, so do not throw the rows away.
- **The bar.** `<HubSaveBar>` rendered only while `choosing`, with
  `count={chosen.size}`, `saving={save.saving}`, `progress={save.progress}`,
  `onCancel` clearing `chosen` and leaving choosing, and `onSave` awaiting
  `save.save(rowsFor(chosen))` and then reporting through `notify`:
  - all landed: `notify({tone: "success", message: ...})`, clear, leave choosing
  - some failed: the message **names** the rows, for example
    `Saved 6. Could not save: Brian's Recipe, Morning Filter.` The hook returns
    `failed: string[]` precisely so this line can be written.
  - `refused` is a no-op; the bar is already showing progress.

  A long list of failures should not become a paragraph. Name a few and count
  the rest.
- **If two sheets can be open at once, every open sheet must be named in the
  screen's `screenCovered` guard.** On Android, `accessibilityViewIsModal` on
  the sheet does not hide sibling screen content. `app/index.tsx` and
  `app/editRecipe.tsx` both do this; follow them.
- Colours from `constants/colors.ts`, timings from `constants/motion.ts`, Doto
  through `DotMatrixText`. No component declared inside another's body.

- [ ] **Step 5: Run the test**

`npx jest app/__tests__/hub.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/hub.tsx app/_layout.tsx app/__tests__/hub.test.tsx
git commit -m "Browse the catalogue" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: One recipe, before it is yours

**Files:**
- Create: `app/hubRecipe.tsx`
- Test: `app/__tests__/hubRecipe.test.tsx`

The destination view. This is where somebody decides, so it shows the things
the row could not: the whole note, the flavour notes, the author, and the
stages drawn as the brew screen draws them.

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/hubRecipe.test.tsx`, mocking `@/library/hub/hubApi` and
`expo-router`'s `useLocalSearchParams` to return `{id: "164"}`. Cover:

```
describe("one catalogue recipe")
  it("asks the catalogue for the recipe named in the route")
      -- fetchHubDetail called with 164.
  it("shows the name, the author and the note")
  it("draws the stages the catalogue described")
      -- BrewStageLadder receives hubPours(detail); assert on rendered stage
         text/test ids, not on props: RNTL v14 cannot inspect a child's props.
  it("draws the stages with nothing running")
      -- there is no brew here; nothing is active, nothing is filled.
  it("says nothing about stages when the catalogue sent none")
      -- pourList can be absent; an empty ladder is worse than no ladder.
  it("offers a retry when the request failed")
  it("saves this one recipe")
      -- press SAVE; useHubSave's save called with the one row.
  it("says so when the save failed rather than going quiet")
  it("goes back once it has landed")
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write it**

Create `app/hubRecipe.tsx`:

- `const {id} = useLocalSearchParams<{id: string}>();`
- Load through `fetchHubDetail(Number(id), signal)`, with the same
  set-state-in-the-continuation rule as the browse screen, and an
  `AbortController` torn down on unmount.
- `<ScreenHeader title={detail.name} onBack={() => router.back()}/>` with no
  `count`: a count here would be a number about one recipe, and there is none
  the superscript means.
- The photo full-bleed at the top, RN `Image` with the same `onError` fallback
  as `HubRow`.
- `introduce` in Inter, whole, not truncated. Flavour notes as Doto caps chips.
  Author and machine as a Doto line. Dose, ratio, grind and water as accented
  figures using `hubAccent(detail.id)`, the same colour the row used, so the
  recipe does not change colour on the way in.
- The stages through
  `<BrewStageLadder pours={hubPours(detail)} activeIndex={null} barHeight={...}
   rungGap={...} scrolls={false} fill={false} stageWater={[]} stalls={[]}
   pauseElapsed={0}/>`. All eight of its non-optional props are required. There
  is no brew running here, so nothing is active and nothing is filled.
  Render the ladder only when `hubPours(detail).length > 0`.
- **A detail row has no stage count.** Verified live: the list endpoint sends
  `pourCount` and the detail endpoint does not, so `HubDetailRow` omits it and
  `normaliseRow(detail)` is a compile error on purpose. Where this screen wants
  a normalised row, supply the count from the plan it already has:
  `normaliseRow({...detail, pourCount: detail.pourList?.length ?? 0})`.
- **The pattern numbering is not the app's.** `hubPours` owns that mapping
  (Task 5); do not feed a raw catalogue `pattern` to `glyphForPattern` here.
  The catalogue sends `1 centered, 2 spiral, 3 circular`; `POUR_PATTERN` is
  `CENTERED 0, CIRCULAR 1, SPIRAL 2`. Getting this wrong mis-draws every row
  in a way that looks plausible.
- A single SAVE control at the foot, calling `useHubSave().save([row])` with the
  one row and reporting through `notify` exactly as the batch does, then
  `router.back()` on success.

- [ ] **Step 4: Run the test, then commit**

```bash
git add app/hubRecipe.tsx app/__tests__/hubRecipe.test.tsx
git commit -m "Look at a catalogue recipe before taking it" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: The door

**Files:**
- Modify: `components/ImportSheet.tsx`
- Test: `components/__tests__/ImportSheet.test.tsx`

One way in, from the sheet that already means "bring a recipe in".

**Not `EmptyLibrary`.** The spec's §5.3 suggests a CTA there, but that file
carries a deliberate comment saying it has no button because the three CTA
tiles sit above it. Adding one would contradict a decision somebody already
wrote down. The hub door goes in the import sheet only.

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/ImportSheet.test.tsx`:

```
it("offers the catalogue as a way in")
    -- a control labelled for the catalogue exists.
it("closes itself on the way to the catalogue")
    -- onOpenChange(false) fires as well as the push; a sheet left open
       behind a pushed route is still there on the way back.
it("pushes the catalogue route")
```

- [ ] **Step 2: Write it**

A row beneath the paste field: a `Pressable` with
`accessibilityRole="button"`, an accessible label naming the catalogue, whose
`onPress` calls `onOpenChange(false)` and then `router.push("/hub")`.

Copy, in the house voice, with no dashes at all: something on the order of
`BROWSE THE CATALOGUE` in Doto with a line of Inter under it saying what it is.
Keep it short. Do not write "xBloom Community Hub" in title case; the app calls
it the catalogue.

- [ ] **Step 3: Run the test, then commit**

```bash
git add components/ImportSheet.tsx components/__tests__/ImportSheet.test.tsx
git commit -m "Put a door to the catalogue in the import sheet" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Write it down, then ship it

**Files:**
- Modify: `.github/copilot-instructions.md`
- Modify: `docs/superpowers/specs/2026-09-28-community-hub-design.md` (mark Phase 2 done)

- [ ] **Step 1: The house instructions**

Add to the `library/` section of `.github/copilot-instructions.md`, in the same
voice as the entries around it:

- `library/hub/` — the xBloom community catalogue at `collective-api.xbloom.com`.
  `hubApi.ts` is the only place that talks to it, and it checks **twice**: the
  HTTP status and then the envelope's `code`, because a failure arrives as
  `{code: 500}` inside an HTTP 200. `hubRow.ts` is the quarantine for the
  catalogue's dirty metadata: facet arrays arrive pre-joined into element zero
  with three different separators, `process` is sometimes the literal string
  `["Washed"]`, and live recipe names contain mojibake. Nothing downstream of
  `normaliseRow` sees any of that. `hubStages.ts` maps a catalogue pour onto a
  `Pour`, and the pattern numbering is **not** the app's: the catalogue sends
  `1 centered, 2 spiral, 3 circular` while `POUR_PATTERN` is
  `CENTERED 0, CIRCULAR 1, SPIRAL 2`. `hubQuery.ts` sends `adaptedModel` from
  the user's setting, for the reasons in §C-ter of
  `docs/machine-integration/cloud-api.md`.
- Saving is not a second importer: `hooks/useHubSave.ts` runs a catalogue row's
  share link through `parseImportInput` and `XBloomRecipe`, unchanged, because
  `parseImportInput` checks neither host nor path. It saves **sequentially** and
  reports failures **by name**, since the endpoint's rate limits are unknown and
  a batch that resolves to one boolean tells somebody who saved forty rows
  nothing.
- `likesCount` is deliberately never shown. Every value in the catalogue sits in
  one narrow band, so drawing it would dress noise up as a popularity signal.

- [ ] **Step 2: Tick the spec**

Mark §5 done in the design doc, the way Phase 1 was marked.

- [ ] **Step 3: The full gate**

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

All four green. Lint must have **0 errors**; the known warnings are the
documented `exhaustive-deps` and `require()`-in-mock-factory ones.

- [ ] **Step 4: Commit and open the PR**

```bash
git add .github/copilot-instructions.md docs/
git commit -m "Write down how the catalogue works" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin community-hub-browse
gh pr create --repo hessius/XBRecipeWriterPlus --base community-hub --title "..." --body-file ...
```

**Base `community-hub`, not `main`.** Phase 2 sits on Phase 1's machine model,
which is open as #168 and not merged. Retarget to `main` once #168 lands.
Always pass `--repo hessius/XBRecipeWriterPlus`; without it `gh` files against
the upstream fork parent.

---

## Self-review

Before calling any of this done, check the following.

**Spec coverage.** Walk §5 of `docs/superpowers/specs/2026-09-28-community-hub-design.md`
and find the task that covers each paragraph. Three of its claims are wrong and
are corrected above, under "Corrections to the spec, already made": the
`SelectableRecipeRow` reuse, the `EmptyLibrary` CTA, and the reason
`app/index.tsx` can stay untouched. If a fourth conflict appears, correct the
plan and commit that correction **on its own**, before implementing against it.

**Placeholder scan.** `grep -rn "TODO\|FIXME\|XXX\|placeholder" library/hub hooks/useHubSave.ts app/hub.tsx app/hubRecipe.tsx components/Hub*.tsx`
should return nothing.

**Type consistency across tasks.** `HubRecipe` is defined once, in
`library/hub/hubRow.ts`, and Tasks 6, 7, 9, 10 and 11 all import it from there.
No task redeclares a structural copy of it. `HubFacet` and `HubSort` likewise
live only in `hubQuery.ts`, and `HubCriteria` only in `hubCriteria.ts`.

**The three traps, each with a test that would catch it.**
1. Pattern numbering: a `hubStages` test asserting catalogue `2` becomes
   `POUR_PATTERN.SPIRAL` and not `CIRCULAR`.
2. The envelope: a `hubApi` test asserting `{code: 500}` inside an HTTP 200 is
   a failure.
3. The two-store settings trap: every component taking a `settings` prop passes
   it to every `useSetting` **and** to `useHubSave`/`useHubBrowse`. Grep for
   `useSetting(` in the new files and check each one against its component's
   props.

**Mutation-test every new guard.** For each `if` that exists to prevent
something, delete it and confirm a test goes red. A guard no test defends is a
guard that will be removed by somebody later with no warning.

**No network in tests.** `grep -rn "collective-api" ` under `__tests__` should
find only mock URLs and assertions, never a live call.

**Verification before calling this done**

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` 0 errors
- [ ] `npm test` green, and the suite count went **up** by the new files
- [ ] `npx expo-doctor` 21/21
- [ ] Every task's checkboxes ticked
- [ ] The placeholder scan returns nothing
- [ ] The app builds and the catalogue screen opens on a device, with a real
      network, against the live endpoint. Nothing in this plan can be verified
      against the real catalogue in Jest, and the data is provably dirty.

---

# Amendment: the server's filters do not work, so the catalogue comes to us

Written after Tasks 1 to 4, on evidence gathered against the live API. Tasks 5
onward are changed by it, and Task 4's `hubQuery.ts` is rewritten.

## What was measured

Every facet id in the server's own vocabulary, probed against both machines:

| Filter | Studio (J15) rows | Original (J20) rows |
| --- | --- | --- |
| `originIds`, all 28 ids | 9 ids match anything, best is Colombia at **12** | **0 ids match anything** |
| `varietalIds`, first 12 ids | 7 match | **0** |
| `processIds`, first 12 ids | 6 match | **0** |
| `flavorIds`, first 12 ids | 11 match | **0** |
| `roastList` | works | works, 216 rows |
| `cupTypeList` | works | works, 1,323 rows |
| `keyword: "colombia"` | **5** | 4 |

The partitions hold 1,643 Studio and 1,323 Original rows. So:

1. **Every structured facet returns zero rows for an Original owner.** Shipping
   the planned rail would give half the userbase four chips that always answer
   "nothing found". That is not a filter, it is a bug with a label on it.
2. **The facets barely work for a Studio owner either.** 106 rows carry
   Colombia in their origin and `originIds` finds 12 of them.
3. **`keyword` is no better**: 5 rows for "colombia" against 106 that say it.

Whatever the server indexes, it is a small curated subset, and the criteria
endpoint is global: it ignores `machineList` and `recipeType` entirely, so it
cannot even be asked which of its own values are worth offering.

## What we do instead

**Fetch the machine's whole partition once per session and answer every
question locally.** `hubRow.ts` already cleans the metadata, so the app has
better material than the server's index does: real origin, process, varietal
and flavour values off the rows themselves.

Measured: both partitions together are 2,966 rows and 1.89 MB over 30 requests
in 25 s. One machine is roughly half that, so about 1 MB over 17 requests.

That is too long to block on, and it does not have to. **The load is
progressive**: each page is appended as it lands, so the first 100 rows are on
screen in under a second and the user scrolls while the rest arrives. Server
paging was never cheaper, because reaching page five costs five sequential
round trips either way. Search and filters answer over what has arrived, and
the screen says while it is still arriving.

This also removes work. There are no facet ids to send, no `originIds` to keep
in sync with a vocabulary, and no question about what a chip means when the
server disagrees with the row it returned.

## What changes

- `hubQuery.ts` stops building a filtered request and becomes two things: the
  page request for the loader (machine and page index, nothing else) and the
  local matcher and sorter that answers a `HubQuery` over `HubRecipe[]`.
- **New Task 4b, `library/hub/hubCatalogue.ts`**: the progressive loader.
- `hubCriteria.ts` keeps `loadHubCriteria` and `roastLabel`: the roast words
  are still the server's, and roast is still a real filter. The four facet
  vocabularies are no longer used for filtering, only as `splitFacet`'s space
  gate, which is what Task 2 already uses them for.
- The rail's facet chips are built from the **rows that arrived**, with counts,
  so a chip never offers a value that finds nothing.
- Task 6's `useHubBrowse` loses its paging state machine and gains the
  catalogue's loading progress.

## Task 4r: Rewrite `hubQuery.ts` as a local matcher

**Files:**
- Modify: `library/hub/hubQuery.ts`
- Modify: `library/hub/__tests__/hubQuery.test.ts`

The facets stop being server ids and become the **values off the rows**, which
is the only vocabulary that describes what is actually in the catalogue.

- [ ] **Step 1: Change the query shape**

```ts
export type HubQuery = {
    keyword: string;
    /** Values, not ids: `"Colombia"`, not `"4"`. Matched case-insensitively. */
    origins: readonly string[];
    processes: readonly string[];
    varietals: readonly string[];
    flavours: readonly string[];
    /** Roast is still the server's five words, so this stays numeric. */
    roasts: readonly number[];
    sort: HubSort;
};
```

`HUB_SORTS` becomes what can honestly be done over list rows:

```ts
export const HUB_SORTS = {
    newest: {label: "NEWEST"},
    name:   {label: "A TO Z"},
    ratio:  {label: "STRONGEST"}
} as const;
```

**`MOST SAVED` and `NEWEST` cannot both be local.** A list row carries no
upload date, so "newest" can only be the order the server returned, and the
loader can only ask for one order. It asks for newest, and `newest` sorts by
arrival index. Asking for downloads instead would cost a second full load of
the whole partition to get the other order, which is not worth a chip.
`STRONGEST` is `ratio` ascending, because a lower ratio is a stronger cup, and
it is the one ordering the rows genuinely support that somebody might want.

- [ ] **Step 2: The matcher**

```ts
/**
 * Whether one row answers the rail's question.
 *
 * Local because the server's own filters do not work: see the amendment above.
 * Every facet is an AND across facets and an OR within one, which is what the
 * library's filter rail already means by a chip.
 */
export function matchesHubQuery(row: HubRecipe, query: HubQuery): boolean;
```

Rules, each of which needs a test:
- An empty facet list matches everything. All five empty plus an empty keyword
  is the whole catalogue.
- Within one facet, a row matches if **any** of its values is chosen.
- Across facets it is AND: a row must satisfy every non-empty facet.
- Comparison is `trim().toLowerCase()` on both sides, because the values came
  off rows typed by different people and `"washed"` and `"Washed"` are one
  process. Do not reach for SQLite collation ideas here; there is no database.
- The keyword is matched against the name, the author, the coffee type and
  every facet value, lower-cased, as a substring. It is deliberately broader
  than the server's index, which finds 5 rows for "colombia" out of 106 that
  say it.

- [ ] **Step 3: The sorter and the counts**

```ts
/** The catalogue in the order the rail asked for. Never mutates its input. */
export function sortHubRows(rows: readonly HubRecipe[], sort: HubSort): HubRecipe[];

/**
 * How many of these rows carry each value of one facet, commonest first.
 *
 * This is what builds the rail's chips, so a chip can never offer a value that
 * finds nothing. Counted over the rows that have arrived, not over the
 * server's vocabulary, which lists 93 flavours and indexes almost none of them.
 */
export function hubFacetCounts(
    rows: readonly HubRecipe[],
    facet: "origins" | "processes" | "varietals" | "flavours"
): {value: string; count: number}[];
```

`sortHubRows` must be stable and must not mutate: `newest` returns a copy in
the given order, `name` sorts with `localeCompare` so the CJK names order
sensibly, `ratio` sorts ascending and puts a row without a ratio last.

`hubFacetCounts` groups case-insensitively but reports the **most common
spelling** of each value as its label, because `"Washed"` and `"washed"` are
one chip and the one people wrote more often is the one to show.

- [ ] **Step 4: The request the loader sends**

`buildHubRequest` loses every filter field:

```ts
/**
 * One page of one machine's partition.
 *
 * Carries no filters at all any more. The server's are measured not to work
 * (see the amendment), and every field sent to an undocumented endpoint is a
 * guess, so the only ones here are the four that are load bearing.
 */
export function buildHubRequest(model: MachineModel, pageIndex: number): HubPageRequest {
    return {
        pageIndex,
        pageSize: HUB_PAGE_SIZE,
        recipeType: 1,
        machineList: [machineCode(model)],
        sort: 1,
        sortType: 2
    };
}
```

`recipeType: 1` is not optional: without it the answer carries 54 tea rows.
`sort: 1, sortType: 2` is newest first, and arrival order is therefore the
`newest` ordering; `sortType` is the direction and does nothing without `sort`.

---

## Task 4b: The catalogue, loaded progressively

**Files:**
- Create: `library/hub/hubCatalogue.ts`
- Test: `library/hub/__tests__/hubCatalogue.test.ts`

Pure TypeScript, no React. Fetches one machine's whole partition page by page,
handing each page over as it lands.

```ts
export type HubCatalogueProgress = {
    rows: HubRecipe[];
    /** Pages answered so far, and the total once the first page has said. */
    page: number;
    totalPage: number;
    total: number;
};

/**
 * Load a machine's whole partition, a page at a time.
 *
 * Progressive rather than blocking: about 1 MB over 17 requests for a machine,
 * which is 14 s to finish and under a second to show something. Server paging
 * was never cheaper, since reaching page five costs five round trips either
 * way, and this buys real filters at the end of it.
 *
 * `onProgress` is called after every page with the rows so far, so a screen can
 * draw immediately and keep drawing. Sequential on purpose: the endpoint is
 * undocumented and its rate limits are unknown.
 */
export function loadHubCatalogue(
    model: MachineModel,
    onProgress: (progress: HubCatalogueProgress) => void,
    signal?: AbortSignal
): Promise<HubRecipe[]>;
```

Requirements, each needing a test:
- Calls `onProgress` after **every** page, including the first, with all rows
  accumulated so far.
- Stops when `pageIndex >= totalPage`, and asks for exactly `totalPage` pages,
  not one more.
- A partition of one page does not ask for a second.
- Normalises every row through `normaliseHubRow`, passing the criteria
  vocabularies when they are already held (`heldHubCriteria()`), and does not
  wait for them: the space gate changes six values in the whole catalogue.
- **A failure part way through keeps the rows that landed.** Rejecting and
  discarding 1,400 rows because page 15 timed out is the worst possible
  handling. It resolves with what it has and reports the failure through
  `onProgress`... no: it **rethrows**, but only after a final `onProgress`, so
  the caller holds the partial catalogue and can say it is incomplete.
- An `AbortError` propagates untouched and fires no further progress.
- The result is cached per machine for the session, so leaving the screen and
  coming back does not refetch. A second call while one is in flight joins it
  rather than starting a second, exactly as `loadHubCriteria` does.
- `__resetHubCatalogue()` for tests.

### Measured after building it, against the live API

Run in plain Node against the real endpoint, because jest-expo's `fetch` is a
stub and cannot reach the network from a test:

```
ORIGINAL: 1323 rows, 14 progress calls, first page at 100 rows, 2.9s
top origins:   Colombia 306, Ethiopia 189, Brazil 49, Panama 49, Kenya 48
top processes: Washed 429, Natural 237, Honey 35, Anaerobic 24, 水洗 21
filter Colombia -> 306 rows, which is exactly what the chip's count promised
keyword colombia -> 351 rows
```

The server's own `originIds` for Colombia on this machine returns **0**, and
its `keyword` returns **4**. Locally the same question finds 306 and 351. The
whole partition arrives in under three seconds, with the first hundred rows on
screen almost immediately.

**Note for anyone testing the network path:** `jest-expo`'s environment stubs
`fetch`, and `response.text()` resolves to `undefined`. Nothing in these tests
can reach the live catalogue, which is correct, but it also means an
integration check has to run outside Jest.

