import {
  normalizeBoardAmbientShader,
  normalizeCardVisualEffect,
  noteEffectPresets,
  type BoardAmbientShader,
  type CardShaderTopology,
  type CardVisualEffect,
} from "../campaign/domain/cardEffects.ts";
import {
  normalizeBoardClockAppearance,
  synthesizeClockStyleFromPrompt,
} from "../campaign/domain/clockAppearance.ts";
import { ATOMIC_PANEL_TEMPLATES, createExtendedPanelBlock } from "../campaign/domain/customPanels.ts";
import type { CampaignBoard } from "../campaign/domain/types.ts";
import type { BoardHarnessBlueprint } from "./schema.ts";

export interface HarnessStarterRecipe {
  id: string;
  label: string;
  tagline: string;
  promptHint: string;
  build: (board: CampaignBoard) => BoardHarnessBlueprint;
}

export const AI_GENERATED_MOLTEN_GOLD_GLSL = `
  if (d >= 0.0) {
    float scorch = smoothstep(uSpreadWidth * 1.2, 0.0, d);
    float vein = pow(ridge(uv * 18.0 + uSeed), 5.0);
    vec3 warm = mix(color, vec3(0.54, 0.34, 0.11), scorch * 0.82);
    warm = mix(warm, vec3(0.18, 0.09, 0.03), pow(scorch, 2.2) * 0.9);
    warm += vec3(0.95, 0.72, 0.18) * vein * pow(scorch, 1.8) * 0.55;
    color = warm * (1.0 - 0.25 * exp(-d * 36.0));
  } else {
    float behind = -d;
    float crack = pow(ridge(uv * 30.0 + uSeed), 5.0);
    vec3 obsidian = vec3(0.03, 0.025, 0.022) + crack * vec3(0.85, 0.52, 0.08) * 0.38;
    float pulse = 0.72 + 0.28 * sin(uTime * 9.0 + n * 34.0);
    float goldRim = smoothstep(uEmberWidth * 1.4, 0.0, behind);
    obsidian += vec3(1.0, 0.68, 0.12) * uGlowIntensity * pulse * goldRim * (0.65 + 0.6 * crack);
    color = obsidian;
    alpha *= mix(1.0, 0.35 + 0.65 * ashNoise, smoothstep(uCharWidth, uAshWidth, behind));
  }
  return vec4(color, alpha);
`;

