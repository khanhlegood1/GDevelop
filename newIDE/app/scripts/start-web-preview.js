// Reproducible, session-scoped remote preview without S3 core downloads.
const { spawnSync, spawn } = require('child_process');
const path = require('path');
const appPath = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  HOST: '0.0.0.0',
  PORT: process.env.PORT || '3000',
  BROWSER: 'none',
  GD_REMOTE_PREVIEW: 'true',
  GD_LOW_MEMORY_PREVIEW: 'true',
  DISABLE_ESLINT_PLUGIN: 'true',
  NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=2048',
};

function run(script, cwd) {
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(require.resolve('patch-package'), appPath);
for (const script of [
  'make-version-metadata.js',
  'build-theme-resources.js',
  'make-service-worker.js',
  'import-libGD.js',
  'import-GDJS-Runtime.js',
  'import-monaco-editor.js',
  'import-zipped-external-libs.js',
]) {
  run(path.join(__dirname, script), path.join(appPath, 'scripts'));
}

const child = spawn(process.execPath, [require.resolve('react-app-rewired/bin/index.js'), 'start'], {
  cwd: appPath,
  env,
  stdio: 'inherit',
});
child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', code => process.exit(code === null ? 1 : code));
