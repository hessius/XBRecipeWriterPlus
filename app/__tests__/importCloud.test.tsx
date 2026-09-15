import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import ImportCloudScreen from "@/app/importCloud";
import {renderWithProviders} from "@/test-utils/render";

// The screen constructs a `new RecipeDatabase()` at module scope of the
// component body; without this mock jest opens real expo-sqlite.
jest.mock("@/library/RecipeDatabase");

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

    it("reports what it imported when it is done", async () => {
        mockHook.status = "done";
        mockHook.imported = 3;

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Imported 3 recipes/i)).toBeTruthy();
    });
});
