// Shared bust generator lives under server/ so the Dockerfile (server/ + dist/ only)
// can render wanted-poster fallbacks. This file re-exports that module so existing
// client and test imports stay the same. Do not import the other way around.
export * from '../../../server/avatar/genbust.js';