export const HARNESS_STARTER_RECIPES: readonly HarnessStarterRecipe[] = [
  {
    id: "hologram_matrix_notes",
    label: "全息投影便签与战术流光板（背景+边框+便签 Shader）",
    tagline: "全息投影便签 + 羊皮纸残片对照 + AI 全息战术网格背景与流光边框 Shader",
    promptHint:
      "把公告板背景和边框改成全息网格与霓虹能量流光 Shader，并生成全息投影便签与线索连线",
    build: () => ({
      summary: "全息投影便签与全息网格背景/流光边框 Shader",
      assistantReply:
        "已为公告板背景启用「全息战术雷达网格 Shader」、外边框启用「霓虹脉冲装甲流光 Shader」，并在板面上挂载了带动态扫描线与光学准星的「全息投影便签」与可缩放线索。",
      appearance: {
        frame: "metal",
        surface: { kind: "felt" },
        room: { kind: "color", color: "#071016", dim: 0.28 },
      },
      styleTokens: {
        fontPreset: "mono",
        cardStyle: "terminal",
        cardBackground: null,
        radiusPreset: "sharp",
        linkStyle: "neon_cyan",
        defaultNoteEffect: structuredClone(noteEffectPresets[2].effect),
        surfaceShader: normalizeBoardAmbientShader({
          shader: "hologram_grid",
          intensity: 1.15,
          speed: 1.0,
          primaryColor: "#071821",
          secondaryColor: "#2be4dc",
        }),
        frameShader: normalizeBoardAmbientShader({
          shader: "hologram_grid",
          intensity: 1.3,
          speed: 1.2,
          primaryColor: "#0c222d",
          secondaryColor: "#2be4dc",
        }),
        clockAppearance: normalizeBoardClockAppearance({
          preset: "cyber_terminal",
          label: "赛博终端",
        }),
      },
      clock: { style: "digital" },
      modules: [
        { key: "inventory", visible: false },
        { key: "tasks", visible: false },
        { key: "safety", visible: false },
        { key: "shifts", visible: false },
        { key: "index", visible: false },
        { key: "activity", visible: false },
      ],
      customPanelsMode: "replace",
      customPanels: [
        {
          id: "holo-core-team",
          kind: "interactive",
          title: "在线探员与追踪钟",
          color: "#123b4a",
          interactiveFor: "gm",
          blocks: [
            {
              id: "hc-roster",
              type: "member_roster",
              label: "在线探员名册",
              maxItems: 4,
              showRoleBadge: true,
            },
            {
              id: "hc-clock",
              type: "event_clock",
              name: "信标信号衰减",
              segments: 6,
              progress: 2,
              color: "#2be4dc",
              consequence: "信号彻底归零，空间站进入盲区。",
            },
          ],
          x: 40,
          y: 40,
          w: 380,
          h: 490,
        },
        {
          id: "holo-core-log",
          kind: "interactive",
          title: "终端工作记录",
          color: "#163844",
          interactiveFor: "gm",
          blocks: [
            {
              id: "hc-feed",
              type: "activity_feed",
              label: "最近操作流",
              maxItems: 5,
            },
          ],
          x: 40,
          y: 560,
          w: 380,
          h: 360,
        },
        {
          id: "holo-ops-panel",
          kind: "interactive",
          title: "轨道信标与物资遥测",
          color: "#114656",
          interactiveFor: "members",
          blocks: [
            {
              id: "ho-seg",
              type: "choice_selector",
              display: "segmented",
              label: "全息信道频段",
              options: ["静默接收", "加密中继", "超载广播"],
              value: "加密中继",
            },
            {
              id: "ho-tasks",
              type: "task_board",
              label: "战术行动委托",
              items: [
                {
                  id: "ht-1",
                  title: "解码三号气闸舱全息黑匣子",
                  detail: "比对右侧两张全息投影便签的跃迁时间戳。",
                  due: "T-15m",
                  status: "in_progress",
                  assignee: "帷幕主持人",
                },
              ],
            },
            {
              id: "ho-res",
              type: "resource_list",
              label: "高能电池与硬件",
              items: [
                { id: "hr-1", name: "冷聚变电池芯", quantity: 3, unit: "组", status: "ok" },
                { id: "hr-2", name: "EMP 干扰信标", quantity: 1, unit: "枚", status: "low" },
              ],
            },
          ],
          x: 450,
          y: 50,
          w: 460,
          h: 580,
        },
      ],
      notes: [
        {
          refId: "holo_n1",
          title: "全息投影 · 跃迁信标 #09",
          body: "侦测到外环货运舰在 02:14 留下伪造识别码，信号源指向废弃空间站。",
          color: "#0b2530",
          pinColor: "#2be4dc",
          x: 1020,
          y: 90,
          rotation: -4,
          scale: 1.15,
          effect: structuredClone(noteEffectPresets[2].effect),
          pinned: true,
        },
        {
          refId: "holo_n2",
          title: "羊皮手稿 · 旧时代星门铭文",
          body: "船长保险箱内出土的古羊皮残页，记载的坐标竟与全息信标完全重合。",
          color: "#ead6b1",
          pinColor: "#d4a644",
          x: 1440,
          y: 260,
          rotation: 6,
          scale: 1.1,
          effect: structuredClone(noteEffectPresets[1].effect),
        },
      ],
      noteLinks: [
        { from: "holo_n1", to: "holo_n2", label: "星门坐标吻合" },
      ],
    }),
  },
  {
    id: "burnt_furnace_crisis",
    label: "烈焰烧焦残卷（余烬背景边框 + 羊皮/烧焦便签）",
    tagline: "熔火余烬背景与焦木边框 Shader + 烧焦隐字卡片 + 羊皮纸/烧焦便签",
    promptHint:
      "把公告板背景和边框加上余烬焦木 Shader，卡片和便签做成烧焦与古羊皮效果，烧过的地方不显示文字",
    build: () => ({
      summary: "烈焰烧焦残卷 · 余烬边框背景与烧焦隐字卡片/便签",
      assistantReply:
        "已为公告板背景与木框启用「熔火余烬焦木 Shader」，关键展板与便签均已挂载真实火焰燃烧或古羊皮 Shader（烧焦区域自动隐去字迹），并拼装了救援物资与抢修委托原子积木。",
      appearance: {
        frame: "wood",
        surface: { kind: "cork" },
        room: { kind: "color", color: "#190d0a", dim: 0.34 },
      },
      styleTokens: {
        fontPreset: "serif",
        cardStyle: "parchment",
        cardBackground: null,
        radiusPreset: "soft",
        linkStyle: "gold_thread",
        surfaceShader: normalizeBoardAmbientShader({
          shader: "ember_ash",
          intensity: 0.95,
          speed: 0.9,
          primaryColor: "#261710",
          secondaryColor: "#ea580c",
        }),
        frameShader: normalizeBoardAmbientShader({
          shader: "ember_ash",
          intensity: 1.35,
          speed: 1.1,
          primaryColor: "#22120b",
          secondaryColor: "#f97316",
        }),
      },
      modules: [
        { key: "inventory", visible: false },
        { key: "tasks", visible: false },
        { key: "safety", visible: false },
        { key: "shifts", visible: false },
        { key: "index", visible: false },
        { key: "activity", visible: false },
      ],
      customPanelsMode: "replace",
      customPanels: [
        {
          id: "furnace-core-command",
          kind: "interactive",
          title: "在场小队与熔炉事件钟",
          color: "#6b2219",
          interactiveFor: "gm",
          effect: {
            shader: "burnt",
            topology: "corner",
            origin: [0.9, 0.12],
            progress: 0.3,
            glowIntensity: 2.5,
            spreadWidth: 0.22,
            noiseAmount: 0.45,
            seed: 9,
          },
          blocks: [
            {
              id: "fc-roster",
              type: "member_roster",
              label: "在场救援小队",
              maxItems: 3,
              showRoleBadge: true,
            },
            {
              id: "fc-clock",
              type: "event_clock",
              name: "主熔炉压力过载",
              segments: 6,
              progress: 3,
              color: "#d9481c",
              consequence: "核心安全阀崩裂，下层通道被高温蒸汽吞没。",
            },
          ],
          x: 40,
          y: 40,
          w: 380,
          h: 500,
        },
        {
          id: "furnace-core-log",
          kind: "interactive",
          title: "现场工作记录",
          color: "#6e381d",
          interactiveFor: "gm",
          blocks: [
            {
              id: "fc-feed",
              type: "activity_feed",
              label: "抢险操作动态",
              maxItems: 5,
            },
          ],
          x: 40,
          y: 570,
          w: 380,
          h: 360,
        },
        {
          id: "furnace-atomic-tasks",
          kind: "interactive",
          title: "紧急抢修委托与物资单",
          color: "#87241a",
          interactiveFor: "members",
          effect: {
            shader: "burnt",
            topology: "corner",
            origin: [0.88, 0.12],
            progress: 0.38,
            glowIntensity: 2.4,
            spreadWidth: 0.24,
            noiseAmount: 0.46,
            seed: 7,
          },
          blocks: [
            {
              id: "f-tasks",
              type: "task_board",
              label: "抢修行动委托（烧焦处字迹已被焚毁）",
              allowQuickAdd: true,
              items: [
                {
                  id: "ft-1",
                  title: "切断二号蒸汽主阀并疏散下层学徒",
                  detail: "阀门位于锅炉房东侧走廊尽头，需佩戴隔热手套。",
                  due: "3 回合内",
                  status: "in_progress",
                  assignee: "帷幕主持人",
                },
                {
                  id: "ft-2",
                  title: "回收实验台残存的黑火药配方手稿",
                  detail: "手稿右下角已被明火引燃，注意抢救未烧毁段落。",
                  due: "高危悬赏",
                  status: "open",
                },
              ],
            },
            {
              id: "f-gear",
              type: "resource_list",
              label: "随身抗火补给",
              allowQuickAdd: true,
              items: [
                { id: "fg-1", name: "寒霜灭火药剂", quantity: 3, unit: "瓶", status: "ok" },
                { id: "fg-2", name: "石棉隔热斗篷", quantity: 1, unit: "件", status: "low" },
              ],
            },
          ],
          x: 430,
          y: 40,
          w: 490,
          h: 620,
        },
      ],
      notes: [
        {
          refId: "burn_n1",
          title: "羊皮现场手记",
          body: "值班炼金术士在爆炸前留下的羊皮备忘：主冷却阀钥匙藏在北侧壁龛。",
          color: "#ead6b1",
          pinColor: "#b45309",
          x: 1020,
          y: 80,
          rotation: -5,
          scale: 1.1,
          effect: structuredClone(noteEffectPresets[1].effect),
          pinned: true,
        },
        {
          refId: "burn_n2",
          title: "烧焦的货运残单",
          body: "右下角已被烈火烧穿，残存字迹写着：第 4 批黑火药桶严禁靠近蒸汽管线。",
          color: "#f3e3bd",
          pinColor: "#dc2626",
          x: 1420,
          y: 280,
          rotation: 7,
          scale: 1.15,
          effect: structuredClone(noteEffectPresets[3].effect),
        },
      ],
      noteLinks: [
        { from: "burn_n1", to: "burn_n2", label: "起火原因追查" },
      ],
    }),
  },
  {
    id: "atomic_full_suite",
    label: "原子能力全套战术板（物资+委托+检查单）",
    tagline: "演示将原三大模块拆解为纯原子积木自由拼装与混搭",
    promptHint:
      "保留成员名册、事件钟和行动记录，并用原子积木拼装出物资清单面板、委托任务看板与带分类标签的检查清单面板",
    build: () => {
      const roster = ATOMIC_PANEL_TEMPLATES[0].create({ x: 40, y: 40 });
      const clock = ATOMIC_PANEL_TEMPLATES[1].create({ x: 40, y: 370 });
      const activity = ATOMIC_PANEL_TEMPLATES[2].create({ x: 40, y: 680 });
      const inv = ATOMIC_PANEL_TEMPLATES[3].create({ x: 450, y: 40 });
      const tasks = ATOMIC_PANEL_TEMPLATES[4].create({ x: 920, y: 40 });
      const chk = ATOMIC_PANEL_TEMPLATES[5].create({ x: 920, y: 590 });
      return {
        summary: "12 大原子能力全套展示板（名册+事件钟+记录+物资+委托+检查单）",
        assistantReply:
          "已由 12 类原子能力积木（`member_roster`、`event_clock`、`activity_feed`、`resource_list`、`task_board`、`checkbox_group` 等）拼装出全套展示板块，点击任意板块的编辑按钮均进入同一套 Apple HIG 编辑检查器。",
        modules: [
          { key: "inventory", visible: false },
          { key: "tasks", visible: false },
          { key: "safety", visible: false },
          { key: "shifts", visible: false },
          { key: "index", visible: false },
          { key: "activity", visible: false },
        ],
        customPanelsMode: "replace",
        customPanels: [roster, clock, activity, inv, tasks, chk],
      };
    },
  },
  {
    id: "tidy_layout",
    label: "一键规整防重叠排版",
    tagline: "保持三大核心板块与所有原子展板零碰撞对齐",
    promptHint: "帮我把当前可见的核心板块和所有原子展板重新整齐排列，消除重叠",
    build: () => {
      return {
        summary: "规整所有原子展示板块布局",
        assistantReply:
          "已将桌面上所有展示板块按栅格重新对齐，确保零重叠。",
        modules: [
          { key: "inventory", visible: false },
          { key: "tasks", visible: false },
          { key: "safety", visible: false },
          { key: "shifts", visible: false },
          { key: "index", visible: false },
          { key: "activity", visible: false },
        ],
      };
    },
  },
  {
    id: "tavern-wanted",
    label: "酒馆通缉悬赏与调查板",
    tagline: "通缉、检定、声望与传闻",
    promptHint: "创建酒馆通缉悬赏调查板，带肖像、快捷检定、势力声望和随机传闻表",
    build: (board) => synthesizeOfflineBlueprint("创建酒馆通缉悬赏调查板，带肖像、快捷检定、势力声望和随机传闻表", board),
  },
];

