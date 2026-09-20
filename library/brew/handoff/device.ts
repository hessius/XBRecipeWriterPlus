/**
 * What we call the machine, everywhere.
 *
 * Deliberately under-claimed. We cannot yet tell a Studio from an original
 * (#138 would read the BLE Device Information Service, characteristic
 * 0x180A, Model Number String), and Beanconqueror creates a mill on a name
 * miss rather than refusing: a name we guess wrong becomes a duplicate row
 * in somebody's equipment list that they did not ask for and cannot easily
 * merge away. One constant, so it is one edit when we can tell (spec §3.1).
 */
export const DEVICE_NAME = "xBloom";
