/**
 * Apply-7 (27/10) — GonLearningEvents: declaration chuẩn GDevelop
 * (Extensions/GonLearningEvents/JsExtension.js) — extension được GDevelop editor
 * nhận diện; runtime vẫn build esbuild + serve theo manifest (Apply-5).
 * Test chạy createExtension với mock gd chainable (pattern libGD) và đối chiếu
 * functionName/includeFile với namespace runtime thật.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

interface CapturedInstruction {
  kind: "action" | "condition";
  name: string;
  parameters: Array<Record<string, unknown>>;
  includeFile?: string;
  functionName?: string;
}

function loadExtensionDeclaration() {
  const extensionPath = fileURLToPath(new URL("../../../../Extensions/GonLearningEvents/JsExtension.js", import.meta.url));
  const require = createRequire(import.meta.url);
  // JsExtension.js là CommonJS module — require qua đường dẫn file thật.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return require(extensionPath) as {
    createExtension: (translate: (s: string) => string, gd: unknown) => unknown;
    runExtensionSanityTests: (gd: unknown, extension: unknown) => unknown[];
  };
}

function runCreateExtensionWithMockGd() {
  const captured: CapturedInstruction[] = [];
  let current: CapturedInstruction | null = null;

  const codeExtra = {
    setIncludeFile: (file: string) => {
      if (current) current.includeFile = file;
      return codeExtra;
    },
    setFunctionName: (name: string) => {
      if (current) current.functionName = name;
      return codeExtra;
    },
  };
  const instructionBuilder = {
    addParameter: (...params: unknown[]) => {
      if (current) current.parameters.push(params as unknown as Record<string, unknown>);
      return instructionBuilder;
    },
    getCodeExtraInformation: () => codeExtra,
  };
  const chainable = () => extensionObject;
  const extensionObject = {
    setExtensionInformation: chainable,
    setShortDescription: chainable,
    setExtensionHelpPath: chainable,
    setCategory: chainable,
    addInstructionOrExpressionGroupMetadata: chainable,
    setIcon: chainable,
    addDependency: chainable,
    addAction: (name: string) => {
      current = { kind: "action", name, parameters: [] };
      captured.push(current);
      return instructionBuilder;
    },
    addCondition: (name: string) => {
      current = { kind: "condition", name, parameters: [] };
      captured.push(current);
      return instructionBuilder;
    },
  };
  const gd = { PlatformExtension: function () { return extensionObject; } };
  const module = loadExtensionDeclaration();
  const extension = module.createExtension((text) => text, gd);
  return { extension, captured, module, gd };
}

describe("Apply-7 · GonLearningEvents declaration (GDevelop extension chuẩn)", () => {
  it("createExtension chạy được với gd mock và trả về extension object", () => {
    const { extension } = runCreateExtensionWithMockGd();
    expect(extension).toBeTruthy();
    expect(typeof (extension as Record<string, unknown>).addAction).toBe("function");
  });

  it("đủ 2 actions + 1 condition, includeFile trỏ runtime, functionName khớp namespace runtime", () => {
    const { captured } = runCreateExtensionWithMockGd();
    const actions = captured.filter((item) => item.kind === "action");
    const conditions = captured.filter((item) => item.kind === "condition");
    expect(actions.map((item) => item.name)).toEqual(["SendGameEvent", "SendObjectiveViewed"]);
    expect(conditions.map((item) => item.name)).toEqual(["PointIsOnObject"]);

    for (const instruction of captured) {
      expect(instruction.includeFile).toBe("Extensions/GonLearningEvents/gonlearningevents.js");
    }
    const byName = new Map(captured.map((item) => [item.name, item]));
    expect(byName.get("SendGameEvent")!.functionName).toBe("gdjs.evtTools.gonLearningEvents.sendGameEvent");
    expect(byName.get("SendObjectiveViewed")!.functionName).toBe("gdjs.evtTools.gonLearningEvents.sendObjectiveViewed");
    expect(byName.get("PointIsOnObject")!.functionName).toBe("gdjs.evtTools.gonLearningEvents.pointIsOnObjectCondition");

    // SendGameEvent: eventType (selector 7 giá trị P03) + data JSON.
    const send = byName.get("SendGameEvent")!;
    expect(send.parameters).toHaveLength(2);
    const selector = String(send.parameters[0]![2]);
    expect(selector).toContain("session_started");
    expect(selector).toContain("objective_viewed");
    expect(selector).toContain("checkpoint_reached");
    expect(selector).toContain("session_completed");
    // SendObjectiveViewed: nodeId + title (optional).
    expect(byName.get("SendObjectiveViewed")!.parameters).toHaveLength(2);
    expect(byName.get("PointIsOnObject")!.parameters).toHaveLength(3);
  });

  it("mọi functionName đều tồn tại thật trong source runtime (namespace gdjs.evtTools.gonLearningEvents)", () => {
    const { captured } = runCreateExtensionWithMockGd();
    const runtimeSource = readFileSync(
      fileURLToPath(new URL("../../../../Extensions/GonLearningEvents/gonlearningevents.ts", import.meta.url)),
      "utf8",
    );
    for (const instruction of captured) {
      const functionName = String(instruction.functionName);
      expect(functionName.startsWith("gdjs.evtTools.gonLearningEvents.")).toBe(true);
      const shortName = functionName.split(".").pop()!;
      expect(runtimeSource).toContain(`export const ${shortName}`);
    }
  });

  it("runExtensionSanityTests trả về danh sách rỗng (không lỗi)", () => {
    const { module, gd } = runCreateExtensionWithMockGd();
    expect(module.runExtensionSanityTests(gd, {})).toEqual([]);
  });
});
