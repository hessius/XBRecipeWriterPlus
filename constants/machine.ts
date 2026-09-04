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

/** The MTU every Bluetooth LE stack must support, and so the floor. */
export const DEFAULT_MTU = 23;

/** The ATT header a write carries, which does not count towards the payload. */
export const ATT_HEADER_BYTES = 3;

/**
 * How long to wait for the Bluetooth adapter to finish powering on.
 *
 * `BleManager.start()` resolves before the adapter is usable, and a connect
 * issued in that window fails in a few milliseconds with no message at all --
 * which on a real phone was every single app launch. Five seconds is far
 * longer than a healthy radio needs and short enough that a radio which is
 * never coming up still says so while the user is watching.
 */
export const RADIO_READY_MS = 5000;

/** How long to scan before giving up on finding a machine. */
export const SCAN_SECONDS = 10;

/**
 * The handshake has to reach the machine within about 200 ms of connecting or
 * it ignores everything that follows. This is the budget, not the target.
 */
export const HANDSHAKE_WINDOW_MS = 200;

/**
 * How long a session handshake is treated as still good for.
 *
 * Settled on hardware (2026-09-01, V12.0D.500): a 40521 sent six minutes into
 * a live link was ignored outright, and the identical frame answered at once
 * when an 8100 preceded it. The machine forgets the session; how quickly is
 * not known, so this is deliberately short.
 *
 * It is not zero because the handshake makes the machine beep, and beeping
 * every time anything wants a reading is its own bug.
 */
export const HANDSHAKE_FRESH_MS = 20_000;

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
 * How many times to ask the machine to describe itself before giving up.
 *
 * More than one, because the question can be lost. It is written immediately
 * after the handshake, and the radio drops frames sent in a burst — a link that
 * came up perfectly then reported no vitals at all, and the brew refused with
 * "reconnect and try again", which reconnecting did not fix.
 */
export const INFO_ATTEMPTS = 3;

/**
 * How many times a brew opens a fresh session to ask an unanswered machine.
 *
 * `INFO_ATTEMPTS` retries the question inside one session; this retries the
 * session itself, which is what a machine that has stopped listening needs.
 * Bounded because a machine that is switched off is silent in exactly the same
 * way, and somebody has to be told.
 */
export const BREW_INFO_ROUNDS = 3;

/**
 * How long to wait before each attempt at opening a link.
 *
 * Five attempts, spread over about fourteen seconds. Connecting to the J15 is
 * simply unreliable: on hardware it has taken up to five presses of Connect to
 * get a link, usually three, and pressing a button over and over is not a thing
 * to ask of somebody standing at a coffee machine. Backing off rather than
 * hammering, because the failures cluster — a radio that has just refused is
 * unlikely to accept a millisecond later.
 */
export const CONNECT_DELAYS_MS = [0, 1200, 2500, 4000, 6000];

/**
 * How long a fault state is believed before it is treated as unknown.
 *
 * Only fault states (`NO_WATER`, `NO_BEANS`) expire. Activity states never do,
 * because the machine is silent while it works: grinding emits no `0x57` frame
 * for around twenty seconds and a pour emits none for the duration of the pour,
 * so silence is what a busy machine sounds like. Expiring an activity state
 * would let the app decide a running machine is free.
 *
 * A fault expires because the user fixes it at the machine, away from the app,
 * and the app cannot observe that. Without expiry, `NO_WATER` stays forever and
 * every subsequent attempt is refused as a tank fault on a full tank.
 *
 * Fifteen seconds is safely shorter than the ~20 s grind gap recorded in
 * `docs/machine-integration/ble-protocol.md`, so a fault frame emitted at the
 * start of a grind could not masquerade as a grind silence. It is also longer
 * than a full pre-flight, so a fault that arrives during a pre-flight is still
 * fresh when `brewBlock` runs.
 */
export const STATE_FRESH_MS = 15_000;
