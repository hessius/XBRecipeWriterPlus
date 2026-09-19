import {act, renderHook} from "@testing-library/react-native";

import steadyRouter, {forgetLastMove, isRepeat, SETTLE_MS, useSteadyRouter} from "@/hooks/steadyRouter";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

const mockRouter = {push: mockPush, back: mockBack, replace: mockReplace};

jest.mock("expo-router", () => ({
    router:    mockRouter,
    useRouter: () => mockRouter
}));

beforeEach(() => {
    jest.clearAllMocks();
    forgetLastMove();
});

describe("deciding whether a move is a repeat", () => {
    it("has nothing to repeat when nothing has been done yet", () => {
        expect(isRepeat("push:/about", 1000, null)).toBe(false);
    });

    it("calls the same move again a moment later a repeat", () => {
        expect(isRepeat("push:/about", 1080, {move: "push:/about", at: 1000}))
            .toBe(true);
    });

    it("lets a different move through, however fast it arrives", () => {
        // A finger cannot press two buttons at once, so two different moves in
        // the same instant are code meaning it, not a fumble.
        expect(isRepeat("push:/licences", 1001, {move: "push:/about", at: 1000}))
            .toBe(false);
    });

    it("lets the same move through once the fumble window has passed", () => {
        // Someone who went to the about screen, came back and went again is
        // not double tapping, and must not be treated as though they were.
        expect(isRepeat("push:/about", 1000 + SETTLE_MS, {move: "push:/about", at: 1000}))
            .toBe(false);
    });

    it("guards right up to the edge of the window and not past it", () => {
        const last = {move: "back", at: 1000};
        expect(isRepeat("back", 1000 + SETTLE_MS - 1, last)).toBe(true);
        expect(isRepeat("back", 1000 + SETTLE_MS, last)).toBe(false);
    });
});

describe("the steady router", () => {
    it("pushes once when a row is tapped twice", async () => {
        // The bug this exists for: a quick double tap on the about row opened
        // the about screen twice, and the second one had to be dismissed.
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.push("/about");
            result.current.push("/about");
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith("/about");
    });

    it("pushes two different screens tapped in quick succession", async () => {
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.push("/about");
            result.current.push("/licences");
        });

        expect(mockPush).toHaveBeenCalledTimes(2);
    });

    it("tells two pushes apart by their parameters, not just their path", async () => {
        // Two recipes opened from the same screen are the same call shape and
        // a different destination.
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.push({pathname: "/editRecipe", params: {uuid: "a"}});
            result.current.push({pathname: "/editRecipe", params: {uuid: "b"}});
        });

        expect(mockPush).toHaveBeenCalledTimes(2);
    });

    it("goes back once when a back button is tapped twice", async () => {
        // The same fault costs more here: two pops where one was meant skips
        // a screen the user never asked to leave.
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.back();
            result.current.back();
        });

        expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it("guards across screens, not just within one", async () => {
        // The screen being left and the screen arriving must not each believe
        // they were first, which is why the last move is module scope.
        const first = await renderHook(() => useSteadyRouter());
        const second = await renderHook(() => useSteadyRouter());

        await act(async () => {
            first.result.current.push("/settings");
            second.result.current.push("/settings");
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("guards the singleton and the hook as one, not two", async () => {
        // A screen that took the router from the hook and one that reached for
        // the singleton are still navigating the same stack, so a guard that
        // covered only one door would be a guard with a hole in it.
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.push("/about");
            steadyRouter.push("/about");
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("leaves replace alone, which cannot stack up", async () => {
        const {result} = await renderHook(() => useSteadyRouter());

        await act(async () => {
            result.current.replace("/");
            result.current.replace("/");
        });

        expect(mockReplace).toHaveBeenCalledTimes(2);
    });
});
