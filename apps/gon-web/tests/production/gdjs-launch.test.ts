/**
 * Apply-4 (27/10) — GDJS Runtime launcher thật cho game session.
 * - public/gdjs/: runtime build bằng toolchain chính thức GDJS (esbuild per-file),
 *   copy theo danh sách "Order is important" của GDJS/tests/karma.conf.js.
 * - public/game-launch.html: khởi động gdjs.RuntimeGame với project JSON nhận
 *   qua postMessage (FE-10: payload có kiểu, KHÔNG sinh game code).
 * - src/lib/gdjs-launch.ts: generator GDevelop project JSON có kiểu từ
 *   Module Graph đã lọc (schema mirror GDJS/tests/games/Text.json).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GDJS_LAUNCH_URL,
  GDJS_MANIFEST_URL,
  gdjsProjectFromModuleGraph,
  gdjsWrapText,
  GON_GAME_LAUNCH_APP,
} from "@/lib/gdjs-launch";

const fixtureGraph = {
  module: {
    title: "Hiểu event batch idempotent",
    summary: "Phiên học tương tác render bằng GDJS Runtime thật.",
    estimatedMinutes: 30,
    difficulty: "intermediate",
    outcomes: [{ statement: "Giải thích được vì sao replay không tạo work mới" }],
    safetyNotices: [],
  },
  nodes: [
    { id: "concept_main", title: "Khái niệm idempotency", type: "concept", estimatedMinutes: 8 },
    { id: "practice_1", title: "Thực hành gửi batch", type: "practice", estimatedMinutes: 12 },
  ],
};

describe("Apply-4 · Generator GDevelop project JSON (có kiểu, không sinh code)", () => {
  it("project đúng schema runtime: layout + TextObject + instances khớp nhau", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph, { name: "GON test" });
    expect(project.name).toBe("GON test");
    expect(project.gdVersion).toEqual({ major: 4, minor: 0, build: 96, revision: 89 });
    expect(project.layouts).toHaveLength(1);
    const layout = project.layouts[0]!;
    expect(layout.name).toBe("MainScene");
    expect(layout.objects.length).toBeGreaterThan(3);
    expect(layout.objects.every((object) => object.type === "TextObject::Text")).toBe(true);
    expect(layout.instances).toHaveLength(layout.objects.length);
    expect(new Set(layout.objects.map((object) => object.name))).toEqual(new Set(layout.instances.map((i) => i.name)));
    expect(layout.events).toEqual([]);
    expect((project.properties.extensions as Array<{ name: string }>)[0]!.name).toBe("TextObject");
    expect(project.properties.windowWidth).toBe(800);
  });

  it("nội dung học hiển thị: title, summary, mỗi node một dòng, mục tiêu, hướng dẫn hoàn thành", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph);
    const strings = project.layouts[0]!.objects.map((object) => object.string).join("\n");
    expect(strings).toContain("Hiểu event batch idempotent");
    expect(strings).toContain("Phiên học tương tác render bằng GDJS Runtime thật.");
    expect(strings).toContain("1. Khái niệm idempotency (concept · ~8 phút)");
    expect(strings).toContain("2. Thực hành gửi batch (practice · ~12 phút)");
    expect(strings).toContain("Giải thích được vì sao replay không tạo work mới");
    expect(strings).toContain("Hoàn thành phiên");
  });

  it("không lộ đáp án ẩn: generator không đọc sampleAnswer/conceptTermGroups", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/lib/gdjs-launch.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("sampleAnswer");
    expect(source).not.toContain("conceptTermGroups");
  });

  it("ngắt dòng: mỗi dòng ≤ 84 ký tự, giữ nguyên ý", () => {
    const lines = gdjsWrapText("một ".repeat(60).trim(), 84);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(84);
    expect(gdjsWrapText("")[0]).toBe("");
  });

  it("graph rỗng vẫn sinh project hợp lệ", () => {
    const project = gdjsProjectFromModuleGraph(null);
    expect(project.layouts[0]!.objects.length).toBeGreaterThan(0);
    expect(project.name).toBe("Phiên học tương tác GON");
  });
});

describe("Apply-4 · Launcher + runtime tĩnh (source checks)", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

  it("game-launch.html khởi động RuntimeGame đúng pattern GDJS/Runtime/index.html", () => {
    const source = read("../../public/game-launch.html");
    expect(source).toContain("gdjs.RuntimeGame");
    expect(source).toContain("createStandardCanvas");
    expect(source).toContain("bindStandardEvents");
    expect(source).toContain("loadAllAssets");
    expect(source).toContain("startGameLoop");
    expect(source).toContain("gdjs.projectData");
    expect(source).toContain(GON_GAME_LAUNCH_APP);
    expect(source).toContain(GDJS_MANIFEST_URL);
  });

  it("manifest runtime: đủ file theo thứ tự chính thức, bắt đầu bằng libs/jshashtable.js", () => {
    const manifestPath = fileURLToPath(new URL("../../public/gdjs/manifest.json", import.meta.url));
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: string[] };
    expect(manifest.files.length).toBeGreaterThanOrEqual(60);
    expect(manifest.files[0]).toBe("libs/jshashtable.js");
    expect(manifest.files).toContain("gd.js");
    expect(manifest.files).toContain("runtimegame.js");
    expect(manifest.files).toContain("pixi-renderers/pixi.js");
    expect(manifest.files).toContain("Extensions/TextObject/textruntimeobject.js");
    expect(manifest.files).toContain("Extensions/TextObject/textruntimeobject-pixi-renderer.js");
    for (const file of manifest.files) {
      expect(existsSync(fileURLToPath(new URL(`../../public/gdjs/${file}`, import.meta.url)))).toBe(true);
    }
  });

  it("backend launchUrl trỏ launcher thật; FE render iframe + gửi project qua postMessage", () => {
    const serviceSource = read("../../src/server/service.ts");
    expect(serviceSource).toContain('launchUrl: "/game-launch.html"');
    const launcherSource = read("../../src/components/gon/GameSessionLauncher.tsx");
    expect(launcherSource).toContain("gdjsProjectFromModuleGraph");
    expect(launcherSource).toContain('postMessage');
    expect(launcherSource).toContain('src={String(session.launchUrl');
    expect(launcherSource).toContain("GON_GAME_LAUNCH_APP");
  });
});
