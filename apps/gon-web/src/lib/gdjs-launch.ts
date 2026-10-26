/**
 * Apply-4 (27/10) — GDJS launcher thật cho GON game session.
 *
 * FE-10 (PO): lấy động cơ GDJS (Runtime thật + project JSON có kiểu) — KHÔNG sinh
 * game code. Generator này biến Module Graph đã lọc (config từ POST
 * /journeys/{id}/game-sessions — không chứa đáp án ẩn) thành GDevelop project
 * JSON đúng schema runtime (mirror GDJS/tests/games/Text.json), runner bằng
 * gdjs.RuntimeGame + TextObject trong public/game-launch.html.
 */

export const GDJS_LAUNCH_URL = "/game-launch.html";
export const GDJS_MANIFEST_URL = "/gdjs/manifest.json";
export const GON_GAME_LAUNCH_APP = "gon-game-launch";

export interface GdjsColor {
  r: number;
  g: number;
  v: number;
}

export interface GdjsTextObjectData {
  name: string;
  type: "TextObject::Text";
  string: string;
  font: string;
  characterSize: number;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  smoothed: boolean;
  color: GdjsColor;
  variables: unknown[];
  behaviors: unknown[];
}

export interface GdjsInstanceData {
  name: string;
  type: "TextObject::Text";
  x: number;
  y: number;
  zOrder: number;
  angle: number;
  customSize: boolean;
  width: number;
  height: number;
  layer: string;
  locked: boolean;
  numberProperties: unknown[];
  stringProperties: unknown[];
  initialVariables: unknown[];
}

export interface GdjsLayerData {
  name: string;
  visibility: boolean;
  cameras: Array<Record<string, unknown>>;
  effects: unknown[];
  followBaseLayerCamera: boolean;
  isLightingLayer: boolean;
  isLocked: boolean;
  ambientLightColorR: number;
  ambientLightColorG: number;
  ambientLightColorB: number;
}

export interface GdjsLayoutData {
  name: string;
  mangledName: string;
  title: string;
  r: number;
  v: number;
  b: number;
  oglFOV: number;
  oglZFar: number;
  oglZNear: number;
  stopSoundsOnStartup: boolean;
  standardSortMethod: boolean;
  disableInputWhenNotFocused: boolean;
  layers: GdjsLayerData[];
  objects: GdjsTextObjectData[];
  instances: GdjsInstanceData[];
  events: unknown[];
  behaviorsSharedData: unknown[];
  variables: unknown[];
  objectsGroups: unknown[];
  uiSettings: Record<string, unknown>;
}

export interface GdjsProjectData {
  name: string;
  gdVersion: { major: number; minor: number; build: number; revision: number };
  properties: Record<string, unknown>;
  firstLayout: string;
  layouts: GdjsLayoutData[];
  objects: unknown[];
  objectsGroups: unknown[];
  resources: { resources: unknown[]; resourceFolders: unknown[] };
  variables: unknown[];
  externalEvents: unknown[];
  externalLayouts: unknown[];
  externalSourceFiles: unknown[];
}

interface LaunchModuleGraphInput {
  module?: {
    title?: unknown;
    summary?: unknown;
    estimatedMinutes?: unknown;
    difficulty?: unknown;
    outcomes?: Array<{ statement?: unknown }>;
    safetyNotices?: Array<unknown>;
  };
  nodes?: Array<{ id?: unknown; title?: unknown; type?: unknown; estimatedMinutes?: unknown }>;
}

/** Ngắt dòng đơn giản theo chiều rộng ký tự (TextObject không tự wrap). */
export function gdjsWrapText(text: string, maxWidth = 84): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function textObject(name: string, string: string, size: number, bold: boolean, y: number): { object: GdjsTextObjectData; instance: GdjsInstanceData } {
  return {
    object: {
      name,
      type: "TextObject::Text",
      string,
      font: "",
      characterSize: size,
      bold,
      italic: false,
      underlined: false,
      smoothed: true,
      color: { r: 207, g: 224, v: 255 },
      variables: [],
      behaviors: [],
    },
    instance: {
      name,
      type: "TextObject::Text",
      x: 40,
      y,
      zOrder: 1,
      angle: 0,
      customSize: false,
      width: 0,
      height: 0,
      layer: "",
      locked: false,
      numberProperties: [],
      stringProperties: [],
      initialVariables: [],
    },
  };
}

/**
 * Sinh GDevelop project JSON (schema runtime thật) từ Module Graph đã lọc.
 * Mỗi dòng hiển thị là một TextObject — KHÔNG sinh code, chỉ data có kiểu.
 */
