/**
 * xBloom's public key, exactly as their web client ships it.
 *
 * The irregular line wrapping is theirs. Do not reflow it: it is kept
 * comparable byte for byte with the copy in `api/_lib/xbloom.ts` and with
 * whatever their client ships next.
 *
 * Duplicated from `api/_lib/xbloom.ts` on purpose. That file is a
 * zero-dependency Vercel function and `library/` must never import from it.
 */
export const XBLOOM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5
CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9
tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor
J1VBbCv90yBSOhVxO+QIDAQAB
-----END PUBLIC KEY-----`;
