import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  boardModuleKeys,
  moduleRect,
  resolveModuleCardEffect,
} from "../campaign/domain/boardModules.ts";
import { sectionColor, sectionTitle } from "../campaign/domain/campaignSettings.ts";
import { eventClockRects } from "../campaign/domain/eventClockLayout.ts";
import type { CampaignBoard } from "../campaign/domain/types.ts";
import { lintBoardLayout } from "./linter.ts";

export function captureBoardContext(board: CampaignBoard) {
  const hidden = new Set(board.settings.hiddenSections);
  const defaultEffect = board.settings.styleTokens?.defaultCardEffect;
  const clockRectMap = eventClockRects(
    board.eventClocks,
    board.settings.moduleLayout,
    board.settings.hiddenSections,
  );
  const coreKeys = ["shifts", "index", "activity"] as const;
  const modules = coreKeys.map((key) => {
    const rect = moduleRect(key, board.settings.moduleLayout);
    const effect = resolveModuleCardEffect(
      key,
      board.settings.moduleLayout,
      defaultEffect,
    );
    return {
      key,
      visible: !hidden.has(key),
      title: sectionTitle(key, board.settings.sectionTitles),
      color: sectionColor(key, board.settings.sectionColors),
      rect,
      effect: effect.shader !== "none" ? effect : null,
    };
  });

  return {
    canvas: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      snapGrid: 10,
      safeMargin: 8,
    },
    campaignName: board.campaign.name,
    appearance: {
      roomKind: board.settings.appearance.room.kind,
      roomColor: board.settings.appearance.room.color,
      perspectiveScene: board.settings.appearance.room.scene ?? null,
      surfaceKind: board.settings.appearance.surface.kind,
      frame: board.settings.appearance.frame,
    },
    styleTokens: board.settings.styleTokens,
    coreModules: modules,
    independentEventClocks: board.eventClocks.map((c) => ({
      id: c.id,
      name: c.name,
      progress: `${c.progress}/${c.segments}`,
      rect: clockRectMap.get(c.id) ?? null,
    })),
    notesSection: {
      visible: !hidden.has("notes"),
      title: sectionTitle("notes", board.settings.sectionTitles),
      count: board.notes.length,
      existingNotes: board.notes.slice(0, 16).map((n) => ({
        id: n.id,
        title: n.title,
        color: n.color,
        pinColor: n.pinColor,
        rotation: n.rotation,
        scale: n.scale ?? 1,
        shader: n.effect?.shader ?? "none",
        x: n.x,
        y: n.y,
      })),
    },
    atomicCustomPanels: board.settings.customPanels.map((p) => ({
      id: p.id,
      title: p.title,
      color: p.color,
      interactiveFor: p.interactiveFor,
      effect: p.effect.shader !== "none" ? p.effect : null,
      blockTypes: p.blocks.map(
        (b) =>
          `${b.type}:${"label" in b ? (b.label ?? "") : "heading" in b ? (b.heading ?? "") : ""}`,
      ),
      rect: { x: p.x, y: p.y, w: p.w, h: p.h },
    })),
    legacyHiddenKeys: boardModuleKeys.filter((k) => hidden.has(k)),
    spatialLintIssues: lintBoardLayout(board),
  };
}

