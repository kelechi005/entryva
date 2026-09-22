// jsdom (as wired up by jest-environment-jsdom) doesn't reliably expose
// SubtleCrypto or TextEncoder/TextDecoder in every version we might run
// against, but Node itself has both natively. The offline module
// (src/offline/crypto.ts) depends on window.crypto.subtle and
// TextEncoder to mirror exactly what a real browser gate device does, so
// tests need the same primitives available globally rather than a mock —
// a mocked subtle.verify would defeat the entire point of the security
// tests in verify-offline.test.ts (proving a tampered manifest entry is
// actually rejected by real ECDSA verification, not by test scaffolding).

const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// jsdom doesn't implement structuredClone, but fake-indexeddb (correctly
// modeling real IndexedDB's structured-clone storage semantics) needs it
// to put() any value.
if (!global.structuredClone) {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}
