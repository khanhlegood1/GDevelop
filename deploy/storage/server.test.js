const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createStorageServer } = require("./server");
const content = {
  properties: { name: "Test" },
  layouts: [],
  resources: { resources: [] }
};

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gd-storage-"));
  let server;
  const start = async () => {
    server = await createStorageServer({ directory, ...options });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    return "http://127.0.0.1:" + server.address().port;
  };
  const stop = () =>
    new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  const base = await start();
  t.after(async () => {
    await stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    base,
    restart: async () => {
      await stop();
      return start();
    }
  };
}
const save = (base, endpoint, method, body) =>
  fetch(base + "/api/storage" + endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

test("projects and assets survive restart; writes are conflict checked", async t => {
  const f = await fixture(t);
  const upload = await fetch(f.base + "/api/storage/assets?filename=hero.png", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.from([137, 80, 78, 71])
  });
  assert.equal(upload.status, 201);
  const { url } = await upload.json();
  const project = {
    ...content,
    resources: { resources: [{ name: "hero", file: url }] }
  };
  const created = await save(f.base, "/projects", "POST", {
    name: "My game",
    content: project
  });
  assert.equal(created.status, 201);
  const { fileMetadata: first } = await created.json();
  const base = await f.restart();
  const list = await (await fetch(base + "/api/storage/projects")).json();
  assert.equal(list[0].fileIdentifier, first.fileIdentifier);
  const restored = await (await fetch(
    base + "/api/storage/projects/" + first.fileIdentifier
  )).json();
  assert.deepEqual(restored.content, project);
  const asset = await fetch(base + url);
  assert.equal(asset.headers.get("content-type"), "image/png");
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await asset.arrayBuffer()),
    Buffer.from([137, 80, 78, 71])
  );
  const partial = await fetch(base + url, { headers: { Range: "bytes=1-2" } });
  assert.equal(partial.status, 206);
  assert.deepEqual(
    Buffer.from(await partial.arrayBuffer()),
    Buffer.from([80, 78])
  );
  const writes = await Promise.all(
    [1, 2].map(() =>
      save(base, "/projects/" + first.fileIdentifier, "PUT", {
        content: project,
        expectedVersion: first.version
      })
    )
  );
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  assert.equal(
    (await fetch(base + "/api/storage/assets/missing.png")).status,
    404
  );
});

test("rejects malformed JSON, unsupported files and cross-origin writes", async t => {
  const { base } = await fixture(t);
  assert.equal(
    (await save(base, "/projects", "POST", { content: {} })).status,
    400
  );
  assert.equal(
    (await fetch(base + "/api/storage/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    })).status,
    400
  );
  for (const filename of [
    "evil.html",
    "evil.svg",
    "evil.js",
    "../../secret.txt"
  ]) {
    const response = await fetch(
      base + "/api/storage/assets?filename=" + encodeURIComponent(filename),
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "test"
      }
    );
    assert.equal(response.status, 415);
  }
  const forbidden = await fetch(base + "/api/storage/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example"
    },
    body: JSON.stringify({ content })
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get("access-control-allow-origin"), null);
  assert.equal(
    (await fetch(base + "/api/storage/projects/invalid")).status,
    404
  );
  assert.equal((await fetch(base + "/api/storage/projects/abcd")).status, 400);
});

test("request and disk limits fail without reporting a successful save", async t => {
  const { base } = await fixture(t, { maxBytes: 1024, quotaBytes: 50 });
  const full = await save(base, "/projects", "POST", { content });
  assert.equal(full.status, 507);
  assert.deepEqual(
    await (await fetch(base + "/api/storage/projects")).json(),
    []
  );
  const large = await fetch(base + "/api/storage/assets?filename=hero.png", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.alloc(2048)
  });
  assert.equal(large.status, 413);
});

test("project UUID links workspace metadata to dashboard games on create and update", async t => {
  const { base } = await fixture(t);
  const gameId = "d1d4ed49-7b09-4ef6-958b-4f6c26f98f05";
  const project = {
    ...content,
    properties: { ...content.properties, projectUuid: gameId }
  };
  const created = await save(base, "/projects", "POST", { content: project });
  const { fileMetadata } = await created.json();
  assert.equal(fileMetadata.gameId, gameId);
  const updated = await save(
    base,
    "/projects/" + fileMetadata.fileIdentifier,
    "PUT",
    {
      content: project,
      expectedVersion: fileMetadata.version
    }
  );
  assert.equal((await updated.json()).fileMetadata.gameId, gameId);
  const projects = await (await fetch(base + "/api/storage/projects")).json();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].gameId, gameId);
});

test("legacy records recover gameId on list/open without rewriting saved files", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gd-legacy-"));
  const server = await createStorageServer({ directory });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await fs.rm(directory, { recursive: true, force: true });
  });
  const id = "d1d4ed49-7b09-4ef6-958b-4f6c26f98f05";
  const gameId = "b62f8885-83ce-4c09-9c66-7bc1a0922bfb";
  const filename = path.join(directory, "projects", id + ".json");
  const original = JSON.stringify({
    content: {
      ...content,
      properties: { ...content.properties, projectUuid: gameId }
    },
    fileMetadata: {
      fileIdentifier: id,
      name: "Legacy game",
      version: "keep-this-version",
      lastModifiedDate: 42
    }
  });
  await fs.writeFile(filename, original);
  const base =
    "http://127.0.0.1:" + server.address().port + "/api/storage/projects";
  assert.equal((await (await fetch(base)).json())[0].gameId, gameId);
  const opened = await (await fetch(base + "/" + id)).json();
  assert.equal(opened.fileMetadata.gameId, gameId);
  assert.equal(opened.fileMetadata.version, "keep-this-version");
  assert.equal(await fs.readFile(filename, "utf8"), original);
});
