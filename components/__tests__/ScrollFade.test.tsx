import React from "react";
import {makeMutable} from "react-native-reanimated";

import ScrollFade from "@/components/ScrollFade";
import {FADE_HEIGHT} from "@/library/scrollFade";
import {renderWithProviders} from "@/test-utils/render";

/**
 * Every query here passes `includeHiddenElements`. That is not a workaround:
 * the fade hides itself from the accessibility tree, and RNTL's default is to
 * query the tree a screen reader would walk, so a fade that is findable by
 * default is a fade that has stopped hiding. Removing the two accessibility
 * props makes these queries pass without the option and the test below fail,
 * which is the right way round.
 */
describe("ScrollFade", () => {
    /**
     * The fade sits over the last rung of the stage ladder, which is real
     * content. If it took a tap, the thing it covers would become unreachable
     * in exchange for a hint about reaching it.
     */
    it("does not take touches", async () => {
        const progress = makeMutable(1);
        const {getByTestId} = await renderWithProviders(
            <ScrollFade progress={progress} testID="fade" />
        );
        expect(getByTestId("fade", {includeHiddenElements: true}).props.pointerEvents).toBe("none");
    });

    /**
     * It is decorative, and a screen reader walking the summary should reach
     * the stages rather than a gradient. Both props are needed: the first is
     * iOS, the second is Android.
     */
    it("is hidden from screen readers on both platforms", async () => {
        const progress = makeMutable(1);
        const {getByTestId} = await renderWithProviders(
            <ScrollFade progress={progress} testID="fade" />
        );
        const node = getByTestId("fade", {includeHiddenElements: true});
        expect(node.props.accessibilityElementsHidden).toBe(true);
        expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
    });

    /**
     * It is pinned to the bottom edge of whatever it is placed in, and it is
     * exactly as tall as the gradient it draws. A fade taller than its own
     * Svg would leave a band of the parent's background sitting over the
     * content below it.
     */
    it("sits on the bottom edge at the gradient's own height", async () => {
        const progress = makeMutable(0);
        const {getByTestId} = await renderWithProviders(
            <ScrollFade progress={progress} testID="fade" />
        );
        const style = Object.assign({}, ...[getByTestId("fade", {includeHiddenElements: true}).props.style].flat());
        expect(style.position).toBe("absolute");
        expect(style.bottom).toBe(0);
        expect(style.left).toBe(0);
        expect(style.right).toBe(0);
        expect(style.height).toBe(FADE_HEIGHT);
    });

    /**
     * React's own id is punctuated (`:r0:`), and punctuation is not valid in
     * an SVG `url(#...)` reference, so an unstripped id resolves to nothing
     * and the fade draws as a transparent rectangle. It fails silently and it
     * fails everywhere, which is why it is worth a test of its own rather
     * than a look.
     */
    it("builds a gradient id an SVG reference can resolve", async () => {
        const progress = makeMutable(1);
        const {toJSON} = await renderWithProviders(
            <ScrollFade progress={progress} testID="fade" />
        );
        const ids = JSON.stringify(toJSON())
            .match(/scroll-fade-[^"\\)]*/g) ?? [];
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(id).toMatch(/^scroll-fade-[a-zA-Z0-9]*$/);
    });

    /**
     * Two fades on one screen must not share a gradient id. SVG resolves
     * `url(#id)` against the whole document, so a duplicate id means the
     * second fade silently paints with the first one's colour.
     */
    it("gives each instance its own gradient", async () => {
        const progress = makeMutable(1);
        const {toJSON} = await renderWithProviders(
            <>
                <ScrollFade progress={progress} testID="a" />
                <ScrollFade progress={progress} testID="b" />
            </>
        );
        const ids = JSON.stringify(toJSON())
            .match(/scroll-fade-[^"\\)]+/g) ?? [];
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBeGreaterThan(1);
    });
});
