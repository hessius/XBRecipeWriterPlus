/** The xBloom Studio's custom GATT service and its two characteristics. */
export const MACHINE_SERVICE = "0000E0FF-3C17-D293-8E48-14FE2E4DA212";
/** App → machine. Write Without Response only. */
export const MACHINE_WRITE_CHARACTERISTIC = "0000FFE1-0000-1000-8000-00805F9B34FB";
/** Machine → app. Notifications. */
export const MACHINE_NOTIFY_CHARACTERISTIC = "0000FFE2-0000-1000-8000-00805F9B34FB";

/** The machine advertises a name beginning with this. */
export const MACHINE_NAME_PREFIX = "XBLOOM";

/**
 * The ATT MTU to ask for once connected.
 *
 * Android negotiates 23 bytes by default, which leaves **20** for the payload —
 * and a recipe frame is 23 to 39. Without this the OS cannot carry a frame in
 * one write at all, whatever the library is told about chunking. iOS negotiates
 * for itself and ignores the request.
 *
 * 247 is the usual ceiling for a single LE Data Length Extension packet; a
 * machine that refuses it is not a reason to fail the connection.
 */
export const MACHINE_MTU = 247;

/** How long to scan before giving up on finding a machine. */
export const SCAN_SECONDS = 10;

/**
 * The handshake has to reach the machine within about 200 ms of connecting or
 * it ignores everything that follows. This is the budget, not the target.
 */
export const HANDSHAKE_WINDOW_MS = 200;

/**
 * How long to wait, after the handshake, for the machine to describe itself.
 *
 * Nothing may be brewed until it has: the info frame is the only place the
 * water level is reported, and sending a recipe to a machine whose tank state
 * is unknown is how water ends up on the counter. Connecting still succeeds if
 * this elapses — the console is useful on a machine that will not introduce
 * itself, and the brew path refuses on its own.
 */
export const INFO_WAIT_MS = 2000;

/**
 * How long to leave between the frames of a brew sequence.
 *
 * Not politeness. These are Write Without Response, so nothing paces them and
 * the machine drops a burst on the floor: a single command lands reliably, and
 * five sent back-to-back never arrive. Every working implementation we have
 * waits between frames, and the one whose brew sequence is known to run on
 * hardware waits two full seconds.
 *
 * Source: `xbloom.py` `run_brew`, which sleeps 2.0 s after every packet.
 */
export const FRAME_GAP_MS = 2000;

/** How long to wait for a sent recipe to reach `loading` or `armed`. */
export const RECIPE_ACK_MS = 8000;

/**
 * There is deliberately **no** grinding timeout.
 *
 * After commit the machine grinds for around twenty seconds emitting no status
 * frames at all. A client that treats that gap as a stall reports a failure
 * that did not happen, so the grinding phase waits for the grinder-stop event
 * and nothing else.
 */
export const GRINDING_TIMEOUT_MS = null;

/**
 * How long to wait before each attempt at restoring a link the app gave up.
 *
 * Three attempts, not one. iOS does not hand the peripheral back the instant
 * the app returns to the front, and the machine itself needs a moment after a
 * link closes — a single immediate attempt failed often enough that the only
 * way back was to forget the machine and force-quit the app. Bounded rather
 * than open-ended: a machine that has been switched off should stop being asked
 * about, and the user still has the Connect button.
 */
export const RECONNECT_DELAYS_MS = [0, 1200, 3500];