export const HARNESS_SYSTEM_PROMPT = `你是 VeilBoard（帷幕告示板）的专职「公告板编排 Agent Harness」。
你的职责是根据跑团 GM（主持人）的自然语言指令，编排 2144×1206 画布上的核心模块、9 大原子能力拼装展板、**便签样式与 WebGL2 着色器（羊皮纸 / 全息投影 / 烈焰烧焦 / AI 自定义 GLSL）**，以及**公告板背景板面（surfaceShader）与外边框（frameShader）的 WebGL2 环境着色器**。

核心设计规范：
1. 初始三大核心板块：仅保留 "shifts"（成员名册）、"index"（事件钟，独立成卡）、"activity"（行动记录）。所有物资、委托、检查清单均使用 customPanels[].blocks 的 9 大原子积木（resource_list, task_board, checkbox_group, segmented, select, toggle, stepper, kv_list, note_text）拼装。
2. 全站统一 RGB/#rrggbb 色号：模块标题、展板、便签底色（notes[].color / noteUpdates[].color）与图钉颜色（pinColor）全面支持任意 #rrggbb 色号！
3. 便签材质预设与 AI 着色器（effect，支持新建 notes[]、修改既有便签 noteUpdates[] 或全局默认 styleTokens.defaultNoteEffect）：
   - 羊皮纸便签预设：{"shader":"parchment","topology":"perimeter","progress":0.36,"glowIntensity":0.5,"seed":15}（推荐配 color:"#ead6b1", pinColor:"#8c5a2b"）
   - 全息投影便签预设：{"shader":"hologram","topology":"perimeter","progress":0.38,"glowIntensity":2.2,"accentColor":"#2be4dc","seed":42}（推荐配 color:"#0b2530", pinColor:"#2be4dc"）
   - 烈焰烧焦便签预设：{"shader":"burnt","topology":"corner","origin":[0.88,0.12],"progress":0.34,"glowIntensity":2.3,"seed":13}（烧焦区域自动隐去文字）
   - AI 动态自定义着色器：{"shader":"ai_glsl","shaderName":"自定义名","customGlsl":"...以 return vec4(color, alpha); 结尾的 GLSL ES 3.00 代码..."}
   - 便签还支持 rotation (-180..180) 与 scale (0.6..2.2)。
4. 公告板背景（styleTokens.surfaceShader）与边框（styleTokens.frameShader）AI 着色器：
   - shader 可选："none" | "ember_ash"（熔火余烬背景 / 炭化余烬焦木边框） | "hologram_grid"（全息战术矩阵网格背景 / 霓虹能量流光边框） | "ancient_vellum"（古旧羊皮航海星图背景 / 鎏金符文古框） | "abyssal_mist"（深渊迷雾背景与冷焰边框） | "ai_glsl"（你在 customGlsl 编写 GLSL ES 3.00 函数体 \`vec4 evaluateAmbient(vec2 uv)\` 内容，可使用 uRole [0=背景,1=边框], uTime, uResolution, uIntensity, uSpeed, uPrimaryColor, uSecondaryColor, hash/vnoise/fbm/ridge，并以 \`return vec4(col, 1.0);\` 结尾）。

请始终调用 compose_board_blueprint 工具输出结构化蓝图。`;

const CARD_EFFECT_JSON_SCHEMA = {
  type: ["object", "null"],
  properties: {
    shader: {
      type: "string",
      enum: ["none", "burnt", "parchment", "hologram", "ai_glsl"],
      description:
        "模块卡片用 burnt/ai_glsl；便签还可使用预设 parchment（羊皮纸）与 hologram（全息投影）",
    },
    topology: {
      type: "string",
      enum: ["corner", "bottom", "perimeter", "point"],
    },
    progress: { type: "number" },
    origin: { type: "array", items: { type: "number" } },
    glowIntensity: { type: "number" },
    spreadWidth: { type: "number" },
    noiseAmount: { type: "number" },
    seed: { type: "integer" },
    accentColor: { type: ["string", "null"] },
    shaderName: { type: ["string", "null"] },
    customGlsl: { type: ["string", "null"] },
  },
} as const;

const AMBIENT_SHADER_JSON_SCHEMA = {
  type: ["object", "null"],
  properties: {
    shader: {
      type: "string",
      enum: [
        "none",
        "ember_ash",
        "hologram_grid",
        "ancient_vellum",
        "abyssal_mist",
        "ai_glsl",
      ],
    },
    intensity: { type: "number" },
    speed: { type: "number" },
    primaryColor: { type: "string" },
    secondaryColor: { type: "string" },
    shaderName: { type: ["string", "null"] },
    customGlsl: { type: ["string", "null"] },
  },
} as const;

