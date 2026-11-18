// React Router 7 uses TextEncoder in its DOM entry point; jsdom does not provide it.
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('node:util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
// jsdom has no media-query engine. Default to a mouse/keyboard environment;
// touch-specific UI tests override matches explicitly.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
  });
}
