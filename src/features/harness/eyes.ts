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
import type { DiceMaterialConfig } from "../dice/diceMaterialConfig.ts";
import type { AccountAssetContextItem } from "./schema.ts";
import { lintBoardLayout } from "./linter.ts";

export interface CaptureBoardContextOptions {
  accountAssets?: readonly AccountAssetContextItem[];
  currentDiceMaterial?: Partial<DiceMaterialConfig> | null;
}

export function captureBoardContext(
  board: CampaignBoard,
  options?: CaptureBoardContextOptions,
) {
  const hidden = new Set(board.settings.hiddenSections);
  const hiddenPanels = new Set(board.settings.styleTokens?.hiddenPanelIds ?? []);
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
      effect:
        effect.shader !== "none"
          ? { shader: effect.shader, shaderName: effect.shaderName ?? null, progress: effect.progress }
          : null,
    };
  });

  const tokens = board.settings.styleTokens;
  const archiveEntries = tokens?.archiveEntries ?? [];

  // Map-not-Manual context: omit raw customGlsl strings & full archive bodies so
  // the payload stays compact well below Edge Function size caps.
  return {
    canvas: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      snapGrid: 10,
      safeMargin: 8,
    },
    campaignName: board.campaign.name,
    appearance: {
      roomKind: board.settings.appearance.room.kind === "perspective" ? "color" : board.settings.appearance.room.kind,
      roomColor: board.settings.appearance.room.color,
      surfaceKind: board.settings.appearance.surface.kind,
      frame: board.settings.appearance.frame,
    },
    styleSummary: {
      fontPreset: tokens.fontPreset,
      cardStyle: tokens.cardStyle,
      cardBackground: tokens.cardBackground,
      radiusPreset: tokens.radiusPreset,
      linkStyle: tokens.linkStyle,
      fontSizeScale: tokens.fontSizeScale ?? 1,
      clockPreset: tokens.clockAppearance?.preset ?? "auto",
      clockDial: board.settings.clock.style,
      activeShaders: {
        card: tokens.defaultCardEffect?.shader ?? "none",
        note: tokens.defaultNoteEffect?.shader ?? "none",
        surface: tokens.surfaceShader?.shader ?? "none",
        frame: tokens.frameShader?.shader ?? "none",
      },
    },
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
      hidden: hiddenPanels.has(p.id),
      interactiveFor: p.interactiveFor,
      effect:
        p.effect.shader !== "none"
          ? { shader: p.effect.shader, shaderName: p.effect.shaderName ?? null }
          : null,
      blockTypes: p.blocks.map(
        (b) =>
          `${b.type}:${"label" in b ? (b.label ?? "") : "heading" in b ? (b.heading ?? "") : ""}`,
      ),
      rect: { x: p.x, y: p.y, w: p.w, h: p.h },
    })),
    archiveIndex: archiveEntries.slice(0, 32).map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      visibility: entry.visibility,
      tags: entry.tags,
      pinned: entry.pinned,
    })),
    accountAssets: (options?.accountAssets ?? []).slice(0, 24).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      source: asset.source,
      favorite: asset.favorite,
      previewColors: asset.previewColors,
    })),
    currentDiceMaterial: options?.currentDiceMaterial
      ? {
          presetId: options.currentDiceMaterial.presetId ?? "jade",
          shaderPreset: options.currentDiceMaterial.shaderPreset ?? "none",
          bodyColor: options.currentDiceMaterial.bodyColor ?? "#8fb9a5",
          accentColor: options.currentDiceMaterial.accentColor ?? "#b8eed4",
          acousticProfile: options.currentDiceMaterial.acousticProfile ?? "stone",
        }
      : null,
    legacyHiddenKeys: boardModuleKeys.filter((k) => hidden.has(k)),
    spatialLintIssues: lintBoardLayout(board),
  };
}

