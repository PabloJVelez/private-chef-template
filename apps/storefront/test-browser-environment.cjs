// Use Node's actual Fetch API for React Router navigation under jsdom.
const { TestEnvironment } = require('jest-environment-jsdom');
module.exports = class extends TestEnvironment {
  async setup() {
    await super.setup();
    for (const key of ['Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder']) this.global[key] = globalThis[key];
  }
};
