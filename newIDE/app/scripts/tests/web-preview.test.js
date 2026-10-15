const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const overrides = require('../../config-overrides');

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('ordinary dev server configuration is unchanged', () => {
  withEnv('GD_REMOTE_PREVIEW', undefined, () => {
    const original = { allowedHosts: ['example.com'], static: false };
    const getConfig = overrides.devServer((proxy, host) => {
      assert.equal(proxy, 'proxy');
      assert.equal(host, 'host');
      return original;
    });
    assert.equal(getConfig('proxy', 'host'), original);
    assert.deepEqual(original, { allowedHosts: ['example.com'], static: false });
  });
});

test('remote preview serves runtime on the same origin and restricts hosts', () => {
  withEnv('GD_REMOTE_PREVIEW', 'true', () => {
    const config = overrides.devServer(() => ({
      static: [{ directory: '/public' }],
      client: { logging: 'warn' },
    }))();
    assert.deepEqual(config.allowedHosts, ['localhost', '.e2b.app']);
    assert.equal(config.static[0].directory, '/public');
    assert.equal(config.static[1].directory, path.resolve(__dirname, '../../resources/GDJS'));
    assert.equal(config.static[1].publicPath, '/GDJS');
    assert.deepEqual(config.client.webSocketURL, { protocol: 'wss', port: 443 });
    assert.equal(config.client.logging, 'warn');
    assert.equal(config.client.overlay.errors, true);
    assert.equal(config.client.overlay.runtimeErrors, false);
  });
});

test('low-memory settings are opt-in and do not change production builds', () => {
  withEnv('GD_LOW_MEMORY_PREVIEW', 'true', () => {
    const makeConfig = () => ({
      module: { rules: [] }, resolve: { plugins: [] },
      cache: { type: 'filesystem' }, devtool: 'source-map',
    });
    const dev = overrides.webpack(makeConfig(), 'development');
    assert.equal(dev.cache, false);
    assert.equal(dev.devtool, false);
    const prod = overrides.webpack(makeConfig(), 'production');
    assert.deepEqual(prod.cache, { type: 'filesystem' });
    assert.equal(prod.devtool, 'source-map');
  });
});
