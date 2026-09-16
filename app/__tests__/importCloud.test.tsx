import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import ImportCloudScreen from "@/app/importCloud";
import {notify} from "@/components/XbrwToast";
import {renderWithProviders} from "@/test-utils/render";

// The screen constructs a `new RecipeDatabase()` at module scope of the
// component body; without this mock jest opens real expo-sqlite.
jest.mock("@/library/RecipeDatabase");
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("expo-router", () => ({router: {back: jest.fn(), push: jest.fn()}}));

const mockHook = {
    status: "signedOut" as string,
    session: null as unknown,
    plan: null as unknown,
    error: null as string | null,
    imported: 0,
    submitSignIn: jest.fn(),
    toggle: jest.fn(),
    confirm: jest.fn(),
    refresh: jest.fn(),
    forgetAccount: jest.fn(),
};

jest.mock("@/hooks/useCloudImport", () => ({
    useCloudImport: () => mockHook,
}));

const entry = (over: Record<string, unknown> = {}) => ({
    cloudId: 1,
    name: "Kenya",
    status: "new",
    selected: true,
    selectable: true,
    recipe: {uuid: "u-1", accentIndex: 0, cupType: 1, isTea: () => false},
    ...over,
});

const planWith = (over: Record<string, unknown> = {}) => ({
    entries: [entry()],
    unreadable: 0,
    duplicated: 0,
    counts: {new: 1, updated: 0, unchanged: 0, edited: 0},
    ...over,
});

const choosing = (over: Record<string, unknown> = {}) => {
    mockHook.status = "choosing";
    mockHook.plan = planWith(over);
};

