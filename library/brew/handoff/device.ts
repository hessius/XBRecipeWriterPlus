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