function inferRequestedCardOrNoteEffect(
  text: string,
  forNote: boolean,
): CardVisualEffect | null {
  if (forNote && /羊皮纸|古卷|旧纸|牛皮纸|vellum|parchment/i.test(text)) {
    return structuredClone(noteEffectPresets[1].effect);
  }
  if (forNote && /全息|投影|赛博|荧光|扫描线|hologram|holo/i.test(text)) {
    return structuredClone(noteEffectPresets[2].effect);
  }

  const topology: CardShaderTopology = /四周|周围|整圈|边缘|一圈/.test(text)
    ? "perimeter"
    : /底部|下边|下方|从下/.test(text)
      ? "bottom"
      : "corner";

  const origin: [number, number] = /左上/.test(text)
    ? [0.12, 0.88]
    : /左下/.test(text)
      ? [0.12, 0.12]
      : /右上/.test(text)
        ? [0.88, 0.88]
        : topology === "bottom"
          ? [0.5, 0.08]
          : [0.88, 0.1];

  const isHeavy = /严重|大片|半张|烧穿|焚毁|猛烈|重度/.test(text);
  const isSubtle = /轻微|一点|微弱|淡淡|焦边|烟熏/.test(text);
  const isCold = /死灰|熄灭|冷却|无火|旧焦|陈年/.test(text);

  if (/熔金|金焰|黑曜|黄金火|自定义\s*shader|生成.*shader/i.test(text)) {
    return normalizeCardVisualEffect({
      shader: "ai_glsl",
      shaderName: "AI 熔金黑曜灼痕",
      customGlsl: AI_GENERATED_MOLTEN_GOLD_GLSL,
      topology,
      origin,
      progress: isHeavy ? 0.44 : isSubtle ? 0.22 : 0.35,
      glowIntensity: isCold ? 0 : 2.4,
      spreadWidth: 0.24,
      noiseAmount: 0.45,
      seed: 23,
    });
  }

  if (/火|烧焦|灼烧|余烬|灰烬|烈焰|焦黑|炭化|烟熏|焚|burn|scorch|shader/i.test(text)) {
    const accentColor = /鬼火|绿火|幽绿/.test(text)
      ? "#34d399"
      : /紫火|紫焰|奥术/.test(text)
        ? "#a855f7"
        : /蓝火|冷焰|冰焰/.test(text)
          ? "#38bdf8"
          : null;
    return normalizeCardVisualEffect({
      shader: "burnt",
      topology,
      origin,
      progress: isHeavy ? 0.46 : isSubtle ? 0.2 : 0.35,
      glowIntensity: isCold ? 0 : 2.3,
      spreadWidth: 0.24,
      noiseAmount: 0.46,
      seed: 7,
      accentColor,
    });
  }

  return null;
}

