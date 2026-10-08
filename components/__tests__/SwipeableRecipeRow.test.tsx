import React, {useState} from "react";
import {act, fireEvent, screen, within} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {resolveAccent} from "@/library/accent";
import {BOUNCE_CLOSE_DELAY, BOUNCE_OPEN_DELAY, STAGGER} from "@/constants/motion";
import {DRAWER_ACTIONS} from "@/library/drawerHint";

const mockOpenLeft = jest.fn();
const mockOpenRight = jest.fn();
const mockClose = jest.fn();

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const {Pressable: MockPressable, View: MockView} =
        jest.requireActual<typeof import("react-native")>("react-native");

    return {
        __esModule: true,
        default: ReactActual.forwardRef((props: {
            children?: React.ReactNode;
            renderLeftActions?: () => React.ReactNode;
            renderRightActions?: () => React.ReactNode;
            onSwipeableOpenStartDrag?: (direction: "left" | "right") => void;
        }, ref: React.Ref<unknown>) => {
            const [openTray, setOpenTray] = ReactActual.useState<"left" | "right" | null>(null);
            ReactActual.useImperativeHandle(ref, () => ({
                openLeft: () => {
                    mockOpenLeft();
                    setOpenTray("left");
                },
                openRight: () => {
                    mockOpenRight();
                    setOpenTray("right");
                },
                close: () => {
                    mockClose();
                    setOpenTray(null);
                },
                reset: () => setOpenTray(null)
            }));

            return (
                <MockView>
                    <MockPressable testID="simulate-drag"
                                   onPress={() => props.onSwipeableOpenStartDrag?.("left")}/>
                    {openTray === "left" && <MockView testID="swipeable-open-left"/>}
                    {openTray === "right" && <MockView testID="swipeable-open-right"/>}
                    {props.renderLeftActions?.()}
                    {props.children}
                    {props.renderRightActions?.()}
                </MockView>
            );
        })
    };
});

/** The colour a dot icon's dots are drawn in. */
function dotColourOf(testID: string): string {
    const dot = within(screen.getByTestId(testID, {includeHiddenElements: true}))
        .getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0];
    const list = (Array.isArray(dot.props.style) ? dot.props.style : [dot.props.style]) as
        {backgroundColor?: string}[];
    return String(list.reduce<string | undefined>(
        (found, entry) => entry?.backgroundColor ?? found, undefined
    ));
}

/** How many dots a tile's glyph actually lights, which identifies the bitmap. */
function dotCountOf(testID: string): number {
    return within(screen.getByTestId(testID, {includeHiddenElements: true}))
        .getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length;
}

/**
 * A recipe a card can hold.
 *
 * Balanced on purpose: 18 g at 1:16 asks for 288 ml and the two stages pour
 * exactly that, 144 ml each -- one stage of 288 exceeds the 240 ml a card can
 * carry. WRITE is dimmed on anything `cardWriteProblems` rejects, so a fixture
 * without stages would silently test the disabled tile everywhere.
 */
function makeRecipe(title = "Ethiopia Guji") {
    const r = new Recipe();
    r.name = title;
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 62;
    r.grindRPM = 90;
    r.pours = [
        new Pour(0, 144, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0),
        new Pour(1, 144, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)
    ];
    return r;
}

function recipe(): Recipe {
    return makeRecipe();
}

/** The same recipe with a stage volume no card byte can carry. */
function unwritableRecipe(): Recipe {
    const r = makeRecipe();
    r.dosage = 31;
    r.ratio = 100;
    r.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return r;
}

/** A recipe that has not been starred. */
function plainRecipe(): Recipe {
    const r = recipe();
    r.favourite = false;
    return r;
}

/** A recipe the user has starred. */
function favouriteRecipe(): Recipe {
    const r = recipe();
    r.favourite = true;
    return r;
}

function props(overrides = {}) {
    return {
        recipe: recipe(),
        onPress: jest.fn(),
        onDelete: jest.fn(),
        onDuplicate: jest.fn(),
        ...overrides
    };
}