describe("importCloud", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.assign(mockHook, {
            status: "signedOut",
            session: null,
            plan: null,
            error: null,
            imported: 0,
        });
    });

    it("warns about the unofficial endpoints before the password field", async () => {
        // Before, not after: a caveat under a submit button is not consent.
        await renderWithProviders(<ImportCloudScreen/>);
        expect(
            screen.getByText(/not an official xBloom feature/i)
        ).toBeTruthy();
    });

    it("sends the typed credentials on submit", async () => {
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.changeText(screen.getByLabelText("Email"), "a@b.c");
        await fireEvent.changeText(screen.getByLabelText("Password"), "secret");
        await fireEvent.press(screen.getByRole("button", {name: /sign in/i}));

        expect(mockHook.submitSignIn).toHaveBeenCalledWith("a@b.c", "secret");
    });

    it("says so when the credentials were refused", async () => {
        mockHook.error = "credentials";
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Email or password not accepted/i)).toBeTruthy();
    });

    it("says so when the network was unreachable", async () => {
        mockHook.error = "network";
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Could not reach xBloom/i)).toBeTruthy();
    });

    it("lists the offered recipes once there is a plan", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [
                {
                    cloudId: 1,
                    name: "Kenya",
                    status: "new",
                    selected: true,
                    selectable: true,
                    recipe: {uuid: "u-1", accentIndex: 0, cupType: 1, isTea: () => false},
                },
            ],
            unreadable: 0,
            counts: {new: 1, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        await waitFor(() => expect(screen.getByText("Kenya")).toBeTruthy());
    });

    it("says how many recipes it could not read rather than hiding it", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [],
            unreadable: 2,
            counts: {new: 0, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/2 recipes could not be read/i)).toBeTruthy();
    });

    it("says so when the account has no recipes at all", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [],
            unreadable: 0,
            counts: {new: 0, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/No recipes to import/i)).toBeTruthy();
    });

    it("confirms the chosen recipes", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [
                {
                    cloudId: 1,
                    name: "Kenya",
                    status: "new",
                    selected: true,
                    selectable: true,
                    recipe: {uuid: "u-1", accentIndex: 0, cupType: 1, isTea: () => false},
                },
            ],
            unreadable: 0,
            counts: {new: 1, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByRole("button", {name: /import 1 recipe/i}));
        expect(mockHook.confirm).toHaveBeenCalled();
    });

    it("draws no completion screen, because the toast already reported it", async () => {
        // Not an omission. `finish` toasts and closes, so a done state would
        // be a screen nobody reaches with a second way to leave on it.
        mockHook.status = "done";
        mockHook.imported = 3;

        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.queryByText(/Imported 3 recipes/i)).toBeNull();
        expect(screen.queryByLabelText("Done")).toBeNull();
        // Positively anchored: the screen did render, it just has no done UI.
        expect(screen.getByText("xBloom account")).toBeTruthy();
    });

    it("says the endpoints carry some risk to the account, not merely that they are unofficial", async () => {
        // "Unofficial" alone reads as a disclaimer about polish. The thing the
        // user is actually being asked to accept is a risk to their account.
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/risk to your account/i)).toBeTruthy();
    });

    it("puts the caveat above the fields, not below them", async () => {
        // Placement is the whole point: a warning under a submit button has
        // already been walked past by everyone who was going to walk past it.
        await renderWithProviders(<ImportCloudScreen/>);

        // Case matters here and is load-bearing: the caveat says "password"
        // in lower case and the field is labelled "Password", so the
        // case-sensitive indexOf below cannot match the caveat by accident.
        // Capitalising it in the copy would quietly weaken this test.
        //
        // Rendered order, read off the tree itself. RNTL v14 has no query for
        // "comes before", and the tree is serialised depth-first, so the two
        // positions in it are the two positions on screen.
        const tree = JSON.stringify(screen.toJSON());
        const caveat = tree.indexOf("risk to your account");
        const field = tree.indexOf("Password");

        expect(caveat).toBeGreaterThan(-1);
        expect(field).toBeGreaterThan(-1);
        expect(caveat).toBeLessThan(field);
    });

    it("promises the password is never stored", async () => {
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/password is never stored/i)).toBeTruthy();
    });

    it("masks the password field", async () => {
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    });

    it("will not submit a sign-in that is already in flight", async () => {
        mockHook.status = "signingIn";
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.getByLabelText("Sign in").props.accessibilityState.disabled)
            .toBe(true);
    });

    it.each([
        ["unauthorised", /sign-in has expired/i],
        ["server", /could not answer/i],
    ])("says so when the failure was %s", async (kind, copy) => {
        mockHook.error = kind as string;
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(copy as RegExp)).toBeTruthy();
    });

    it.each([
        ["restoring", /Reading your recipes/i],
        ["listing", /Reading your recipes/i],
        ["importing", /Importing/i],
    ])("shows something during %s rather than an empty screen", async (status, copy) => {
        mockHook.status = status as string;
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(copy as RegExp)).toBeTruthy();
    });

    it("offers a retry when signing in worked but the listing never arrived", async () => {
        // `refresh` is otherwise unreachable: the list branch needs a plan, so
        // without this the screen is an error message and nothing to press.
        mockHook.status = "choosing";
        mockHook.plan = null;
        mockHook.error = "network";

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByLabelText("Try again"));

        expect(mockHook.refresh).toHaveBeenCalled();
    });

    it("hands a row's own id to the hook when it is toggled", async () => {
        choosing({entries: [entry(), entry({cloudId: 2, name: "Peru"})]});
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.press(screen.getByLabelText(/Peru/));

        // The second row, not merely "a row": with one entry this test could
        // not tell the right id from any id.
        expect(mockHook.toggle).toHaveBeenCalledWith(2);
        expect(mockHook.confirm).not.toHaveBeenCalled();
    });

    it("counts the selection, not the list", async () => {
        choosing({
            entries: [entry(), entry({cloudId: 2, name: "Peru", selected: false})],
            counts: {new: 2, updated: 0, unchanged: 0, edited: 0},
        });
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.getByText("Import 1 recipe")).toBeTruthy();
        expect(screen.queryByText("Import 2 recipes")).toBeNull();
    });

    it("says recipes, plural, when more than one is chosen", async () => {
        choosing({
            entries: [entry(), entry({cloudId: 2, name: "Peru"})],
            counts: {new: 2, updated: 0, unchanged: 0, edited: 0},
        });
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.getByText("Import 2 recipes")).toBeTruthy();
    });

    it("disables the button when nothing is chosen", async () => {
        choosing({entries: [entry({selected: false})]});
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.getByLabelText("Import 0 recipes").props.accessibilityState.disabled)
            .toBe(true);
    });

    it("does not show the empty state when there are recipes to show", async () => {
        choosing();
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.queryByText(/No recipes to import/i)).toBeNull();
    });

    it("does not list anything before the plan is being chosen", async () => {
        mockHook.status = "importing";
        mockHook.plan = planWith();
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.queryByText("Kenya")).toBeNull();
    });

    it("says one recipe could not be read without saying recipes", async () => {
        choosing({unreadable: 1});
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText("1 recipe could not be read and was left out.")).toBeTruthy();
    });

    it("says when a recipe appeared twice in the account", async () => {
        // Counted in the plan so it is not dropped in silence; the screen is
        // where that promise is either kept or broken.
        choosing({duplicated: 2});
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/2 recipes appeared twice/i)).toBeTruthy();
    });

    it("reports the outcome in a toast and leaves, rather than parking the user", async () => {
        const {router} = jest.requireMock("expo-router");
        choosing();
        mockHook.confirm.mockResolvedValue({imported: 3, failed: false});

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByLabelText("Import 1 recipe"));

        await waitFor(() => expect(notify).toHaveBeenCalledWith({
            tone: "success", message: "Imported 3 recipes.",
        }));
        expect(router.back).toHaveBeenCalled();
    });

    it("keeps what landed in the message when the import failed part-way", async () => {
        choosing();
        mockHook.confirm.mockResolvedValue({imported: 2, failed: true});

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByLabelText("Import 1 recipe"));

        await waitFor(() => expect(notify).toHaveBeenCalledWith({
            tone: "error",
            message: "Imported 2 recipes, then something went wrong.",
        }));
    });

    it("does not claim an import when nothing landed", async () => {
        choosing();
        mockHook.confirm.mockResolvedValue({imported: 0, failed: true});

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByLabelText("Import 1 recipe"));

        await waitFor(() => expect(notify).toHaveBeenCalledWith({
            tone: "error", message: "Could not import your recipes.",
        }));
    });

    it("says nothing and stays put when there was no plan to import", async () => {
        choosing();
        mockHook.confirm.mockResolvedValue(null);

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByLabelText("Import 1 recipe"));

        await waitFor(() => expect(mockHook.confirm).toHaveBeenCalled());
        expect(notify).not.toHaveBeenCalled();
    });

    it("names the account it is signed in to", async () => {
        // Without it, Sign out asks the user to revoke something they cannot
        // identify.
        mockHook.session = {memberId: 7, token: "t", email: "a@b.c"};
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText("Signed in as a@b.c")).toBeTruthy();
    });

    it("offers a working sign out once there is a session", async () => {
        mockHook.session = {memberId: 7, token: "t", email: "a@b.c"};
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.press(screen.getByLabelText("Sign out"));

        expect(mockHook.forgetAccount).toHaveBeenCalled();
    });

    it("offers no sign out when there is no session", async () => {
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.queryByLabelText("Sign out")).toBeNull();
    });

    it("really refuses a second sign-in, not merely announcing that it would", async () => {
        // The a11y mirror and the functional guard are two different props;
        // asserting only the first leaves a double submit possible.
        mockHook.status = "signingIn";
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.press(screen.getByLabelText("Sign in"));

        expect(mockHook.submitSignIn).not.toHaveBeenCalled();
    });

    it("really refuses an import of nothing", async () => {
        choosing({entries: [entry({selected: false})]});
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.press(screen.getByLabelText("Import 0 recipes"));

        expect(mockHook.confirm).not.toHaveBeenCalled();
    });

    it("offers no import button at all when the account is empty", async () => {
        choosing({entries: [], counts: {new: 0, updated: 0, unchanged: 0, edited: 0}});
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.queryByLabelText(/^Import /)).toBeNull();
        expect(screen.getByText(/No recipes to import/i)).toBeTruthy();
    });

    it("says one recipe appeared twice without saying recipes", async () => {
        choosing({duplicated: 1});
        await renderWithProviders(<ImportCloudScreen/>);

        expect(screen.getByText(
            "1 recipe appeared twice in your account and was listed once."
        )).toBeTruthy();
    });
});
