/**
 * The padding a full-screen view uses, in points.
 *
 * Equal to Tamagui's `$4` space token, which is what those screens actually
 * write as `padding="$4"`. It exists as a number because an SVG cannot be
 * given a `$token`: the trace measures the window and subtracts this to find
 * the width it may draw in.
 *
 * It was written as 16 in two screens, and `$4` is 18, so the trace was laid
 * out four points wider than the box containing it and bled into the
 * right-hand padding. `constants/__tests__/layout.test.ts` holds it against
 * the token so the two cannot drift again — the token is read there rather
 * than here because its runtime keys (`4`) and its published types (`$4`)
 * disagree, and a test can say so once instead of every call site casting.
 */
export const SCREEN_PADDING = 18;

/**
 * The gap between paired finished-record action buttons.
 *
 * Equal to Tamagui's `$3` space token. `app/brewRecord.tsx` subtracts the same
 * value it writes as the row gap when it calculates each half-width button. If
 * those drift, two paired actions overflow their row by the difference.
 */
export const RECORD_ACTION_GAP = 13;
