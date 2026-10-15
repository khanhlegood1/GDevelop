# Remote web preview (session-scoped)

A preview URL belongs to a running sandbox. **502 / SANDBOX NOT FOUND** means
that sandbox no longer exists, not that the editor returned a build error.
Start a fresh sandbox and use its new preview URL. Committing the code does
not keep a sandbox alive. For a permanent service, deploy a production build
to a separately managed host; this development server is not production hosting.

## Setup

From the repository root (Node.js 22):

```sh
cd newIDE/app
npm ci --ignore-scripts --legacy-peer-deps
cd ../../GDJS
npm ci
cd ../newIDE/app
npm run start:web-preview
```

The preview command applies editor patches, generates resources, verifies and
imports the vendored core, builds the engine and starts the editor on
`0.0.0.0:3000` (override `PORT` if needed). The app and engine are served on the
same origin: `/GDJS/Runtime/...` must not point at the visitor's localhost.
The dev-server host allowlist accepts localhost and `*.e2b.app`, and HMR uses
secure WebSockets through the HTTPS preview proxy. Normal `npm start` and
production builds are unchanged.

This deliberately skips downloads of optional Piskel/JFXR/Yarn editors from
GitHub releases. Those editors are unavailable unless separately imported with
`npm run import-zipped-external-editors`. Cloud login, AI, stores and cloud builds
still depend on upstream services; this is not a self-hosted replacement for
those services. Vendored core compatibility must be tested beyond compilation.

In Arena, start this command with the background-process tool, open the Live
Preview and check these endpoints:

- `/` (editor HTML)
- `/libGD.js`
- `/libGD.wasm` (`application/wasm`, WebAssembly binary)
- `/GDJS/Runtime/index.html`

Then check editor loading, creation/saving of a project and a game preview in
the browser. Endpoint HTTP 200 checks alone do not prove those interactions work.
