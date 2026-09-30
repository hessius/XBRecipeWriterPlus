/**
 * Props every long list in the app passes, for reasons that are not about that
 * list in particular.
 */

/**
 * Turn off the row clipping React Native turns on for us on Android.
 *
 * `removeClippedSubviews` defaults to **true on Android and false on iOS**, so
 * for the whole life of this app as an iOS app the Android half of that default
 * was never exercised. Under Fabric it detaches a row's views and then fails to
 * account for where it put them, and the next commit that moves a view across
 * parents throws from native:
 *
 *     addViewAt: cannot insert view [x] into parent [y]:
 *     View already has a parent
 *     Caused by: The specified child already has a parent.
 *         at ReactClippingViewManager.addView
 *
 * which takes the process with it. It is reachable from the library screen by
 * importing a recipe, because the import lands a new row into a mounted list.
 *
 * The optimisation it turns off is one Fabric largely does for itself, so this
 * costs little; an unmeasurable saving is not worth a crash on the main path
 * either way. Spread it into every `FlatList` rather than naming the prop at
 * each call site, so a new list inherits the answer instead of rediscovering
 * the crash.
 */
export const UNCLIPPED_LIST = {removeClippedSubviews: false} as const;
