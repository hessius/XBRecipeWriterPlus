import {morphStyle, type Rect} from "@/components/HeroMorph";

const card: Rect = {x: 12, y: 300, width: 360, height: 120};
const hero: Rect = {x: 0, y: 0, width: 390, height: 220};

describe("morphStyle", () => {
    it("starts on the card it was tapped from", () => {
        const style = morphStyle(0, card, hero);

        expect(style.left).toBe(12);
        expect(style.top).toBe(300);
        expect(style.width).toBe(360);
        expect(style.height).toBe(120);
    });

    it("arrives on the hero", () => {
        const style = morphStyle(1, card, hero);

        expect(style.left).toBe(0);
        expect(style.top).toBe(0);
        expect(style.width).toBe(390);
        expect(style.height).toBe(220);
    });

    it("moves through the space between the two", () => {
        const style = morphStyle(0.5, card, hero);

        expect(style.left).toBe(6);
        expect(style.top).toBe(150);
        expect(style.width).toBe(375);
        expect(style.height).toBe(170);
    });

    it("squares off the top corners on the way, where the hero meets the status bar", () => {
        expect(morphStyle(0, card, hero).borderTopLeftRadius).toBe(20);
        expect(morphStyle(1, card, hero).borderTopLeftRadius).toBe(0);
        expect(morphStyle(1, card, hero).borderBottomLeftRadius).toBe(28);
    });

    it("stays solid for most of the travel", () => {
        expect(morphStyle(0, card, hero).opacity).toBe(1);
        expect(morphStyle(0.5, card, hero).opacity).toBe(1);
        expect(morphStyle(0.72, card, hero).opacity).toBe(1);
    });

    it("hands over to the real hero at the end", () => {
        expect(morphStyle(0.86, card, hero).opacity).toBeCloseTo(0.5, 1);
        expect(morphStyle(1, card, hero).opacity).toBe(0);
    });
});
