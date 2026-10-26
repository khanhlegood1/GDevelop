/**
 * Apply-4 (27/10) — Build GDJS Runtime launcher cho GON.
 *
 * Chạy toolchain chính thức của GDJS (GDJS/scripts/build.js, esbuild từng file
 * .ts → .js) rồi copy đúng danh sách file mà GDJS tests chính thức dùng
 * (GDJS/tests/karma.conf.js — "Order is important") vào public/gdjs/ kèm
 * manifest.json giữ thứ tự load. Launcher public/game-launch.html đọc manifest
 * và append script tags theo đúng thứ tự đó rồi khởi động gdjs.RuntimeGame.
 *
 * Cách chạy (từ apps/gon-web):
 *   node scripts/build-gdjs-launcher.mjs
 * Yêu cầu: đã `npm ci` trong GDJS/ (esbuild + shelljs).
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const gdevelopRoot = join(import.meta.dirname, "..", "..", "..");
const gdjsRuntimeOut = "/tmp/gdjs-runtime";
const publicGdjs = join(import.meta.dirname, "..", "public", "gdjs");

console.log("ℹ️  1) Build GDJS Runtime bằng toolchain chính thức (esbuild per-file)…");
const build = spawnSync(process.executable ?? "node", ["scripts/build.js", "--out", gdjsRuntimeOut], {
  cwd: join(gdevelopRoot, "GDJS"),
  stdio: "inherit",
});
if (build.status !== 0) {
  console.error("❌ GDJS build thất bại");
  process.exit(1);
}

// Danh sách file "core" theo GDJS/tests/karma.conf.js (thứ tự quan trọng),
// loại các extension không dùng cho project text-only của GON.
const coreFiles = [
  "libs/jshashtable.js",
  "logger.js",
  "gd.js",
  "AsyncTasksManager.js",
  "libs/rbush.js",
  "pixi-renderers/pixi.js",
  "pixi-renderers/three.js",
  "howler-sound-manager/howler.min.js",
  "howler-sound-manager/howler-sound-manager.js",
  "fontfaceobserver-font-manager/fontfaceobserver.js",
  "fontfaceobserver-font-manager/fontfaceobserver-font-manager.js",
  "Model3DManager.js",
  "jsonmanager.js",
  "ResourceLoader.js",
  "ResourceCache.js",
  "timemanager.js",
  "polygon.js",
  "runtimeobject.js",
  "RuntimeInstanceContainer.js",
  "runtimescene.js",
  "scenestack.js",
  "profiler.js",
  "force.js",
  "RuntimeLayer.js",
  "layer.js",
  "RuntimeCustomObjectLayer.js",
  "timer.js",
  "inputmanager.js",
  "capturemanager.js",
  "named-easings-manager.js",
  "runtimegame.js",
  "runtimewatermark.js",
  "variable.js",
  "variablescontainer.js",
  "oncetriggers.js",
  "runtimebehavior.js",
  "SpriteAnimator.js",
  "spriteruntimeobject.js",
  "CustomRuntimeObject.js",
  "CustomRuntimeObject2D.js",
  "CustomRuntimeObjectInstanceContainer.js",
  "events-tools/commontools.js",
  "events-tools/runtimescenetools.js",
  "events-tools/inputtools.js",
  "events-tools/networktools.js",
  "events-tools/objecttools.js",
  "events-tools/cameratools.js",
  "events-tools/soundtools.js",
  "events-tools/storagetools.js",
  "indexeddb.js",
  "events-tools/stringtools.js",
  "events-tools/windowtools.js",
  "debugger-client/abstract-debugger-client.js",
  "affinetransformation.js",
];

// pixi-renderers/*.js còn lại (renderer của runtimegame/runtimescene/…) — lấy tất cả trừ 3 file lớn đã liệt kê tách bạch ở trên và three addons/draco.
const pixiDir = join(gdjsRuntimeOut, "pixi-renderers");
const pixiRenderers = readdirSync(pixiDir)
  .filter((name) => name.endsWith(".js") && name !== "pixi.js" && name !== "three.js" && name !== "ThreeAddons.js")
  .map((name) => `pixi-renderers/${name}`);

const extensionFiles = ["Extensions/TextObject/textruntimeobject.js", "Extensions/TextObject/textruntimeobject-pixi-renderer.js"];

// Apply-5: GonLearningEvents — runtime extension của GON (esbuild từ src).
const gonExtensionSource = join(gdevelopRoot, "apps/gon-web/src/gdjs-extensions/GonLearningEvents/gonlearningevents.ts");
const gonExtensionOut = "Extensions/GonLearningEvents/gonlearningevents.js";
console.log("ℹ️  Build GonLearningEvents runtime extension…");
const gonBuild = spawnSync(
  join(gdevelopRoot, "GDJS", "node_modules", ".bin", "esbuild"),
  [gonExtensionSource, "--outfile=" + join(publicGdjs, gonExtensionOut)],
  { stdio: "inherit" },
);
if (gonBuild.status !== 0) {
  console.error("❌ Không build được GonLearningEvents");
  process.exit(1);
}

const manifestFiles = [
  ...coreFiles.slice(0, 6), // tới pixi-renderers/three.js
  ...pixiRenderers,
  ...coreFiles.slice(6),
  ...extensionFiles,
  gonExtensionOut,
];

console.log(`ℹ️  2) Copy ${manifestFiles.length} file vào public/gdjs (giữ thứ tự manifest)…`);
mkdirSync(publicGdjs, { recursive: true });
const copied = [];
for (const relative of manifestFiles) {
  const target = join(publicGdjs, relative);
  if (relative !== gonExtensionOut) {
    // File từ build GDJS chính thức — copy từ out dir.
    cpSync(join(gdjsRuntimeOut, relative), target);
  } // GonLearningEvents đã được esbuild ghi thẳng vào public/gdjs ở trên.
  if (!statSync(target).isFile()) {
    console.error(`❌ Thiếu file runtime: ${relative}`);
    process.exit(1);
  }
  copied.push(relative);
}

// ThreeAddons cần cho Model3DManager (three addons) — copy kèm nhưng không block nếu thiếu.
try {
  cpSync(join(gdjsRuntimeOut, "pixi-renderers/ThreeAddons.js"), join(publicGdjs, "pixi-renderers/ThreeAddons.js"));
} catch {
  console.warn("⚠️  Không có ThreeAddons.js — bỏ qua (project text-only không dùng 3D).");
}

writeFileSync(join(publicGdjs, "manifest.json"), JSON.stringify({ files: copied }, null, 2));
console.log(`✅ Xong: ${copied.length} file runtime + manifest.json tại apps/gon-web/public/gdjs/`);
console.log(`   (nguồn: GDJS Runtime chính thức, MIT — ${readFileSync(join(gdevelopRoot, "GDJS", "LICENSE.md"), "utf8").split("\n")[0]})`);
