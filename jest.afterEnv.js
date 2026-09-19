/**
 * Setup that needs the test framework to exist.
 *
 * `jest.setup.js` runs under `setupFiles`, which is before `beforeEach` is a
 * global, so anything that has to happen around each test belongs here.
 */

/**
 * Empty the in-memory keychain between tests.
 *
 * `jest.clearAllMocks()` cannot do it: the store behind the `expo-secure-store`
 * mock is a Map, not a mock function. A keychain that carries a token from one
 * test into the next makes the suite order-dependent, which is the kind of
 * thing that passes on a laptop and fails in CI.
 */
beforeEach(() => {
    jest.requireMock("expo-secure-store").__store?.clear();
});

/**
 * Forget the last navigation between tests.
 *
 * `hooks/steadyRouter` holds the last move at module scope on purpose: there
 * is one navigation stack, so there is one answer to "what did we just do".
 * Tests run far faster than a finger, so without this a screen pushed in one
 * test is still spoken for when the next test pushes it, and the second push
 * is swallowed as a double tap.
 */
beforeEach(() => {
    jest.requireActual("./hooks/steadyRouter").forgetLastMove();
});
