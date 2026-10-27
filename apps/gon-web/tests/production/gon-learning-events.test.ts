/**
 * Apply-5 (27/10) — GonLearningEvents: extension runtime thật + scene code
 * generated theo quy ước chính thức của GDJS (gdjs["<mangledName>Code"]).
 * Event học phát sinh TRONG game (objective_viewed khi chạm node,
 * checkpoint_reached khi xem đủ) gửi về /v1 qua bridge của launcher.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gdjsProjectFromModuleGraph } from "@/lib/gdjs-launch";
import { gdjsNodeSpecsFromProject, gdjsSceneCodeSource } from "@/lib/gdjs-scene-code";

const fixtureGraph = {
  module: { title: "Event trong game", summary: "GonLearningEvents thật" },
  nodes: [
    { id: "concept_main", title: 'Khái niệm "idempotency"', type: "concept", estimatedMinutes: 8 },
    { id: "practice_1", title: "Thực hành gửi batch", type: "practice", estimatedMinutes: 12 },
  ],
};

describe("Apply-5 · Scene code generated (quy ước gdjs.<mangledName>Code)", () => {
  it("generator tạo object riêng GonNode{i} cho từng node", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph);
    const names = project.layouts[0]!.objects.map((object) => object.name);
    expect(names).toContain("GonNode1");
    expect(names).toContain("GonNode2");
    const nodeObject = project.layouts[0]!.objects.find((object) => object.name === "GonNode1")!;
    expect(nodeObject.string).toContain('Khái niệm "idempotency"');
  });

  it("node specs map objectName → nodeId đúng thứ tự", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph);
    const specs = gdjsNodeSpecsFromProject(project, fixtureGraph.nodes as Array<Record<string, unknown>>);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ objectName: "GonNode1", nodeId: "concept_main" });
    expect(specs[1]).toMatchObject({ objectName: "GonNode2", nodeId: "practice_1" });
  });

  it("scene code: module MainSceneCode + objective_viewed + checkpoint_reached + tool calls", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph);
    const code = gdjsSceneCodeSource(gdjsNodeSpecsFromProject(project, fixtureGraph.nodes as Array<Record<string, unknown>>));
    expect(code).toContain('gdjs["MainSceneCode"]');
    expect(code).toContain("idToCallbackMap");
    expect(code).toContain("objective_viewed");
    expect(code).toContain("checkpoint_reached");
    expect(code).toContain("gonLearningEvents.sendGameEvent");
    expect(code).toContain("gonLearningEvents.pointIsOnObject");
    expect(code).toContain("all_nodes_viewed");
    // Dữ liệu graph chỉ lọt vào qua JSON.stringify — chuỗi có quote vẫn nguyên vẹn.
    expect(code).toContain('\\"idempotency\\"');
  });

  it("scene code parse được như JS hợp lệ (new Function không throw)", () => {
    const project = gdjsProjectFromModuleGraph(fixtureGraph);
    const code = gdjsSceneCodeSource(gdjsNodeSpecsFromProject(project, fixtureGraph.nodes as Array<Record<string, unknown>>));
    const gdjs: Record<string, unknown> = {};
    const factory = new Function("gdjs", `${code}\nreturn gdjs["MainSceneCode"];`);
    const module = factory(gdjs) as { func: (scene: unknown) => void; idToCallbackMap: unknown };
    expect(typeof module.func).toBe("function");
    expect(module.idToCallbackMap).toEqual({});
    // func chạy với 1 runtime scene giả không lỗi (bridge chưa có -> bỏ qua an toàn).
    const fakeScene = {
      getVariables: () => ({ get: () => ({ getChild: () => ({ getAsBoolean: () => false, setBoolean: () => undefined }) }) }),
      getGame: () => ({ getInputManager: () => ({ isMouseButtonReleased: () => false, isMouseButtonPressed: () => false }) }),
      getObjects: () => [],
    };
    expect(() => module.func(fakeScene)).not.toThrow();
  });
});

describe("Apply-5 · GonLearningEvents runtime + launcher bridge (source checks)", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

  it("runtime extension build thật nằm trong public/gdjs theo manifest", () => {
    const extensionPath = fileURLToPath(new URL("../../public/gdjs/Extensions/GonLearningEvents/gonlearningevents.js", import.meta.url));
    expect(existsSync(extensionPath)).toBe(true);
    const source = readFileSync(extensionPath, "utf8");
    expect(source).toContain("gonLearningEvents");
    expect(source).toContain("sendGameEvent");
    expect(source).toContain("pointIsOnObject");
    expect(source).toContain("__gonSendEvent");
    const manifest = JSON.parse(read("../../public/gdjs/manifest.json")) as { files: string[] };
    expect(manifest.files).toContain("Extensions/GonLearningEvents/gonlearningevents.js");
  });

  it("source extension (.ts) theo pattern evtTools của extension GDevelop chính thức", () => {
    const source = read("../../../../Extensions/GonLearningEvents/gonlearningevents.ts");
    expect(source).toContain("namespace gdjs");
    expect(source).toContain("export namespace evtTools");
    expect(source).toContain("export namespace gonLearningEvents");
    expect(source).toContain("sendObjectiveViewed");
    expect(source).toContain("pointIsOnObjectCondition");
  });

  it("launcher: bridge __gonSendEvent gửi batch gon.game-events/1.0 lên /v1 + chèn scene code", () => {
    const source = read("../../public/game-launch.html");
    expect(source).toContain("__gonSendEvent");
    expect(source).toContain("/v1/game-sessions/");
    expect(source).toContain("gon.game-events/1.0");
    expect(source).toContain("X-CSRF-Token");
    expect(source).toContain("sceneCode");
    expect(source).toContain("textContent");
  });

  it("FE gửi kèm scene code khi launch iframe", () => {
    const source = read("../../src/components/gon/GameSessionLauncher.tsx");
    expect(source).toContain("gdjsSceneCodeSource");
    expect(source).toContain("gdjsNodeSpecsFromProject");
    expect(source).toContain("sceneCode");
  });
});