export const COMPOSE_BOARD_TOOL_SCHEMA = {
  name: "compose_board_blueprint",
  description:
    "编排 VeilBoard 核心板块、9 大原子展板、便签样式/Shader（羊皮纸/全息投影/烧焦/AI GLSL）以及公告板背景与外边框 Shader。",
  parameters: {
    type: "object",
    required: ["summary", "assistantReply"],
    properties: {
      summary: { type: "string" },
      assistantReply: { type: "string" },
      campaignName: { type: "string" },
      appearance: {
        type: "object",
        properties: {
          frame: { type: "string", enum: ["wood", "metal", "none", "burger"] },
          surface: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["cork", "felt", "paper"] },
            },
          },
          room: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["color", "perspective", "default"] },
              color: { type: "string" },
              scene: { type: "string", enum: ["crossing", "station"] },
              animated: { type: "boolean" },
              dim: { type: "number" },
            },
          },
        },
      },
      styleTokens: {
        type: "object",
        properties: {
          fontPreset: {
            type: "string",
            enum: ["handwritten", "serif", "typewriter", "mono"],
          },
          cardStyle: {
            type: "string",
            enum: ["paper", "parchment", "slate", "terminal"],
          },
          cardBackground: { type: ["string", "null"] },
          radiusPreset: { type: "string", enum: ["soft", "sharp", "torn"] },
          linkStyle: {
            type: "string",
            enum: ["red_cord", "gold_thread", "chalk", "neon_cyan"],
          },
          defaultCardEffect: CARD_EFFECT_JSON_SCHEMA,
          defaultNoteEffect: CARD_EFFECT_JSON_SCHEMA,
          surfaceShader: AMBIENT_SHADER_JSON_SCHEMA,
          frameShader: AMBIENT_SHADER_JSON_SCHEMA,
        },
      },
      modules: {
        type: "array",
        items: {
          type: "object",
          required: ["key"],
          properties: {
            key: {
              type: "string",
              enum: ["shifts", "index", "activity", "inventory", "tasks", "safety"],
            },
            visible: { type: "boolean" },
            title: { type: ["string", "null"] },
            color: { type: ["string", "null"] },
            x: { type: "integer" },
            y: { type: "integer" },
            w: { type: "integer" },
            h: { type: "integer" },
            effect: CARD_EFFECT_JSON_SCHEMA,
          },
        },
      },
      customPanelsMode: { type: "string", enum: ["merge", "replace"] },
      customPanels: {
        type: "array",
        items: {
          type: "object",
          required: ["title"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["interactive", "markdown", "kv_stats", "callout"] },
            title: { type: "string" },
            color: { type: "string" },
            interactiveFor: { type: "string", enum: ["gm", "members"] },
            effect: CARD_EFFECT_JSON_SCHEMA,
            blocks: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "type"],
                properties: {
                  id: { type: "string" },
                  type: {
                    type: "string",
                    enum: [
                      "resource_list",
                      "task_board",
                      "checkbox_group",
                      "segmented",
                      "select",
                      "toggle",
                      "stepper",
                      "kv_list",
                      "note_text",
                    ],
                  },
                  label: { type: "string" },
                  heading: { type: "string" },
                  text: { type: "string" },
                  emphasis: { type: "string", enum: ["normal", "callout"] },
                  description: { type: "string" },
                  showProgress: { type: "boolean" },
                  allowQuickAdd: { type: "boolean" },
                  options: { type: "array", items: { type: "string" } },
                  value: { type: ["string", "number"] },
                  checked: { type: "boolean" },
                  min: { type: "integer" },
                  max: { type: "integer" },
                  step: { type: "integer" },
                  unit: { type: "string" },
                  tone: {
                    type: "string",
                    enum: ["neutral", "good", "warn", "danger"],
                  },
                  items: { type: "array", items: { type: "object" } },
                  rows: { type: "array", items: { type: "object" } },
                },
              },
            },
            x: { type: "integer" },
            y: { type: "integer" },
            w: { type: "integer" },
            h: { type: "integer" },
          },
        },
      },
      removeCustomPanelIds: { type: "array", items: { type: "string" } },
      notes: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "body"],
          properties: {
            refId: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            color: { type: "string", description: "#rrggbb 或 yellow/pink/blue/green" },
            pinColor: { type: "string", description: "#rrggbb 或 red/blue/green/yellow/black" },
            x: { type: "integer" },
            y: { type: "integer" },
            rotation: { type: "number" },
            scale: { type: "number" },
            effect: CARD_EFFECT_JSON_SCHEMA,
            pinned: { type: "boolean" },
          },
        },
      },
      noteUpdates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            matchTitle: { type: "string" },
            color: { type: "string" },
            pinColor: { type: "string" },
            rotation: { type: "number" },
            scale: { type: "number" },
            effect: CARD_EFFECT_JSON_SCHEMA,
          },
        },
      },
      noteLinks: {
        type: "array",
        items: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            label: { type: ["string", "null"] },
          },
        },
      },
      eventClocks: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "segments", "consequence"],
          properties: {
            name: { type: "string" },
            segments: { type: "integer" },
            progress: { type: "integer" },
            consequence: { type: "string" },
            color: { type: "string" },
          },
        },
      },
    },
  },
} as const;
