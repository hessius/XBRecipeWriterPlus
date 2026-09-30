import {BAR_FLOOR, GAP_FLOOR} from "@/library/brew/bands";
import {dotoRowHeight} from "@/library/dotoMetrics";

export function stageLadderRungMinHeight(
    fontScale: number,
    barHeight = BAR_FLOOR,
    rungGap = GAP_FLOOR
): number {
    return Math.ceil(Math.max(barHeight, dotoRowHeight(12, fontScale)) + rungGap);
}
