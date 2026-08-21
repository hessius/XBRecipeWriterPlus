// The card encode/decode paths in library/ log hex dumps on every call, which drowns
// out test output. Silence the informational levels but keep warnings and errors.
global.console.log = jest.fn();
global.console.info = jest.fn();
global.console.debug = jest.fn();