export function gdjsProjectFromModuleGraph(config: unknown, options: { name?: string } = {}): GdjsProjectData {
  const graph = (config ?? {}) as LaunchModuleGraphInput;
  const module = graph.module ?? {};
  const title = typeof module.title === "string" && module.title.length > 0 ? module.title : "Phiên học tương tác GON";
  const summary = typeof module.summary === "string" ? module.summary : "";
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const outcomes = Array.isArray(module.outcomes) ? module.outcomes : [];

  const objects: GdjsTextObjectData[] = [];
  const instances: GdjsInstanceData[] = [];
  let y = 24;
  let z = 1;
  function pushLine(string: string, size: number, bold: boolean) {
    for (const line of gdjsWrapText(string)) {
      z += 1;
      const name = `GonLine${z}`;
      const { object, instance } = textObject(name, line, size, bold, y);
      objects.push(object);
      instances.push(instance);
      y += Math.round(size * 1.6);
    }
  }

  pushLine(title, 26, true);
  if (summary.length > 0) pushLine(summary, 16, false);
  y += 12;
  // Apply-5: mỗi node là MỘT object riêng (GonNode{i}) — scene code generated
  // dùng tên này để bắt sự kiện chạm (objective_viewed) và đổi màu khi đã xem.
  nodes.slice(0, 8).forEach((node, index) => {
    const nodeTitle = typeof node.title === "string" && node.title.length > 0 ? node.title : String(node.id ?? `Node ${index + 1}`);
    const minutes = typeof node.estimatedMinutes === "number" ? ` · ~${node.estimatedMinutes} phút` : "";
    const label = `${index + 1}. ${nodeTitle} (${typeof node.type === "string" ? node.type : "step"}${minutes})`;
    z += 1;
    const name = `GonNode${index + 1}`;
    const { object, instance } = textObject(name, label.length > 78 ? `${label.slice(0, 75)}…` : label, 18, false, y);
    objects.push(object);
    instances.push(instance);
    y += Math.round(18 * 1.6);
  });
  if (outcomes.length > 0) {
    y += 12;
    pushLine("Mục tiêu:", 16, true);
    outcomes.slice(0, 6).forEach((outcome) => {
      const statement = typeof outcome.statement === "string" ? outcome.statement : "";
      if (statement.length > 0) pushLine(`• ${statement}`, 15, false);
    });
  }
  y += 16;
  pushLine("Đọc xong → bấm ✅ Hoàn thành phiên (góc phải trên).", 15, false);

  return {
    name: options.name ?? title,
    gdVersion: { major: 4, minor: 0, build: 96, revision: 89 },
    properties: {
      folderProject: false,
      linuxExecutableFilename: "",
      macExecutableFilename: "",
      packageName: "org.gon.gamesession",
      projectFile: "",
      useExternalSourceFiles: false,
      winExecutableFilename: "",
      winExecutableIconFile: "",
      name: options.name ?? title,
      author: "GON",
      windowWidth: 800,
      windowHeight: Math.max(600, y + 40),
      latestCompilationDirectory: "",
      maxFPS: 60,
      minFPS: 10,
      verticalSync: false,
      extensions: [{ name: "TextObject" }],
      platforms: [{ name: "GDevelop JS platform" }],
      currentPlatform: "GDevelop JS platform",
      orientation: "landscape",
      fullscreenMode: "",
      scaleMode: "",
      showProjectProperties: false,
    },
    firstLayout: "",
    layouts: [
      {
        name: "MainScene",
        mangledName: "MainScene",
        title,
        r: 11,
        v: 18,
        b: 38,
        oglFOV: 90,
        oglZFar: 500,
        oglZNear: 1,
        stopSoundsOnStartup: true,
        standardSortMethod: true,
        disableInputWhenNotFocused: true,
        layers: [
          {
            name: "",
            visibility: true,
            cameras: [
              {
                defaultSize: true,
                defaultViewport: true,
                height: 0,
                viewportBottom: 1,
                viewportLeft: 0,
                viewportRight: 1,
                viewportTop: 0,
                width: 0,
              },
            ],
            effects: [],
            followBaseLayerCamera: false,
            isLightingLayer: false,
            isLocked: false,
            ambientLightColorR: 0,
            ambientLightColorG: 0,
            ambientLightColorB: 0,
          },
        ],
        objects,
        instances,
        events: [],
        behaviorsSharedData: [],
        variables: [],
        objectsGroups: [],
        uiSettings: { grid: false, gridB: 255, gridG: 180, gridHeight: 32, gridOffsetX: 0, gridOffsetY: 0, gridWidth: 32, gridType: false, snap: false },
      },
    ],
    objects: [],
    objectsGroups: [],
    resources: { resources: [], resourceFolders: [] },
    variables: [],
    externalEvents: [],
    externalLayouts: [],
    externalSourceFiles: [],
  };
}