function inferRequestedAmbientShader(text: string): BoardAmbientShader | null {
  if (/全息|网格|矩阵|赛博|霓虹|流光|雷达|holo|cyber/i.test(text)) {
    return normalizeBoardAmbientShader({
      shader: "hologram_grid",
      intensity: 1.2,
      speed: 1.1,
      primaryColor: "#081922",
      secondaryColor: "#2be4dc",
    });
  }
  if (/羊皮|星图|鎏金|古框|符文|古典|vellum/i.test(text)) {
    return normalizeBoardAmbientShader({
      shader: "ancient_vellum",
      intensity: 1.15,
      speed: 0.8,
      primaryColor: "#382817",
      secondaryColor: "#d4a644",
    });
  }
  if (/迷雾|深渊|幽冥|暗影|虚空|mist|abyss/i.test(text)) {
    return normalizeBoardAmbientShader({
      shader: "abyssal_mist",
      intensity: 1.2,
      speed: 1.0,
      primaryColor: "#0e1522",
      secondaryColor: "#6366f1",
    });
  }
  if (/火|烧焦|余烬|熔岩|焦木|烈焰|灰烬|burn|ember|shader/i.test(text)) {
    return normalizeBoardAmbientShader({
      shader: "ember_ash",
      intensity: 1.2,
      speed: 1.0,
      primaryColor: "#23130c",
      secondaryColor: "#f97316",
    });
  }
  return null;
}

