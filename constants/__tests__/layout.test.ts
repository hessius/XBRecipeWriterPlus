import {tokens} from "@tamagui/themes";

import {RECORD_ACTION_GAP, SCREEN_PADDING} from "@/constants/layout";

describe("SCREEN_PADDING", () => {
    it("is Tamagui's $4, which is what the screens actually pad with", () => {
        // Indexed by `4`, not `$4`: Tamagui strips the sigil at runtime while
        // its types keep it, so this is the one place that reconciles them.
        const token = (tokens.space as unknown as Record<number, {val: number}>)[4];

        expect(SCREEN_PADDING).toBe(Number(token.val));
    });
});

describe("RECORD_ACTION_GAP", () => {
    it("is Tamagui's $3, which is what paired record actions actually gap with", () => {
        // Indexed by `3`, not `$3`: Tamagui strips the sigil at runtime while
        // its types keep it, so this is the one place that reconciles them.
        const token = (tokens.space as unknown as Record<number, {val: number}>)[3];

        expect(RECORD_ACTION_GAP).toBe(Number(token.val));
    });
});
