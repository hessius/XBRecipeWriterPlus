import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import EasyModeSlots from "@/components/EasyModeSlots";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {SLOT_INTEGRATION_BLOCK} from "@/library/slots/slotWriter";

const recipes = [coffee("Morning"), coffee("Evening")];
const props = () => ({
    record: emptySlotRecord(), recipes, deviceId: "one", connected: true,
    available: false, running: false, error: null,
    onAssign: jest.fn(), onWrite: jest.fn(), onRecover: jest.fn()
});

it("shows unknown first-use contents, both side effects and an honest integration block", async () => {
    await renderWithProviders(<EasyModeSlots {...props()}/>);
    expect(screen.getByText(/cannot tell us what is already/i)).toBeOnTheScreen();
    expect(screen.getByText(/leaves your machine in EASY/i)).toBeOnTheScreen();
    expect(screen.getByText(SLOT_INTEGRATION_BLOCK)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
});

it("offers explicit full-set replacement without mutating an existing slot", async () => {
    const options = props();
    const snapshot = snapshotRecipe(recipes[0]);
    options.record.drafts = [snapshot, snapshot, snapshot];
    await renderWithProviders(<EasyModeSlots {...options} incoming={recipes[1]}/>);
    expect(options.onAssign).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "Put Evening in slot B"}));
    expect(options.onAssign).toHaveBeenCalledWith(1, recipes[1]);
});

it("keeps the incoming replacement available when persistence refuses assignment", async () => {
    const options = props();
    options.onAssign.mockReturnValue(false);
    await renderWithProviders(<EasyModeSlots {...options} incoming={recipes[1]}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Put Evening in slot B"}));
    expect(screen.getByRole("button", {name: "Put Evening in slot B"})).toBeOnTheScreen();
});

it("distinguishes removed recipes from edited drafts and permits only explicit updates", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.drafts = [saved, snapshotRecipe(coffee("Removed")), null];
    const changed = coffee("Morning");
    changed.uuid = recipes[0].uuid;
    changed.pours[0].temperature = 92;
    await renderWithProviders(<EasyModeSlots {...options} recipes={[changed]}/>);
    expect(screen.getByText("Edited since assignment")).toBeOnTheScreen();
    expect(screen.getByText("Recipe removed from library. Snapshot kept.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {name: "Update slot A from library"}));
    expect(options.onAssign).toHaveBeenCalledWith(0, changed);
});

it("locks uncertain recovery and reports native-send versus receipt distinctions", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 1,
        inFlight: 1, error: "Receipt unknown"
    };
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("A: acknowledged")).toBeOnTheScreen();
    expect(screen.getByText("B: receipt unknown")).toBeOnTheScreen();
    expect(screen.getByText("C: not sent")).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Recover incomplete write"})).toBeDisabled();
    expect(screen.queryByRole("button", {name: "Change slot A recipe"})).toBeNull();
});

it("picks from all supplied library recipes and exposes unsupported recipe reasons", async () => {
    const options = props();
    const bypass = coffee("Bypass");
    bypass.bypassEnabled = true;
    await renderWithProviders(<EasyModeSlots {...options} recipes={[...recipes, bypass]}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot C recipe"}));
    expect(await screen.findByText("Evening")).toBeOnTheScreen();
    expect(await screen.findByText(/Recipes with bypass are not supported/)).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Evening"}));
        expect(options.onAssign).toHaveBeenCalledWith(2, recipes[1]);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});