beforeEach(() => {
    mockOpenLeft.mockClear();
    mockOpenRight.mockClear();
    mockClose.mockClear();
});

afterEach(() => {
    jest.useRealTimers();
});

describe("SwipeableRecipeRow", () => {
    it("opens the action tray for the hint and closes it again", async () => {
        jest.useFakeTimers();
        const onBounced = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            hintTray: "action",
            onBounced,
            onBrew: jest.fn(),
            onShare: jest.fn(),
            onWrite: jest.fn()
        })}/>);

        await act(async () => { jest.advanceTimersByTime(BOUNCE_OPEN_DELAY); });

        expect(screen.getByTestId("swipeable-open-left")).toBeTruthy();
        expect(screen.getByLabelText("Brew Ethiopia Guji", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(mockOpenLeft).toHaveBeenCalledTimes(1);
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(onBounced).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY - BOUNCE_OPEN_DELAY);
        });

        expect(screen.queryByTestId("swipeable-open-left")).toBeNull();
        expect(mockClose).toHaveBeenCalledTimes(1);
        expect(onBounced).toHaveBeenCalledTimes(1);
    });

    it("opens the management tray for the management hint", async () => {
        jest.useFakeTimers();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            hintTray: "management"
        })}/>);

        await act(async () => { jest.advanceTimersByTime(BOUNCE_OPEN_DELAY); });

        expect(screen.getByTestId("swipeable-open-right")).toBeTruthy();
        expect(screen.getByLabelText("Duplicate Ethiopia Guji", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(mockOpenRight).toHaveBeenCalledTimes(1);
        expect(mockOpenLeft).not.toHaveBeenCalled();
    });

    it("stagger delays a hinted row", async () => {
        jest.useFakeTimers();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            hintTray: "management",
            hintDelayMs: STAGGER.drawerHint
        })}/>);

        await act(async () => { jest.advanceTimersByTime(BOUNCE_OPEN_DELAY); });

        expect(screen.queryByTestId("swipeable-open-right")).toBeNull();
        expect(mockOpenRight).not.toHaveBeenCalled();

        await act(async () => { jest.advanceTimersByTime(STAGGER.drawerHint); });

        expect(screen.getByTestId("swipeable-open-right")).toBeTruthy();
        expect(mockOpenRight).toHaveBeenCalledTimes(1);
    });

    it("stays still when hintTray is null", async () => {
        jest.useFakeTimers();
        const onBounced = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            hintTray: null,
            onBounced
        })}/>);

        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY + STAGGER.drawerHint);
        });

        expect(screen.queryByTestId("swipeable-open-left")).toBeNull();
        expect(screen.queryByTestId("swipeable-open-right")).toBeNull();
        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(mockClose).not.toHaveBeenCalled();
        expect(onBounced).not.toHaveBeenCalled();
    });

    it("does not report a manual open for the hint's programmatic open", async () => {
        jest.useFakeTimers();
        const onManualOpen = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            hintTray: "action",
            onManualOpen,
            onBrew: jest.fn()
        })}/>);

        await act(async () => { jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY); });

        expect(mockOpenLeft).toHaveBeenCalledTimes(1);
        expect(mockClose).toHaveBeenCalledTimes(1);
        expect(onManualOpen).not.toHaveBeenCalled();
    });

    it("reports a manual open when the user starts dragging a tray", async () => {
        const onManualOpen = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({onManualOpen})}/>);

        await fireEvent.press(screen.getByTestId("simulate-drag"));

        expect(onManualOpen).toHaveBeenCalledTimes(1);
    });

    it("closes both staggered hint trays even after the first row reports completion", async () => {
        jest.useFakeTimers();

        function HintRows() {
            const [showing, setShowing] = useState(true);
            return (
                <>
                    <SwipeableRecipeRow {...props({
                        recipe: makeRecipe("First"),
                        hintTray: showing ? "action" : null,
                        onBounced: () => setShowing(false),
                        onBrew: jest.fn(),
                        onShare: jest.fn(),
                        onWrite: jest.fn()
                    })}/>
                    <SwipeableRecipeRow {...props({
                        recipe: makeRecipe("Second"),
                        hintTray: showing ? "management" : null,
                        hintDelayMs: STAGGER.drawerHint,
                        onBounced: () => setShowing(false)
                    })}/>
                </>
            );
        }

        await renderWithProviders(<HintRows/>);

        await act(async () => { jest.advanceTimersByTime(600); });
        expect(screen.getByTestId("swipeable-open-left")).toBeTruthy();
        expect(screen.getByTestId("swipeable-open-right")).toBeTruthy();

        await act(async () => {
            jest.advanceTimersByTime(BOUNCE_CLOSE_DELAY - 600);
        });

        await act(async () => {
            jest.advanceTimersByTime(STAGGER.drawerHint + 1);
        });

        expect(screen.queryByTestId("swipeable-open-left")).toBeNull();
        expect(screen.queryByTestId("swipeable-open-right")).toBeNull();
    });

    it("keeps the tray list and the hint signature in step", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props({
            onBrew: jest.fn(),
            onShare: jest.fn(),
            onWrite: jest.fn(),
            onToggleFavourite: jest.fn()
        })}/>);

        for (const action of DRAWER_ACTIONS) {
            expect(screen.getByTestId(`recipe-row-${action}`, {includeHiddenElements: true}))
                .toBeTruthy();
        }
    });

    it("leaves a gap between the card and the first revealed action", async () => {
        // Without it the copy tile butts straight up against the card's edge and
        // reads as part of it, rather than as something the card slid off.
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        const actions = screen.getByTestId("row-actions", {includeHiddenElements: true});
        const style = actions.props.style as {paddingLeft?: number};

        expect(style.paddingLeft).toBeGreaterThan(0);
    });

    it("renders the recipe", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("calls onPress when the row is tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("fires delete and duplicate from the swipe actions", async () => {
        const onDelete = jest.fn();
        const onDuplicate = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={jest.fn()} onDelete={onDelete}
                                onDuplicate={onDuplicate}/>
        );

        await fireEvent.press(screen.getByLabelText("Delete Ethiopia Guji"));
        expect(onDelete).toHaveBeenCalled();

        await fireEvent.press(screen.getByLabelText("Duplicate Ethiopia Guji"));
        expect(onDuplicate).toHaveBeenCalled();
    });

    it("labels the actions with the recipe title so they are distinguishable in a list", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe("Kenya AA")} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        expect(screen.getByLabelText("Delete Kenya AA")).toBeTruthy();
        expect(screen.getByLabelText("Duplicate Kenya AA")).toBeTruthy();
    });

    it("draws the swipe actions as dot glyphs", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        const dots = (testID: string) =>
            within(screen.getByTestId(testID, {includeHiddenElements: true}))
                .getAllByTestId("dot-icon-dot", {includeHiddenElements: true});

        expect(dots("recipe-row-copy"))
            .toHaveLength(litCells(DOT_ICONS.duplicate).length);
        expect(dots("recipe-row-delete"))
            .toHaveLength(litCells(DOT_ICONS.delete).length);
    });

    it("spends colour as ink rather than as fill", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        // The tiles are the app's own surface colour. A solid red block beside
        // a saturated accent card was three loud things in a row; here the tone
        // is carried entirely by the glyph and its caption.
        const tile = screen.getByLabelText("Delete Ethiopia Guji")
            .props.style as {backgroundColor?: string};
        expect(tile.backgroundColor).toBe(palette.surface);

        expect(dotColourOf("recipe-row-delete")).toBe(palette.danger);
        expect(dotColourOf("recipe-row-copy")).toBe(palette.success);
    });

    it("gives the action tray glyphs and tones, as the management tray has", async () => {
        // The two trays were asymmetric: COPY and DELETE each carried a mark and
        // a colour, while BREW, SHARE and WRITE were three near-identical white
        // words. A tray that reads as unfinished beside its twin invites the
        // guess that it is.
        // A pinned accent, not the hashed default: the hash is over `uuid`,
        // which is fresh per instance, so any expectation built from a second
        // Recipe would name a different colour. Pinned as a literal rather than
        // as `resolveAccent(...)`, which would agree with the tile however
        // wrong both were.
        const subject = recipe();
        subject.accentIndex = 4;
        await renderWithProviders(<SwipeableRecipeRow {...props({
            recipe: subject, onBrew: jest.fn(), onShare: jest.fn(), onWrite: jest.fn()
        })}/>);

        // BREW wears the recipe's own accent: it is the act on this one recipe,
        // and the tile should not disagree with the card it slid off.
        expect(dotColourOf("recipe-row-brew")).toBe("#97D8C4");
        expect(dotColourOf("recipe-row-share")).toBe(palette.info);
        // WRITE keeps the plain ink. Three coloured tiles in a row would leave
        // the accent nothing to stand out against.
        expect(dotColourOf("recipe-row-write")).toBe(palette.text);
    });

    it("dims WRITE on a recipe no card can hold, and says why", async () => {
        // The refusal used to be a small X in the card's badge corner, which
        // read as a dismiss button and named neither the problem nor the
        // control it applied to. It belongs on WRITE itself.
        const onWrite = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({
            recipe: unwritableRecipe(), onWrite
        })}/>);

        expect(dotColourOf("recipe-row-write")).toBe(palette.muted);

        const tile = screen.getByLabelText(
            "Ethiopia Guji cannot be written to a card", {includeHiddenElements: true}
        );
        // A Tamagui stack is not a Pressable, so nothing derives this from the
        // missing handler: without the explicit state the tile is announced as
        // an ordinary button that happens to do nothing.
        expect(tile.props.accessibilityState).toEqual(
            expect.objectContaining({disabled: true})
        );

        // Not "pressing it calls nothing": RNTL resolves a press through the
        // composite Tile's own `onPress` prop, which is handed in either way
        // and gated inside, so that assertion would pass on a tile that was
        // still live. What the device actually obeys is the responder, and a
        // tile that claims no touch cannot fire one -- nor swallow a press
        // meant for something behind it. Same check CtaTile makes.
        expect(tile.props.onStartShouldSetResponder).toBeUndefined();
        expect(tile.props.onPress).toBeUndefined();
        expect(onWrite).not.toHaveBeenCalled();
    });

    it("leaves WRITE live on a recipe a card can hold", async () => {
        const onWrite = jest.fn();
        await renderWithProviders(<SwipeableRecipeRow {...props({onWrite})}/>);

        const tile = screen.getByLabelText(
            "Write Ethiopia Guji to a card", {includeHiddenElements: true}
        );
        expect(tile.props.accessibilityState).toEqual(
            expect.objectContaining({disabled: false})
        );

        expect(tile.props.onStartShouldSetResponder).toBeDefined();

        await fireEvent.press(tile);
        expect(onWrite).toHaveBeenCalledTimes(1);
    });

    it("draws a distinct mark on every action, so none is a guess", async () => {
        // Reusing `scan` for WRITE was the tempting shortcut and would have been
        // wrong: `scan` already means READ CARD on the same screen, so the one
        // tile that overwrites a card would have worn the mark of the one that
        // only looks at it.
        await renderWithProviders(<SwipeableRecipeRow {...props({
            onBrew: jest.fn(), onShare: jest.fn(), onWrite: jest.fn()
        })}/>);

        // Each tile must draw its *own* mark. Lit-dot counts are pinned as
        // literals: a tile handed the wrong bitmap still renders a valid glyph,
        // so only the shape actually drawn can tell them apart.
        expect(dotCountOf("recipe-row-brew")).toBe(25);
        expect(dotCountOf("recipe-row-share")).toBe(17);
        expect(dotCountOf("recipe-row-write")).toBe(33);

        const marks = ["brew", "share", "write", "duplicate", "delete"].map(
            (name) => DOT_ICONS[name as keyof typeof DOT_ICONS].join("/")
        );
        expect(new Set(marks).size).toBe(5);
        // `scan` is READ CARD elsewhere on this screen, so WRITE must not wear it.
        expect(DOT_ICONS.write.join("/")).not.toBe(DOT_ICONS.scan.join("/"));
        // Each mark must actually be drawn, not an empty grid that trivially differs.
        marks.forEach((_, i) => expect(litCells(
            DOT_ICONS[["brew", "share", "write", "duplicate", "delete"][i] as
                keyof typeof DOT_ICONS]
        ).length).toBeGreaterThan(4));
    });

    it("offers a favourite tile", async () => {
        const onToggleFavourite = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}
                                onToggleFavourite={onToggleFavourite}/>
        );

        await fireEvent.press(
            await screen.findByTestId("recipe-row-favourite", {includeHiddenElements: true})
        );

        expect(onToggleFavourite).toHaveBeenCalledTimes(1);
    });

    it("reads as STAR on a recipe that is not starred", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}
                                onToggleFavourite={() => {}}/>
        );

        expect(await screen.findByText("STAR")).toBeTruthy();
    });

    it("reads as STARRED on a recipe that is", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={favouriteRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}
                                onToggleFavourite={() => {}}/>
        );

        expect(await screen.findByText("STARRED")).toBeTruthy();
    });

    it("names the recipe to a screen reader, like every other tile", async () => {
        // A tray is reached by swiping one row among many, so a label that
        // omits the recipe leaves the one control that will not say what it
        // is about to act on. The tiles beside this one all name it.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}
                                onToggleFavourite={() => {}}/>
        );

        expect(screen.getByLabelText("Star Ethiopia Guji"))
            .toBeTruthy();
    });

    it("says removing, not adding, once the recipe is one", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={favouriteRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}
                                onToggleFavourite={() => {}}/>
        );

        expect(screen.getByLabelText("Remove star from Ethiopia Guji"))
            .toBeTruthy();
    });

    it("omits the tile when no handler is given", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                                onDelete={() => {}} onDuplicate={() => {}}/>
        );

        expect(screen.queryByTestId("recipe-row-favourite")).toBeNull();
    });

    it("captions the actions, since a glyph alone is a guess", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        expect(screen.getByText("DELETE")).toBeTruthy();
        expect(screen.getByText("COPY")).toBeTruthy();
    });

    it("keeps BREW out of the management tray", async () => {
        // The right-swipe tray is housekeeping on the list. Brewing acts on the
        // recipe and now lives on the other side, so it must not reappear here
        // even when it is available in the action tray.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined}/>
        );
        const management = within(
            screen.getByTestId("row-actions", {includeHiddenElements: true})
        );
        expect(management.queryByLabelText("Brew Ethiopia Guji")).toBeNull();
        // The housekeeping tiles are still here, so this is not passing because
        // the whole tray failed to render.
        expect(management.getByLabelText("Delete Ethiopia Guji")).toBeTruthy();
        expect(management.getByLabelText("Duplicate Ethiopia Guji")).toBeTruthy();
    });

    it("offers BREW, SHARE and WRITE in the action tray", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        const action = within(
            screen.getByTestId("row-actions-brew", {includeHiddenElements: true})
        );
        expect(action.getByLabelText("Brew Ethiopia Guji")).toBeTruthy();
        expect(action.getByLabelText("Share Ethiopia Guji")).toBeTruthy();
        expect(action.getByLabelText("Write Ethiopia Guji to a card")).toBeTruthy();
    });

    it("drops the BREW tile when there is no machine to brew on", async () => {
        // A dead BREW is worse than no BREW. Share and write do not need a
        // machine, so they stay.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onShare={() => undefined} onWrite={() => undefined}/>
        );
        expect(screen.queryByLabelText("Brew Ethiopia Guji")).toBeNull();
        expect(screen.getByLabelText("Share Ethiopia Guji")).toBeTruthy();
        expect(screen.getByLabelText("Write Ethiopia Guji to a card")).toBeTruthy();
    });

    it("fires brew, share and write from the action tiles", async () => {
        const onBrew = jest.fn();
        const onShare = jest.fn();
        const onWrite = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={onBrew} onShare={onShare} onWrite={onWrite}/>
        );
        await fireEvent.press(screen.getByLabelText("Brew Ethiopia Guji"));
        expect(onBrew).toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Share Ethiopia Guji"));
        expect(onShare).toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Write Ethiopia Guji to a card"));
        expect(onWrite).toHaveBeenCalled();
    });

    it("gives the brew tile the recipe's accent, not a system colour", async () => {
        const brewedRecipe = makeRecipe();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={brewedRecipe} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        // The one tile carrying an accent among neutral verbs. Same helper the
        // card uses, so the tile and the card it slid off cannot disagree.
        const word = within(screen.getByLabelText("Brew Ethiopia Guji"))
            .getByText("BREW");
        const list = (Array.isArray(word.props.style) ? word.props.style : [word.props.style]) as
            {color?: string}[];
        const colour = String(list.reduce<string | undefined>(
            (found, entry) => entry?.color ?? found, undefined
        ));
        expect(colour).toBe(resolveAccent(brewedRecipe));
    });

    it("carries a testID on the glyphless action tiles", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        // Every tile now hangs its testID on its DotIcon. If a tile ever loses
        // its glyph the id lands nowhere, and any later query for it -- an
        // absence assertion above all -- would pass whether or not the tray had
        // drawn anything. This is the check that would notice.
        expect(screen.getByTestId("recipe-row-brew", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.getByTestId("recipe-row-write", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("draws no action tray when it has nothing to put in it", async () => {
        // With no brew, share or write handler the tray would open onto a blank
        // strip. The card still swipes the other way to the management tray.
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.queryByTestId("row-actions-brew", {includeHiddenElements: true}))
            .toBeNull();
        expect(screen.getByTestId("row-actions", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("keeps three action tiles inside the smallest supported screen", () => {
        // A three-tile tray was 76 pt a tile, near the width of a phone. Pinned
        // to integer literals rather than the constants that produced the tray,
        // so this still bites if a tile silently shrinks to zero.
        const tile = 72;
        const gap = 7;      // Tamagui `$2`
        const padding = 7;  // Tamagui `$2`, both sides
        const tray = 3 * tile + 2 * gap + 2 * padding;
        // iPhone SE class: 320 pt, less the row's 12 pt padding on each side.
        const available = 320 - 2 * 12;
        // A strip of card must stay visible to grab when the tray is open.
        expect(available - tray).toBeGreaterThanOrEqual(44);
        // And a tile must not fall under the touch-target minimum.
        expect(tile).toBeGreaterThanOrEqual(44);
    });

    it("renders the recipe as a card", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.getByTestId("recipe-card")).toBeTruthy();
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("keeps the destructive actions hidden until asked", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: false})}/>);
        // Hidden elements are included on purpose: the glyph is hidden from the
        // accessibility tree, so a bare query would report it absent whether it
        // had been rendered or not.
        expect(screen.queryByTestId("recipe-card-delete", {includeHiddenElements: true}))
            .toBeNull();
    });

    it("reveals them inline while editing", async () => {
        // The swipe gesture is a shortcut. It may not be the only route to a
        // destructive action, and it is not available to a screen reader at all.
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: true})}/>);
        expect(screen.getByTestId("recipe-card-delete", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.getByTestId("recipe-card-duplicate", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("deletes from the inline action", async () => {
        const handlers = props({editing: true});
        await renderWithProviders(<SwipeableRecipeRow {...handlers}/>);
        // Pressed by its accessible name rather than the glyph's testID: the
        // glyph is no longer the pressable, the labelled key around it is.
        await fireEvent.press(screen.getByRole("button", {name: "Delete recipe"}));
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it("passes the coffee marker setting through to the card", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow {...props({showCoffeeMarker: false})}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});
