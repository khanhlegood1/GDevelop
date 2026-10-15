const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('browser preview worker registers handlers even when Workbox CDN is unavailable', () => {
  const handlers = {};
  let importAttempted = false;
  const context = {
    URL,
    console: { log() {}, warn() {} },
    self: {
      location: { href: 'https://preview.example/service-worker.js?dev=1' },
      addEventListener(name, handler) { handlers[name] = handler; },
    },
    importScripts() {
      importAttempted = true;
      throw new Error('CDN unavailable');
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../service-worker-template/service-worker-template.js'), 'utf8');
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.equal(importAttempted, true);
  for (const name of ['fetch', 'install', 'activate']) {
    assert.equal(typeof handlers[name], 'function');
  }
  let handled = false;
  handlers.fetch({
    request: { url: 'https://preview.example/not-a-preview' },
    respondWith() { handled = true; },
  });
  assert.equal(handled, false);
});
