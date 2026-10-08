import React from "react";
import {AccessibilityInfo} from "react-native";
import {act} from "@testing-library/react-native";

import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {
    __resetReducedMotion,
    BOUNCE_CLOSE_DELAY,
    BOUNCE_OPEN_DELAY,
    STAGGER
} from "@/constants/motion";
import {useDrawerHint} from "@/hooks/useDrawerHint";
import Recipe from "@/library/Recipe";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

const mockOpenLeft = jest.fn();
const mockOpenRight = jest.fn();
const mockClose = jest.fn();

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const {forwardRef, useImperativeHandle} = jest.requireActual("react");
    return {
        __esModule: true,
        default: forwardRef((props: {children?: React.ReactNode}, ref: unknown) => {
            useImperativeHandle(ref, () => ({
                openLeft:  mockOpenLeft,
                openRight: mockOpenRight,
                close:     mockClose
            }));
            return props.children ?? null;
        })
    };
});

function settingsStore(): Settings {
    const values = new Map<string, string | null>();
    const storage: SettingsStorage = {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => values.set(key, value)
    };
    return new Settings(storage);
}

function recipe(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function HintRows({settings}: {settings: Settings}) {
    const drawerHint = useDrawerHint(settings);
    const rows = [recipe("First"), recipe("Second")];
    return (
        <>
            {rows.map((row, index) => (
                <SwipeableRecipeRow key={row.uuid}
                                    recipe={row}
                                    onPress={jest.fn()}
                                    onDelete={jest.fn()}
                                    onDuplicate={jest.fn()}
                                    hintTray={drawerHint.trayFor(index)}
                                    hintDelayMs={drawerHint.delayFor(index)}
                                    onShown={drawerHint.noteShown}
                                    onBounced={() => drawerHint.noteBounced(index)}/>
            ))}
        </>
    );
}

function holdReducedMotionRead() {
    let settle: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(
        new Promise((resolve) => {
            settle = resolve;
        })
    );
    return settle;
}

describe("drawer hint reduced-motion startup", () => {
    beforeEach(() => {
        jest.useFakeTimers({now: 1_000_000_000});
        __resetReducedMotion();
        mockOpenLeft.mockClear();
        mockOpenRight.mockClear();
        mockClose.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("waits for the first reduced-motion read before delivering the lesson", async () => {
        const settle = holdReducedMotionRead();
        const settings = settingsStore();

        await renderWithProviders(<HintRows settings={settings}/>);

        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY + STAGGER.drawerHint);
        });

        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => {
            settle(false);
        });
        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_OPEN_DELAY);
        });
        expect(mockOpenLeft).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(STAGGER.drawerHint);
        });
        expect(mockOpenRight).toHaveBeenCalledTimes(1);
        expect(settings.get("drawerHintShownCount")).toBe(1);
    });

    it("suppresses the lesson permanently when the first reduced-motion read resolves true", async () => {
        const settle = holdReducedMotionRead();
        const settings = settingsStore();

        await renderWithProviders(<HintRows settings={settings}/>);

        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY + STAGGER.drawerHint);
        });

        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => {
            settle(true);
        });
        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY + STAGGER.drawerHint);
        });

        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(settings.get("drawerHintShownCount")).toBe(0);
    });
});
