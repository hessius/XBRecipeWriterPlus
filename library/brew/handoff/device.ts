/**
 * What we call the machine, everywhere.
 *
 * Deliberately under-claimed. We cannot yet tell a Studio from an original
 * (#138 would read the BLE Device Information Service, characteristic
 * 0x180A, Model Number String), so we send the maker and let the importer
 * reach the model. Beanconqueror matches a name that is a whole leading word
 * of a stored one, in either direction, so "xBloom" finds a mill entered as
 * "xBloom Studio" and a note says so. It never creates equipment from an
 * incoming link, so an unmatched name costs a note rather than a duplicate
 * row in somebody's equipment list.
 *
 * One constant, so it is one edit when we can tell (spec §3.1).
 */
export const DEVICE_NAME = "xBloom";

/**
 * The Beanconqueror preparation type this machine brews with.
 *
 * A name alone is not enough. Beanconqueror links a preparation by type first,
 * because the type is the stable identity and the name is whatever the user
 * called it, and it only offers to create a missing preparation when the
 * incoming type is one it knows. Sending the name without this leaves a
 * library that has no xBloom preparation with no way to be onboarded: the
 * import is refused rather than offering to add it.
 *
 * The value is Beanconqueror's `PREPARATION_TYPES.XBLOOM`. An importer that
 * does not know it ignores it and falls back to matching on the name.
 */
export const PREPARATION_TYPE = "XBLOOM";
