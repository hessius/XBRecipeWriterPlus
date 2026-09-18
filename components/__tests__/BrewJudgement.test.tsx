import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import BrewJudgement from "@/components/BrewJudgement";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewJudgement", () => {
    const draw = (props: Partial<React.ComponentProps<typeof BrewJudgement>> = {}) =>
        renderWithProviders(
            <BrewJudgement rating={0} note="" onRate={jest.fn()} onNote={jest.fn()}
                           {...props} />
        );

    it("lets the return key close the keyboard", async () => {
        // The one screen this field appears on puts it at the bottom of a
        // modal with the keyboard over everything else, so "tap somewhere
        // else" is not a way out of it.
        await draw();
        const field = screen.getByTestId("judgement-note");

        expect(field.props.returnKeyType).toBe("done");
        expect(field.props.submitBehavior).toBe("blurAndSubmit");
    });

    it("still wraps a note too long for one line", async () => {
        // `multiline` is why the field grows rather than scrolling sideways.
        // Blurring on return is not a reason to give that up.
        await draw();
        expect(screen.getByTestId("judgement-note").props.multiline).toBe(true);
    });

    it("commits the note when the field is left", async () => {
        const onNote = jest.fn();
        await draw({onNote});

        await fireEvent(screen.getByTestId("judgement-note"), "endEditing",
            {nativeEvent: {text: "Sweet, a little thin."}});

        expect(onNote).toHaveBeenCalledWith("Sweet, a little thin.");
    });

    it("does not hand the note back on every keystroke", async () => {
        // Uncontrolled on purpose: a value returned per keystroke fights the
        // cursor, which is why every text field in the editor does this.
        const onNote = jest.fn();
        await draw({onNote});

        await fireEvent.changeText(screen.getByTestId("judgement-note"), "Sou");

        expect(onNote).not.toHaveBeenCalled();
    });

    it("shows the note it was given", async () => {
        await draw({note: "Grind finer."});
        expect(screen.getByTestId("judgement-note").props.defaultValue)
            .toBe("Grind finer.");
    });
});
