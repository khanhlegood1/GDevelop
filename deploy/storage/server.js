"use strict";
// Private single-workspace storage. Only reachable through authenticated Nginx.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const types = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  ttf: "font/ttf",
  otf: "font/otf",
  glb: "model/gltf-binary",
  json: "application/json"
};
const idPattern = /^[a-f0-9-]{36}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

async function createStorageServer({
  directory,
  maxBytes = 32 * 1024 * 1024,
  quotaBytes = 1024 * 1024 * 1024
}) {
  await fs.mkdir(path.join(directory, "projects"), { recursive: true });
  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  let writes = Promise.resolve();
  let pending = 0;
  const json = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(JSON.stringify(body));
  };
  const read = async req => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) chunks.length = 0;
      else chunks.push(chunk);
    }
    if (size > maxBytes)
      throw fail(413, "File/project exceeds the request limit.");
    return Buffer.concat(chunks);
  };
  const atomicWrite = async (filename, bytes) => {
    let used = 0;
    for (const folder of ["projects", "assets"]) {
      for (const entry of await fs.readdir(path.join(directory, folder))) {
        used += (await fs.stat(path.join(directory, folder, entry))).size;
      }
    }
    const oldSize = await fs.stat(filename).then(s => s.size, () => 0);
    if (used - oldSize + bytes.length > quotaBytes)
      throw fail(
        507,
        "Workspace storage quota reached. Back up and maintain the volume."
      );
    const temporary = filename + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, filename);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  };
  const load = async id => {
    if (!idPattern.test(id)) throw fail(400, "Invalid project identifier.");
    try {
      return JSON.parse(
        await fs.readFile(
          path.join(directory, "projects", id + ".json"),
          "utf8"
        )
      );
    } catch (error) {
      if (error.code === "ENOENT") throw fail(404, "Project not found.");
      throw error;
    }
  };
  const validateProject = content => {
    if (
      !content ||
      typeof content !== "object" ||
      Array.isArray(content) ||
      !content.properties ||
      typeof content.properties !== "object" ||
      !Array.isArray(content.layouts)
    ) {
      throw fail(
        400,
        "Expected a GDevelop project with properties and layouts."
      );
    }
  };
  const route = async (req, res, url) => {
    const base = "/api/storage";
    if (req.method === "GET" && url.pathname === base + "/healthz")
      return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === base + "/projects") {
      const projects = [];
      for (const name of await fs.readdir(path.join(directory, "projects"))) {
        if (!name.endsWith(".json")) continue;
        const record = await load(name.slice(0, -5));
        projects.push(record.fileMetadata);
      }
      projects.sort((a, b) => b.lastModifiedDate - a.lastModifiedDate);
      return json(res, 200, projects);
    }
    const projectMatch = url.pathname.match(
      /^\/api\/storage\/projects\/([a-f0-9-]+)$/
    );
    if (req.method === "GET" && projectMatch)
      return json(res, 200, await load(projectMatch[1]));
    if (
      (req.method === "POST" && url.pathname === base + "/projects") ||
      (req.method === "PUT" && projectMatch)
    ) {
      if (
        (req.headers["content-type"] || "").split(";")[0] !== "application/json"
      )
        throw fail(415, "Expected application/json.");
      let body;
      try {
        body = JSON.parse((await read(req)).toString("utf8"));
      } catch (error) {
        if (error.status) throw error;
        throw fail(400, "Invalid JSON.");
      }
      validateProject(body.content);
      const id = projectMatch ? projectMatch[1] : randomUUID();
      if (projectMatch) {
        const previous = await load(id);
        if (
          !body.expectedVersion ||
          previous.fileMetadata.version !== body.expectedVersion
        ) {
          throw fail(
            409,
            "Project changed in another tab. Reopen it or save a new copy."
          );
        }
      }
      const name = String(
        body.name || body.content.properties.name || "Untitled project"
      ).slice(0, 200);
      const fileMetadata = {
        fileIdentifier: id,
        name,
        version: randomUUID(),
        lastModifiedDate: Date.now()
      };
      const record = { fileMetadata, content: body.content };
      await atomicWrite(
        path.join(directory, "projects", id + ".json"),
        Buffer.from(JSON.stringify(record))
      );
      return json(res, projectMatch ? 200 : 201, { fileMetadata });
    }
    if (req.method === "POST" && url.pathname === base + "/assets") {
      if (req.headers["content-type"] !== "application/octet-stream")
        throw fail(415, "Expected application/octet-stream.");
      const name = url.searchParams.get("filename") || "";
      const extension = path
        .extname(name)
        .slice(1)
        .toLowerCase();
      if (!types[extension])
        throw fail(
          415,
          "Unsupported asset type. Scripts, HTML, SVG and multi-file formats are not accepted."
        );
      const bytes = await read(req);
      if (!bytes.length) throw fail(400, "Empty asset.");
      const filename = randomUUID() + "." + extension;
      await atomicWrite(path.join(directory, "assets", filename), bytes);
      return json(res, 201, { url: base + "/assets/" + filename });
    }
    const assetMatch = url.pathname.match(
      /^\/api\/storage\/assets\/([a-f0-9-]{36})\.([a-z0-9]+)$/
    );
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      assetMatch &&
      types[assetMatch[2]]
    ) {
      let bytes;
      try {
        bytes = await fs.readFile(
          path.join(directory, "assets", assetMatch[1] + "." + assetMatch[2])
        );
      } catch (error) {
        if (error.code === "ENOENT") throw fail(404, "Asset not found.");
        throw error;
      }
      const headers = {
        "Content-Type": types[assetMatch[2]],
        "Content-Length": bytes.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Accept-Ranges": "bytes"
      };
      const range = req.headers.range;
      if (range && req.method === "GET") {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = match ? Number(match[1]) : -1;
        const end =
          match && match[2]
            ? Math.min(Number(match[2]), bytes.length - 1)
            : bytes.length - 1;
        if (start < 0 || start > end || start >= bytes.length) {
          res.writeHead(416, { "Content-Range": "bytes */" + bytes.length });
          return res.end();
        }
        res.writeHead(206, {
          ...headers,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`
        });
        return res.end(bytes.subarray(start, end + 1));
      }
      res.writeHead(200, headers);
      return res.end(req.method === "HEAD" ? undefined : bytes);
    }
    throw fail(404, "Not found.");
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://storage");
      if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
        if (
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host)
        )
          throw fail(403, "Cross-origin writes are not allowed.");
        if (pending >= 8) throw fail(429, "Too many writes. Try again.");
        pending++;
        const task = writes.then(() => route(req, res, url));
        writes = task.catch(() => {});
        try {
          await task;
        } finally {
          pending--;
        }
      } else await route(req, res, url);
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        json(res, error.status || 500, {
          error: error.status ? error.message : "Storage operation failed."
        });
    }
  });
  server.requestTimeout = 120000;
  return server;
}
module.exports = { createStorageServer };
if (require.main === module) {
  createStorageServer({ directory: process.env.STORAGE_DIRECTORY || "/data" })
    .then(server => {
      server.listen(3001, "0.0.0.0", () =>
        console.log("Workspace storage listening on port 3001")
      );
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