export function synthesizeOfflineBlueprint(
  prompt: string,
  board: CampaignBoard,
): BoardHarnessBlueprint {
  const text = prompt.trim().toLowerCase();

  const targetsNote = /便签|便利贴|纸条|note/i.test(text);
  const targetsSurface = /背景|板面|底板|桌面|surface/i.test(text);
  const targetsFrame = /边框|外框|木框|画框|frame|border/i.test(text);

  const wantsClockStyle =
    /(?:时钟|表盘|计时器|辉光管|怀表|钟表)/.test(text) && !/事件钟/.test(text);
  const detectedCardOrNoteEffect = inferRequestedCardOrNoteEffect(
    text,
    targetsNote,
  );
  const detectedAmbient =
    targetsSurface || targetsFrame ? inferRequestedAmbientShader(text) : null;

  const wantsRosterBlock = /成员|名册|调查员|小队/.test(text);
  const wantsClockBlock = /事件钟|倒计时|进度钟/.test(text);
  const wantsActivityBlock = /工作记录|行动记录|日志/.test(text);
  const wantsResourceBlock = /物资|装备|背包|道具|补给|库存/.test(text);
  const wantsTaskBlock = /任务|委托|悬赏|通缉|赏金|告示|雇佣|抓捕|追捕|讨伐|目标|支线|主线|契约|行动报告/.test(text);
  const wantsWanted = /通缉|抓捕|追捕/.test(text);
  const wantsBounty = /赏金|悬赏|雇佣|契约|揭榜/.test(text);
  const wantsImage = /地图|平面图|图片|照片|立绘|肖像|头像/.test(text);
  const wantsDice = /检定|骰子宏|骰子公式|快捷.*骰|侦查.*按钮/.test(text);
  const wantsInitiative = /先攻|顺位|战斗顺序|轮次|回合轨/.test(text);
  const wantsRollTable = /随机表|遭遇表|传闻|疯狂症状/.test(text);
  const wantsMeter = /血条|\bhp\b|\bsan\b|生命|理智|压力格|法术位|声望|好感度|警报等级|计数/.test(text);
  const wantsChecklistBlock = /检查|核对|清单|勾选/.test(text);
  const wantsControlBlock =
    /选项块|分段|下拉框|下拉|开关|计数器|步进|交互面板|控制台|控制面板|(?:新建|新增|创建|添加|加一[块个张]|做一[块个张]).*(?:面板|展板|板块)/.test(
      text,
    );
  const wantsAnyAtomicPanel =
    wantsImage || wantsDice || wantsInitiative || wantsRollTable || wantsMeter ||
    wantsResourceBlock ||
    wantsTaskBlock ||
    wantsChecklistBlock ||
    wantsControlBlock ||
    (wantsControlBlock && (wantsRosterBlock || wantsClockBlock || wantsActivityBlock));

  const targetedExistingPanels = board.settings.customPanels.filter((p) => {
    if (wantsRosterBlock && p.blocks.some((b) => b.type === "member_roster")) return true;
    if (wantsClockBlock && p.blocks.some((b) => b.type === "event_clock")) return true;
    if (wantsActivityBlock && p.blocks.some((b) => b.type === "activity_feed")) return true;
    return false;
  });

  if (
    !wantsAnyAtomicPanel &&
    !detectedCardOrNoteEffect &&
    !detectedAmbient &&
    !targetsNote &&
    !wantsClockStyle &&
    !targetedExistingPanels.length
  ) {
    if (/全息|赛博/.test(text)) {
      return HARNESS_STARTER_RECIPES[0].build(board);
    }
    if (/熔炉|灾变/.test(text)) {
      return HARNESS_STARTER_RECIPES[1].build(board);
    }
    return HARNESS_STARTER_RECIPES[2].build(board);
  }

  const nextTokens = structuredClone(board.settings.styleTokens);
  let touchedTokens = false;

  if (detectedAmbient) {
    if (targetsSurface) {
      nextTokens.surfaceShader = structuredClone(detectedAmbient);
      touchedTokens = true;
    }
    if (targetsFrame) {
      nextTokens.frameShader = structuredClone(detectedAmbient);
      touchedTokens = true;
    }
  }

  const clockResult = wantsClockStyle
    ? synthesizeClockStyleFromPrompt(text)
    : null;
  if (clockResult) {
    nextTokens.clockAppearance = clockResult.appearance;
    touchedTokens = true;
  }

  const blueprint: BoardHarnessBlueprint = {
    summary:
      clockResult
        ? `AI 定制时钟样式：${clockResult.appearance.label || "定制时钟"}`
        : targetsSurface || targetsFrame
        ? "AI 修改公告板背景/边框与便签着色器"
        : targetsNote
          ? "AI 修改便签材质与 WebGL2 着色器"
          : detectedCardOrNoteEffect
            ? "应用 WebGL2 卡片燃烧着色器"
            : "由原子能力拼装交互展板",
    assistantReply: clockResult
      ? `${clockResult.reply} 确认应用后将同步给房间内所有成员，并已自动收入你的个人资产库。`
      : "已按你的指令生成 WebGL2 着色器与样式预览，确认应用后将同步写入房间。",
    ...(clockResult ? { clock: { style: clockResult.recommendedDial } } : {}),
  };

  if (targetsNote && detectedCardOrNoteEffect) {
    nextTokens.defaultNoteEffect = structuredClone(detectedCardOrNoteEffect);
    touchedTokens = true;
    const recColor =
      detectedCardOrNoteEffect.shader === "hologram"
        ? "#0b2530"
        : detectedCardOrNoteEffect.shader === "parchment"
          ? "#ead6b1"
          : undefined;
    const recPin =
      detectedCardOrNoteEffect.shader === "hologram"
        ? "#2be4dc"
        : detectedCardOrNoteEffect.shader === "parchment"
          ? "#8c5a2b"
          : undefined;
    if (board.notes.length > 0) {
      blueprint.noteUpdates = [
        {
          id: "*",
          ...(recColor ? { color: recColor } : {}),
          ...(recPin ? { pinColor: recPin } : {}),
          effect: detectedCardOrNoteEffect,
        },
      ];
    } else {
      blueprint.notes = [
        {
          title:
            detectedCardOrNoteEffect.shader === "hologram"
              ? "全息投影情报便签"
              : detectedCardOrNoteEffect.shader === "parchment"
                ? "古羊皮调查便签"
                : "烧焦残页便签",
          body: "点击此便签即可在统一编辑页内调整 RGB 色号、图钉色、旋转缩放与着色器参数。",
          color: recColor ?? "#f3e3bd",
          pinColor: recPin ?? "#dc2626",
          rotation: -3,
          scale: 1.1,
          effect: detectedCardOrNoteEffect,
        },
      ];
    }
  } else if (detectedCardOrNoteEffect && !targetsSurface && !targetsFrame) {
    if (targetedExistingPanels.length > 0) {
      blueprint.customPanels = targetedExistingPanels.map((p) => ({
        ...p,
        effect: detectedCardOrNoteEffect,
      }));
    } else if (!wantsAnyAtomicPanel) {
      nextTokens.defaultCardEffect = detectedCardOrNoteEffect;
      touchedTokens = true;
    }
  }

  if (touchedTokens) {
    blueprint.styleTokens = nextTokens;
  }

  if (wantsAnyAtomicPanel) {
    const assembledBlocks: NonNullable<
      NonNullable<BoardHarnessBlueprint["customPanels"]>[number]["blocks"]
    > = [];

    if (wantsControlBlock && (/选项块|分段|下拉|控制台|控制面板/.test(text) || (!wantsTaskBlock && !wantsImage && !wantsDice && !wantsInitiative && !wantsRollTable && !wantsMeter))) {
      assembledBlocks.push(
        {
          id: "ctrl-seg",
          type: "choice_selector",
          display: "segmented",
          label: "行动阶段选项",
          options: ["筹备侦查", "潜入执行", "正面交锋", "紧急撤离"],
          value: "潜入执行",
        },
        {
          id: "ctrl-sel",
          type: "choice_selector",
          display: "dropdown",
          label: "当前场景环境",
          options: ["标准能见度", "浓雾受限", "暴雨干扰", "高危封锁区"],
          value: "标准能见度",
        },
        {
          id: "ctrl-step",
          type: "meter_counter",
          variant: "stepper",
          label: "团队应急资源池",
          value: 5,
          min: 0,
          max: 10,
          step: 1,
          unit: "点",
          tone: "good",
        },
      );
    }

    if (wantsImage) assembledBlocks.push(createExtendedPanelBlock("image_media", "atom-media"));
    if (wantsDice) assembledBlocks.push(createExtendedPanelBlock("dice_macro", "atom-dice"));
    if (wantsInitiative) assembledBlocks.push(createExtendedPanelBlock("initiative_track", "atom-initiative"));
    if (wantsRollTable) assembledBlocks.push(createExtendedPanelBlock("roll_table", "atom-random"));
    if (wantsMeter) {
      const variant = /声望|好感度/.test(text) ? "bipolar" : /压力格|法术位/.test(text) ? "pips" : /血条|生命|理智|\bhp\b|\bsan\b/.test(text) ? "bar" : "stepper";
      const labels = /生命/.test(text) && /理智/.test(text) ? ["生命", "理智"] : [variant === "bipolar" ? "势力声望" : /理智|\bsan\b/.test(text) ? "理智" : /压力/.test(text) ? "压力" : "生命"];
      labels.forEach((label, index) => assembledBlocks.push({
        id: `atom-meter-${index}`, type: "meter_counter", label, variant,
        value: variant === "bipolar" ? 0 : label === "理智" ? 50 : 6,
        min: variant === "bipolar" ? -3 : 0, max: variant === "bipolar" ? 3 : label === "理智" ? 80 : 12,
        step: 1, color: label === "理智" ? "#326e87" : "#b24b37",
      }));
    }
    if (wantsRosterBlock && !wantsMeter) assembledBlocks.push({ id: "atom-roster", type: "member_roster", label: "在场成员", maxItems: 4, showRoleBadge: true });
    if (wantsClockBlock) assembledBlocks.push({ id: "atom-clock", type: "event_clock", name: "警戒推进", segments: 6, progress: 0, color: "#b24b37", consequence: "守卫封锁现场" });
    if (wantsActivityBlock) assembledBlocks.push({ id: "atom-activity", type: "activity_feed", label: "行动记录", maxItems: 5 });
    if (wantsTaskBlock) {
      assembledBlocks.push({
        id: "atom-tasks",
        type: "task_board",
        label: wantsWanted ? "港口通缉令" : wantsBounty ? "酒馆悬赏榜" : "委托与行动任务",
        variant: wantsWanted ? "wanted" : wantsBounty ? "bounty" : /调查目标/.test(text) ? "objective" : "quest",
        allowQuickAdd: true,
        items: [
          {
            id: "at-1",
            title: wantsWanted ? "黑帆走私头目" : "查明现场异常源头并带回物证",
            detail: wantsWanted ? "最后出现在北码头四号仓库，要求活捉。" : "走访夜班守卫并核对进港记录。",
            reward: "500 金币",
            badge: wantsWanted ? "活捉" : "主线",
            due: "优先委托",
            status: "open",
          },
          { id: "at-2", title: "寻找失踪的钟表师", detail: "收集旧灯塔附近的目击线索。", reward: "200 金币", badge: "秘密", status: "open" },
        ],
      });
    }

    if (wantsResourceBlock) {
      assembledBlocks.push({
        id: "atom-res",
        type: "resource_list",
        label: "可用物资与补给",
        allowQuickAdd: true,
        items: [
          { id: "ar-1", name: "应急照明提灯", quantity: 2, unit: "盏", status: "ok" },
          { id: "ar-2", name: "医疗急救包", quantity: 1, unit: "套", status: "low" },
        ],
      });
    }

    if (wantsChecklistBlock || assembledBlocks.length === 0) {
      assembledBlocks.push({
        id: "atom-chk",
        type: "checkbox_group",
        label: "行动检查清单",
        showProgress: true,
        allowQuickAdd: true,
        items: [
          { id: "ac-1", label: "确认入口与警戒分布", checked: true, tag: "侦查" },
          { id: "ac-2", label: "完成核心线索取证", checked: false, tag: "调查" },
        ],
      });
    }

    blueprint.customPanels = [
      {
        kind: "interactive",
        title: wantsTaskBlock && !wantsResourceBlock
          ? wantsWanted ? "港口通缉悬赏榜" : "委托与行动看板"
          : wantsResourceBlock && !wantsTaskBlock
            ? "可用物资与补给"
            : "战术原子组合展板",
        color: detectedCardOrNoteEffect ? "#8f2419" : "#2e5266",
        interactiveFor: "members",
        ...(detectedCardOrNoteEffect && !targetsNote
          ? { effect: detectedCardOrNoteEffect }
          : {}),
        blocks: assembledBlocks.slice(0, 12),
        x: 860,
        y: 50,
        w: 480,
        h: Math.min(760, 170 + assembledBlocks.length * 145),
      },
    ];
  }

  return blueprint;
}