export const HARNESS_SYSTEM_PROMPT = `你是 VeilBoard（帷幕告示板）的专职「公告板编排 Agent Harness」。
你的职责是根据跑团 GM（主持人）的自然语言指令，编排 2144×1206 画布上的 15 类原子积木、便签与着色器。

核心设计规范：
1. 所有新板块均通过 customPanels[].blocks 编排。modules[] 仅用于兼容旧战役。已有板块的 id、积木 id 与运行数据必须保留，新增板块不得覆盖其他板块：
   - 成员名册块 member_roster：{"id":"m1","type":"member_roster","label":"在场成员","maxItems":4,"showRoleBadge":true}
   - 事件钟块 event_clock：{"id":"e1","type":"event_clock","name":"熔炉过载","segments":6,"progress":2,"color":"#d9481c","consequence":"满格触发蒸汽爆裂"}
   - 工作记录块 activity_feed：{"id":"a1","type":"activity_feed","label":"最近工作记录","maxItems":5}
   - 其余能力：resource_list、task_board、checkbox_group、choice_selector、meter_counter、toggle、kv_list、note_text、image_media、dice_macro、initiative_track、roll_table。

【场景选型规则】
- 悬赏、赏金、雇佣、契约 → task_board(variant:"bounty")；通缉、抓捕、追捕 → task_board(variant:"wanted")；委托、支线、讨伐 → task_board(variant:"quest")；调查目标 → task_board(variant:"objective")。
  每条任务使用 title/detail/reward/badge/status，status 是 open/in_progress/completed；不得用 note_text 或 kv_list 代替交互任务。人物通缉配 image_media。
- 地图、平面图、照片、肖像、立绘 → image_media；images[].url 必须是真实可用的图片地址，无来源时使用项目图像生成 API，禁止编造图床地址。
- HP、SAN、生命、理智 → meter_counter(variant:"bar")；压力格、法术位 → variant:"pips"（最多12格）；声望、好感度 → variant:"bipolar"；其他计数 → variant:"stepper"。
- 阶段、模式、阵营单选 → choice_selector，display:"auto"（≤4项分段，更多项下拉）；不要再输出 segmented/select/stepper 旧类型。
- 快捷检定、常用骰子公式 → dice_macro，macros[].notation 使用合法公式；visibility:"public"/"gm"/"self"。
- 先攻、战斗顺序、回合轨 → initiative_track，entries[].name/initiative/hpNote/isNpc。
- 随机表、遭遇表、传闻表、疯狂症状 → roll_table，entries[].text/weight/tag。

【黄金示例】
酒馆通缉榜：{"customPanels":[{"title":"港口通缉榜","blocks":[{"id":"wanted","type":"task_board","label":"通缉令","variant":"wanted","items":[{"id":"w1","title":"黑帆走私头目","detail":"最后出现在北码头","reward":"500金币","badge":"活捉","status":"open"},{"id":"w2","title":"失踪钟表师","detail":"寻找目击证人","reward":"200金币","status":"open"}]}]}]}
调查员战术板：{"customPanels":[{"title":"调查战术","blocks":[{"id":"san","type":"meter_counter","label":"理智","variant":"bar","value":50,"min":0,"max":80,"step":1},{"id":"checks","type":"dice_macro","label":"检定","macros":[{"id":"spot","name":"侦查","notation":"1d100","visibility":"public"}]},{"id":"danger","type":"event_clock","name":"警戒","segments":6,"progress":0,"color":"#b24b37","consequence":"守卫封锁码头"}]}]}
2. 全站统一 RGB/#rrggbb 色号：模块标题、展板、便签底色（notes[].color / noteUpdates[].color）与图钉颜色（pinColor）全面支持任意 #rrggbb 色号！
3. 便签材质预设与 AI 着色器（effect，支持新建 notes[]、修改既有便签 noteUpdates[] 或全局默认 styleTokens.defaultNoteEffect）：
   - 羊皮纸便签预设：{"shader":"parchment","topology":"perimeter","progress":0.36,"glowIntensity":0.5,"seed":15}（推荐配 color:"#ead6b1", pinColor:"#8c5a2b"）
   - 全息投影便签预设：{"shader":"hologram","topology":"perimeter","progress":0.38,"glowIntensity":2.2,"accentColor":"#2be4dc","seed":42}（推荐配 color:"#0b2530", pinColor:"#2be4dc"）
   - 烈焰烧焦便签预设：{"shader":"burnt","topology":"corner","origin":[0.88,0.12],"progress":0.34,"glowIntensity":2.3,"seed":13}（烧焦区域自动隐去文字）
   - AI 动态自定义着色器：{"shader":"ai_glsl","shaderName":"自定义名","customGlsl":"...以 return vec4(color, alpha); 结尾的 GLSL ES 3.00 代码..."}
   - 便签还支持 rotation (-180..180) 与 scale (0.6..2.2)。
4. 公告板背景（styleTokens.surfaceShader）与边框（styleTokens.frameShader）AI 着色器：
   - shader 可选："none" | "ember_ash"（熔火余烬背景 / 炭化余烬焦木边框） | "hologram_grid"（全息战术矩阵网格背景 / 霓虹能量流光边框） | "ancient_vellum"（古旧羊皮航海星图背景 / 鎏金符文古框） | "abyssal_mist"（深渊迷雾背景与冷焰边框） | "ai_glsl"（你在 customGlsl 编写 GLSL ES 3.00 函数体 \`vec4 evaluateAmbient(vec2 uv)\` 内容，可使用 uRole [0=背景,1=边框], uTime, uResolution, uIntensity, uSpeed, uPrimaryColor, uSecondaryColor, hash/vnoise/fbm/ridge，并以 \`return vec4(col, 1.0);\` 结尾）。
5. 档案盒（archiveEntries[]，长期卷宗库，GM 可编辑、PL 只读）：
   - 适用于归档线索（category:"clue"）、物证档案（category:"evidence"）、NPC 人物档案（category:"character"，title=姓名、subtitle=职业/身份、body=详细信息）、报纸新闻剪报（category:"news"，subtitle=报刊刊头与版面）。
   - 默认 archiveEntriesMode:"merge"（追加/按 id 更新），切勿覆盖既有卷宗。
6. 3D 骰子材质与自定义 Shader（diceMaterial）：
   - 预设 presetId 可选：jade / ivory / obsidian / neon / gilded_metal / crystal / nebula_core / molten_ember / holo_prism / liquid_core / arcane_rune；
   - shaderPreset 可选：none / nebula / molten / holo / liquid / arcane / custom（custom 时在 customGlsl 编写 Three.js 片元注入代码，可读写 diffuseColor.rgb 与 totalEmissiveRadiance，可用 uTime / uAccentColor / uIntensity / vDicePos / hpFbm3 / hpVoronoi3，严禁 #version 或 while 循环）；
   - 可配置 bodyColor、marksColor、accentColor、liningColor、roughness、metalness、clearcoat、iridescence、transmission、texturePattern 与 acousticProfile。
7. 个人资产库上下文召回（recallAssetIds[]）：
   - 上下文中的 accountAssets[] 列出了当前 GM 账号已保存的 Shader、时钟样式、骰子材质与视觉配方。当 GM 要求「用我资产库里的 xxx」「套用上次保存的 Shader/时钟/骰子」时，直接填入对应 id 到 recallAssetIds[]，无需重写长段 GLSL。

【跑团专属约束（TRPG Guardrails，务必遵守）】
- 防剧透铁律：凡涉及「幕后黑手、真相、未公开秘密、KP/GM 备忘、陷阱触发条件」的 archiveEntries，必须设 visibility:"gm_only"；暗骰检定 dice_macro 必须设 visibility:"gm" 或 "self"。
- 非破坏性延续：除非 GM 明确说「清空 / 重置 / 开新团」，必须保持 customPanelsMode:"merge" 与 archiveEntriesMode:"merge"，绝不抹除玩家已推进的事件钟、物资与线索便签。
- 规则系统自适应：CoC/克苏鲁优先用 1d100（侦查/聆听/理智 SAN 血条）；D&D/PF 优先用 1d20/优劣势 2d20kh1/先攻与法术位 pips；暗夜刀锋/PbtA 优先用 2d6/4-8 格事件钟/压力 pips/势力声望 bipolar；规则怪谈优先用高亮规则说明卡与倒计时危机钟。
- 桌面可读性节制：单屏活跃展板保持精炼（一般 ≤ 6 块）；燃烧着色器 progress 建议 ≤ 0.42 以免烧毁正文导致线索不可读。

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

const CLOCK_APPEARANCE_JSON_SCHEMA = {
  type: ["object", "null"],
  properties: {
    preset: {
      type: "string",
      enum: [
        "auto",
        "veil_cork",
        "shadow_slate",
        "parchment_study",
        "crisis_diner",
        "cyber_terminal",
        "molten_forge",
        "custom",
      ],
    },
    label: { type: ["string", "null"] },
    surfaceColor: { type: ["string", "null"] },
    borderColor: { type: ["string", "null"] },
    textColor: { type: ["string", "null"] },
    accentColor: { type: ["string", "null"] },
    glowColor: { type: ["string", "null"] },
    fontStyle: { type: "string", enum: ["mono", "serif", "handwritten", "display"] },
    frameStyle: { type: "string", enum: ["glass", "bezel", "parchment", "terminal"] },
    scanlines: { type: "boolean" },
    glowStrength: { type: "number" },
    aiPrompt: { type: ["string", "null"] },
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
              kind: { type: "string", enum: ["color", "default"] },
              color: { type: "string" },
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
          clockAppearance: CLOCK_APPEARANCE_JSON_SCHEMA,
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
                      "member_roster",
                      "event_clock",
                      "activity_feed",
                      "resource_list",
                      "task_board",
                      "checkbox_group",
                      "choice_selector",
                      "toggle",
                      "meter_counter",
                      "image_media",
                      "dice_macro",
                      "initiative_track",
                      "roll_table",
                      "kv_list",
                      "note_text",
                    ],
                  },
                  label: { type: "string" },
                  name: { type: "string" },
                  segments: { type: "integer" },
                  progress: { type: "integer" },
                  color: { type: "string" },
                  consequence: { type: "string" },
                  maxItems: { type: "integer" },
                  showRoleBadge: { type: "boolean" },
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
                  display: { type: "string", enum: ["auto", "segmented", "dropdown"] },
                  variant: { type: "string", enum: ["quest", "bounty", "wanted", "objective", "stepper", "bar", "pips", "bipolar"] },
                  layout: { type: "string", enum: ["hero", "grid", "polaroid"] },
                  round: { type: "integer", minimum: 1 },
                  activeIndex: { type: "integer", minimum: 0 },
                  lastRolledId: { type: ["string", "null"] },
                  fontSize: { type: "integer", minimum: 12, maximum: 28 },
                  items: { type: "array", items: { type: "object", required: ["id"], properties: {
                    id: { type: "string" }, title: { type: "string", description: "task_board 的任务标题" },
                    detail: { type: "string" }, reward: { type: "string" }, badge: { type: "string" },
                    imageUrl: { type: ["string", "null"] }, assignee: { type: "string" }, due: { type: "string" },
                    name: { type: "string", description: "resource_list 的物资名称" }, quantity: { type: "integer", minimum: 0 },
                    unit: { type: "string" }, status: { type: "string", enum: ["open", "in_progress", "completed", "ok", "low", "out"] },
                    label: { type: "string", description: "checkbox_group 的核对项" }, checked: { type: "boolean" }, tag: { type: "string" },
                  } } },
                  images: { type: "array", maxItems: 9, items: { type: "object", required: ["id", "url"], properties: {
                    id: { type: "string" }, url: { type: "string" }, caption: { type: "string" }, aspect: { type: "string", enum: ["16:9", "4:3", "1:1", "auto"] },
                  } } },
                  macros: { type: "array", maxItems: 12, items: { type: "object", required: ["id", "name", "notation"], properties: {
                    id: { type: "string" }, name: { type: "string" }, notation: { type: "string" }, visibility: { type: "string", enum: ["public", "gm", "self"] },
                    tone: { type: "string", enum: ["neutral", "good", "warn", "danger"] },
                  } } },
                  entries: { type: "array", items: { type: "object", required: ["id"], properties: {
                    id: { type: "string" }, name: { type: "string" }, initiative: { type: "integer" }, hpNote: { type: "string" },
                    isNpc: { type: "boolean" }, acted: { type: "boolean" }, text: { type: "string" }, weight: { type: "integer", minimum: 1 }, tag: { type: "string" },
                  } } },
                  rows: { type: "array", items: { type: "object", required: ["label", "value"], properties: {
                    label: { type: "string" }, value: { type: "string" }, tone: { type: "string", enum: ["neutral", "good", "warn", "danger"] },
                  } } },
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
      archiveEntriesMode: { type: "string", enum: ["merge", "replace"] },
      archiveEntries: {
        type: "array",
        items: {
          type: "object",
          required: ["title"],
          properties: {
            id: { type: "string" },
            category: { type: "string", enum: ["clue", "evidence", "character", "news"] },
            title: { type: "string" },
            subtitle: { type: "string" },
            dateLabel: { type: "string" },
            summary: { type: "string" },
            body: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            imageUrl: { type: ["string", "null"] },
            fontSize: { type: "integer" },
            visibility: { type: "string", enum: ["public", "gm_only"] },
            pinned: { type: "boolean" },
          },
        },
      },
      diceMaterial: {
        type: ["object", "null"],
        properties: {
          presetId: {
            type: "string",
            enum: [
              "jade", "ivory", "obsidian", "neon", "gilded_metal", "crystal",
              "nebula_core", "molten_ember", "holo_prism", "liquid_core", "arcane_rune",
            ],
          },
          bodyColor: { type: "string" },
          marksColor: { type: "string" },
          accentColor: { type: "string" },
          liningColor: { type: "string" },
          roughness: { type: "number" },
          metalness: { type: "number" },
          clearcoat: { type: "number" },
          iridescence: { type: "number" },
          transmission: { type: "number" },
          ior: { type: "number" },
          emissiveIntensity: { type: "number" },
          texturePattern: {
            type: "string",
            enum: ["stone", "marble", "brushed", "hammered", "wood", "smooth"],
          },
          shaderPreset: {
            type: "string",
            enum: ["none", "nebula", "molten", "holo", "liquid", "arcane", "custom"],
          },
          shaderSpeed: { type: "number" },
          shaderIntensity: { type: "number" },
          customGlsl: { type: "string" },
          acousticProfile: {
            type: "string",
            enum: ["stone", "resin", "metal", "crystal", "wood"],
          },
        },
      },
      recallAssetIds: {
        type: "array",
        items: { type: "string" },
        description: "从上下文 accountAssets[] 中按 id 召回并套用已保存的个人资产",
      },
    },
  },
} as const;
