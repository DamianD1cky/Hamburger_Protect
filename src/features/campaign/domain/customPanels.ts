import { BOARD_HEIGHT, BOARD_WIDTH } from "./boardGeometry.ts";
import { normalizeColor } from "./campaignSettings.ts";
import {
  normalizeCardVisualEffect,
  type CardVisualEffect,
} from "./cardEffects.ts";

export type CustomPanelKind = "interactive" | "markdown" | "kv_stats" | "callout";
export type CustomPanelTone = "neutral" | "good" | "warn" | "danger";
export type CustomPanelInteractiveRole = "gm" | "members";

export interface CustomPanelRow {
  label: string;
  value: string;
  tone?: CustomPanelTone;
}

export interface ChoiceSelectorBlock {
  id: string;
  type: "choice_selector";
  label: string;
  options: string[];
  value: string;
  display?: "auto" | "segmented" | "dropdown";
}

export interface CheckboxItem {
  id: string;
  label: string;
  checked: boolean;
  tag?: string;
}

export interface CheckboxGroupBlock {
  id: string;
  type: "checkbox_group";
  label: string;
  showProgress?: boolean;
  allowQuickAdd?: boolean;
  items: CheckboxItem[];
}

export interface ToggleBlock {
  id: string;
  type: "toggle";
  label: string;
  description?: string;
  checked: boolean;
}

export interface MeterCounterBlock {
  id: string;
  type: "meter_counter";
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  tone?: CustomPanelTone;
  color?: string;
  variant?: "stepper" | "bar" | "pips" | "bipolar";
}

export type ResourceBlockStatus = "ok" | "low" | "out";

export interface ResourceBlockItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  status: ResourceBlockStatus;
}

export interface ResourceListBlock {
  id: string;
  type: "resource_list";
  label: string;
  allowQuickAdd?: boolean;
  items: ResourceBlockItem[];
}

export type TaskBlockStatus = "open" | "in_progress" | "completed";
export type TaskBoardVariant = "quest" | "bounty" | "wanted" | "objective";
export const TASK_BOARD_STATUS_LABELS: Record<TaskBoardVariant, Record<TaskBlockStatus, string>> = {
  quest: { open: "待认领", in_progress: "执行中", completed: "已完成" },
  bounty: { open: "待揭榜", in_progress: "追讨中", completed: "已结赏" },
  wanted: { open: "通缉在逃", in_progress: "追捕中", completed: "已缉拿" },
  objective: { open: "未探明", in_progress: "调查中", completed: "已查明" },
};

export interface TaskBlockItem {
  id: string;
  title: string;
  detail?: string;
  assignee?: string;
  due?: string;
  status: TaskBlockStatus;
  reward?: string;
  badge?: string;
  imageUrl?: string | null;
}

export interface TaskBoardBlock {
  id: string;
  type: "task_board";
  label: string;
  variant?: TaskBoardVariant;
  allowQuickAdd?: boolean;
  items: TaskBlockItem[];
}

export interface ImageMediaBlock {
  id: string;
  type: "image_media";
  label: string;
  layout: "hero" | "grid" | "polaroid";
  images: Array<{ id: string; url: string; caption: string; aspect: "16:9" | "4:3" | "1:1" | "auto" }>;
}

export interface DiceMacroBlock {
  id: string;
  type: "dice_macro";
  label: string;
  macros: Array<{ id: string; name: string; notation: string; visibility?: "public" | "gm" | "self"; tone?: CustomPanelTone }>;
}

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  hpNote?: string;
  isNpc?: boolean;
  acted?: boolean;
}
export interface InitiativeTrackBlock {
  id: string;
  type: "initiative_track";
  label: string;
  round: number;
  activeIndex: number;
  entries: InitiativeEntry[];
}
export interface RollTableBlock {
  id: string;
  type: "roll_table";
  label: string;
  entries: Array<{ id: string; weight?: number; text: string; tag?: string }>;
  lastRolledId: string | null;
}

/**
 * 提炼自原内置「成员名册」板块的原子能力：实时展示房间在场成员并支持一键展开完整名册与角色管理。
 */
export interface MemberRosterBlock {
  id: string;
  type: "member_roster";
  label: string;
  maxItems: number;
  showRoleBadge: boolean;
}

/**
 * 提炼自原内置「事件钟」板块的原子能力：支持 2–24 格分段进度、统一 RGB 色号、直接加减推进及满格后果高亮。
 */
export interface EventClockBlock {
  id: string;
  type: "event_clock";
  name: string;
  segments: number;
  progress: number;
  color: string;
  consequence: string;
}

/**
 * 提炼自原内置「工作记录 / 行动记录」板块的原子能力：实时订阅房间最近操作流并支持展开完整历史记录。
 */
export interface ActivityFeedBlock {
  id: string;
  type: "activity_feed";
  label: string;
  maxItems: number;
}

export interface KvListBlock {
  id: string;
  type: "kv_list";
  label?: string;
  rows: CustomPanelRow[];
}

export interface NoteTextBlock {
  id: string;
  type: "note_text";
  heading?: string;
  text: string;
  emphasis?: "normal" | "callout";
  fontSize?: number;
}

export type CustomPanelBlock =
  | MemberRosterBlock
  | EventClockBlock
  | ActivityFeedBlock
  | ResourceListBlock
  | TaskBoardBlock
  | CheckboxGroupBlock
  | ChoiceSelectorBlock
  | ToggleBlock
  | MeterCounterBlock
  | ImageMediaBlock
  | DiceMacroBlock
  | InitiativeTrackBlock
  | RollTableBlock
  | KvListBlock
  | NoteTextBlock;

export type CustomPanelInteraction =
  | { type: "set_option"; value: string }
  | { type: "toggle_switch"; checked: boolean }
  | { type: "toggle_checkbox"; itemId: string }
  | { type: "add_checkbox_item"; label: string; tag?: string }
  | { type: "remove_checkbox_item"; itemId: string }
  | { type: "step_value"; delta: number }
  | { type: "set_value"; value: number }
  | { type: "sort_initiative" }
  | { type: "next_initiative" }
  | { type: "import_initiative_members"; entries: InitiativeEntry[] }
  | { type: "roll_table" }
  | { type: "step_event_clock"; delta: number }
  | { type: "step_resource_qty"; itemId: string; delta: number }
  | { type: "cycle_resource_status"; itemId: string }
  | { type: "add_resource_item"; name: string; quantity?: number; unit?: string }
  | { type: "remove_resource_item"; itemId: string }
  | { type: "advance_task_status"; itemId: string; actorName?: string }
  | { type: "add_task_item"; title: string; detail?: string; due?: string; reward?: string }
  | { type: "remove_task_item"; itemId: string };

export interface BoardCustomPanel {
  id: string;
  kind: CustomPanelKind;
  title: string;
  color: string;
  body: string;
  rows: CustomPanelRow[];
  blocks: CustomPanelBlock[];
  interactiveFor: CustomPanelInteractiveRole;
  effect: CardVisualEffect;
  fontSize?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CUSTOM_PANEL_LIMIT = 12;
export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 1400;
export const PANEL_MIN_HEIGHT = 170;
export const PANEL_MAX_HEIGHT = 1140;
const EDGE = 8;
const SNAP = 10;

const KINDS: readonly CustomPanelKind[] = [
  "interactive",
  "markdown",
  "kv_stats",
  "callout",
];
const TONES: readonly CustomPanelTone[] = ["neutral", "good", "warn", "danger"];
const RESOURCE_STATUSES: readonly ResourceBlockStatus[] = ["ok", "low", "out"];
const TASK_STATUSES: readonly TaskBlockStatus[] = [
  "open",
  "in_progress",
  "completed",
];

function snapValue(v: number) {
  return Math.round(v / SNAP) * SNAP;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function stripMarkdownSyntax(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .trim();
}

function normalizeRows(rawRows: unknown): CustomPanelRow[] {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .slice(0, 16)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as unknown as Record<string, unknown>;
      const label = String(row.label ?? "").trim().slice(0, 32);
      const value = String(row.value ?? "").trim().slice(0, 80);
      if (!label && !value) return null;
      const tone = TONES.includes(row.tone as CustomPanelTone)
        ? (row.tone as CustomPanelTone)
        : undefined;
      return tone
        ? { label: label || "指标", value, tone }
        : { label: label || "指标", value };
    })
    .filter((item): item is CustomPanelRow => item !== null);
}

export function normalizePanelImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return /^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,|\/(?!\/)|[0-9a-f-]{36}\/note-)/i.test(url)
    ? url.slice(0, url.startsWith("data:") ? 7_000_000 : 2000) : null;
}

export function createExtendedPanelBlock(type: "image_media" | "dice_macro" | "initiative_track" | "roll_table", id: string): CustomPanelBlock {
  if (type === "image_media") return { id, type, label: "港口调查地图", layout: "hero", images: [{
    id: `${id}-map`, caption: "港口与旧灯塔", aspect: "4:3",
    url: `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${encodeURIComponent("Detailed hand drawn 1920s harbor town investigation map on aged parchment, docks, warehouses, lighthouse, winding streets, top down cartographic view, sepia ink, realistic paper, no text, no labels")}&image_size=landscape_4_3`,
  }] };
  if (type === "dice_macro") return { id, type, label: "快捷检定", macros: [
    { id: `${id}-spot`, name: "侦查", notation: "1d100", visibility: "public" },
    { id: `${id}-san`, name: "理智", notation: "1d100", visibility: "self" },
    { id: `${id}-stealth`, name: "潜行", notation: "1d20+5", visibility: "gm" },
  ] };
  if (type === "initiative_track") return { id, type, label: "行动顺位", round: 1, activeIndex: 0, entries: [
    { id: `${id}-pc`, name: "调查员", initiative: 16, hpNote: "HP 12", isNpc: false },
    { id: `${id}-npc`, name: "码头守卫", initiative: 10, hpNote: "HP 8", isNpc: true },
  ] };
  return { id, type, label: "酒馆传闻", lastRolledId: null, entries: [
    { id: `${id}-1`, text: "旧灯塔昨夜亮起了蓝绿色的光。", weight: 2, tag: "灯塔" },
    { id: `${id}-2`, text: "失踪的钟表师最后出现在北码头。", weight: 1, tag: "人物" },
    { id: `${id}-3`, text: "四号仓库的夜班守卫突然辞职。", weight: 1, tag: "线索" },
  ] };
}

const textField = (raw: unknown, limit = 80) => typeof raw === "string" ? raw.trim().slice(0, limit) : "";
const finiteNumber = (raw: unknown, fallback: number) => Number.isFinite(Number(raw)) ? Number(raw) : fallback;
const childRecords = (raw: unknown, limit: number): Record<string, unknown>[] =>
  Array.isArray(raw) ? raw.slice(0, limit).filter((entry) => entry && typeof entry === "object") : [];

export function normalizeCustomPanelBlock(
  raw: unknown,
  fallbackIndex = 0,
): CustomPanelBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id =
    typeof b.id === "string" && b.id.trim()
      ? b.id.trim().slice(0, 48)
      : `blk-${fallbackIndex + 1}`;
  const type = String(b.type ?? "");

  if (type === "member_roster") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "在场成员";
    const maxItems = Number.isFinite(Number(b.maxItems))
      ? clamp(Math.round(Number(b.maxItems)), 1, 12)
      : 4;
    return {
      id,
      type: "member_roster",
      label,
      maxItems,
      showRoleBadge: b.showRoleBadge !== false,
    };
  }

  if (type === "event_clock") {
    const name = String(b.name ?? "").trim().slice(0, 60) || "局势推进事件钟";
    const segments = Number.isFinite(Number(b.segments))
      ? clamp(Math.round(Number(b.segments)), 2, 24)
      : 6;
    const progress = Number.isFinite(Number(b.progress))
      ? clamp(Math.round(Number(b.progress)), 0, segments)
      : 0;
    const color =
      typeof b.color === "string"
        ? normalizeColor(b.color) ?? "#b24b37"
        : "#b24b37";
    const consequence =
      String(b.consequence ?? "").trim().slice(0, 240) ||
      "格数填满时触发事态升级，由主持人裁定后果。";
    return {
      id,
      type: "event_clock",
      name,
      segments,
      progress,
      color,
      consequence,
    };
  }

  if (type === "activity_feed") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "最近工作记录";
    const maxItems = Number.isFinite(Number(b.maxItems))
      ? clamp(Math.round(Number(b.maxItems)), 1, 12)
      : 5;
    return {
      id,
      type: "activity_feed",
      label,
      maxItems,
    };
  }

  if (type === "choice_selector" || type === "segmented" || type === "select") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "状态选择";
    const rawOpts = Array.isArray(b.options)
      ? b.options
          .map((o) => String(o ?? "").trim().slice(0, 32))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const options = rawOpts.length >= 2 ? rawOpts : ["常规", "警戒", "危急"];
    const candidateVal = String(b.value ?? "").trim();
    const value = options.includes(candidateVal) ? candidateVal : options[0];
    const display = type === "segmented" ? "segmented" : type === "select" ? "dropdown"
      : b.display === "segmented" || b.display === "dropdown" ? b.display : "auto";
    return { id, type: "choice_selector", label, options, value, display };
  }

  if (type === "checkbox_group") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "核对清单";
    const items: CheckboxItem[] = Array.isArray(b.items)
      ? b.items
          .slice(0, 20)
          .map((entry, idx): CheckboxItem | null => {
            if (typeof entry === "string") {
              const txt = entry.trim().slice(0, 80);
              return txt
                ? { id: `${id}-i${idx + 1}`, label: txt, checked: false }
                : null;
            }
            if (!entry || typeof entry !== "object") return null;
            const e = entry as Record<string, unknown>;
            const txt = String(e.label ?? "").trim().slice(0, 80);
            if (!txt) return null;
            const itemId =
              typeof e.id === "string" && e.id.trim()
                ? e.id.trim().slice(0, 48)
                : `${id}-i${idx + 1}`;
            const tag =
              typeof e.tag === "string" && e.tag.trim()
                ? e.tag.trim().slice(0, 24)
                : undefined;
            return {
              id: itemId,
              label: txt,
              checked: Boolean(e.checked),
              ...(tag ? { tag } : {}),
            };
          })
          .filter((x): x is CheckboxItem => x !== null)
      : [];
    return {
      id,
      type: "checkbox_group",
      label,
      ...(typeof b.showProgress === "boolean"
        ? { showProgress: b.showProgress }
        : {}),
      ...(typeof b.allowQuickAdd === "boolean"
        ? { allowQuickAdd: b.allowQuickAdd }
        : {}),
      items,
    };
  }

  if (type === "resource_list") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "物资与补给";
    const items: ResourceBlockItem[] = Array.isArray(b.items)
      ? b.items
          .slice(0, 24)
          .map((entry, idx): ResourceBlockItem | null => {
            if (!entry || typeof entry !== "object") return null;
            const e = entry as Record<string, unknown>;
            const name = String(e.name ?? "").trim().slice(0, 48);
            if (!name) return null;
            const itemId =
              typeof e.id === "string" && e.id.trim()
                ? e.id.trim().slice(0, 48)
                : `${id}-r${idx + 1}`;
            const qtyNum = Number(e.quantity);
            const quantity = Number.isFinite(qtyNum)
              ? clamp(Math.round(qtyNum), 0, 9999)
              : 1;
            const unit =
              typeof e.unit === "string" && e.unit.trim()
                ? e.unit.trim().slice(0, 12)
                : undefined;
            const status: ResourceBlockStatus = RESOURCE_STATUSES.includes(
              e.status as ResourceBlockStatus,
            )
              ? (e.status as ResourceBlockStatus)
              : quantity === 0
                ? "out"
                : quantity <= 1
                  ? "low"
                  : "ok";
            return {
              id: itemId,
              name,
              quantity,
              ...(unit ? { unit } : {}),
              status,
            };
          })
          .filter((x): x is ResourceBlockItem => x !== null)
      : [];
    return {
      id,
      type: "resource_list",
      label,
      allowQuickAdd: b.allowQuickAdd !== false,
      items,
    };
  }

  if (type === "task_board") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "委托与任务";
    const items: TaskBlockItem[] = Array.isArray(b.items)
      ? b.items
          .slice(0, 20)
          .map((entry, idx): TaskBlockItem | null => {
            if (!entry || typeof entry !== "object") return null;
            const e = entry as Record<string, unknown>;
            const title = String(e.title ?? e.name ?? "").trim().slice(0, 64);
            if (!title) return null;
            const itemId =
              typeof e.id === "string" && e.id.trim()
                ? e.id.trim().slice(0, 48)
                : `${id}-t${idx + 1}`;
            const detail =
              typeof (e.detail ?? e.description) === "string"
                ? String(e.detail ?? e.description).trim().slice(0, 160)
                : undefined;
            const assignee =
              typeof e.assignee === "string" && e.assignee.trim()
                ? e.assignee.trim().slice(0, 32)
                : undefined;
            const due =
              typeof e.due === "string" && e.due.trim()
                ? e.due.trim().slice(0, 24)
                : undefined;
            const status: TaskBlockStatus = TASK_STATUSES.includes(
              e.status as TaskBlockStatus,
            )
              ? (e.status as TaskBlockStatus)
              : "open";
            return {
              id: itemId,
              title,
              ...(detail ? { detail } : {}),
              ...(assignee ? { assignee } : {}),
              ...(due ? { due } : {}),
              ...(textField(e.reward ?? e.bounty ?? e.prize) ? { reward: textField(e.reward ?? e.bounty ?? e.prize) } : {}),
              ...(textField(e.badge, 24) ? { badge: textField(e.badge, 24) } : {}),
              imageUrl: normalizePanelImageUrl(e.imageUrl),
              status,
            };
          })
          .filter((x): x is TaskBlockItem => x !== null)
      : [];
    return {
      id,
      type: "task_board",
      label,
      variant: (["quest", "bounty", "wanted", "objective"].includes(String(b.variant)) ? b.variant : "quest") as TaskBoardVariant,
      allowQuickAdd: b.allowQuickAdd !== false,
      items,
    };
  }

  if (type === "toggle") {
    const label = String(b.label ?? "").trim().slice(0, 48) || "状态开关";
    const description =
      typeof b.description === "string" && b.description.trim()
        ? b.description.trim().slice(0, 80)
        : undefined;
    return {
      id,
      type: "toggle",
      label,
      ...(description ? { description } : {}),
      checked: Boolean(b.checked),
    };
  }

  if (type === "meter_counter" || type === "stepper") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "数值追踪";
    const min = clamp(Math.round(finiteNumber(b.min, 0)), -9999, 9998);
    const maxRaw = Number.isFinite(Number(b.max)) ? Math.round(Number(b.max)) : 10;
    const max = Math.max(min + 1, Math.min(9999, maxRaw));
    const step = Math.max(
      1,
      Math.min(100, Number.isFinite(Number(b.step)) ? Math.round(Number(b.step)) : 1),
    );
    const value = clamp(
      Number.isFinite(Number(b.value)) ? Math.round(Number(b.value)) : min,
      min,
      max,
    );
    const unit =
      typeof b.unit === "string" && b.unit.trim()
        ? b.unit.trim().slice(0, 12)
        : undefined;
    const tone = TONES.includes(b.tone as CustomPanelTone)
      ? (b.tone as CustomPanelTone)
      : undefined;
    return {
      id,
      type: "meter_counter",
      label,
      value,
      min,
      max,
      step,
      ...(unit ? { unit } : {}),
      ...(tone ? { tone } : {}),
      color: normalizeColor(typeof b.color === "string" ? b.color : null) ?? "#b24b37",
      variant: (["stepper", "bar", "pips", "bipolar"].includes(String(b.variant)) ? b.variant : "stepper") as MeterCounterBlock["variant"],
    };
  }

  if (type === "image_media") {
    return {
      id, type, label: textField(b.label, 40) || "图片与地图",
      layout: b.layout === "grid" || b.layout === "polaroid" ? b.layout : "hero",
      images: childRecords(b.images, 9).flatMap((entry, index) => {
        const url = normalizePanelImageUrl(entry.url);
        return url ? [{
          id: textField(entry.id, 48) || `${id}-img${index + 1}`, url,
          caption: textField(entry.caption, 120),
          aspect: (["16:9", "4:3", "1:1"].includes(String(entry.aspect)) ? entry.aspect : "auto") as ImageMediaBlock["images"][number]["aspect"],
        }] : [];
      }),
    };
  }
  if (type === "dice_macro") {
    return {
      id, type, label: textField(b.label, 40) || "快捷检定",
      macros: childRecords(b.macros, 12).flatMap((entry, index) => {
        const notation = textField(entry.notation, 120);
        return notation ? [{
          id: textField(entry.id, 48) || `${id}-d${index + 1}`,
          name: textField(entry.name, 40) || notation, notation,
          visibility: (entry.visibility === "gm" || entry.visibility === "self" ? entry.visibility : "public") as "public" | "gm" | "self",
          tone: TONES.includes(entry.tone as CustomPanelTone) ? entry.tone as CustomPanelTone : "neutral",
        }] : [];
      }),
    };
  }
  if (type === "initiative_track") {
    const entries: InitiativeEntry[] = childRecords(b.entries, 30).flatMap((entry, index) => {
      const name = textField(entry.name, 48);
      return name ? [{
        id: textField(entry.id, 48) || `${id}-a${index + 1}`, name,
        initiative: clamp(Math.round(finiteNumber(entry.initiative, 0)), -999, 999),
        hpNote: textField(entry.hpNote, 40), isNpc: Boolean(entry.isNpc), acted: Boolean(entry.acted),
      }] : [];
    });
    return {
      id, type, label: textField(b.label, 40) || "先攻顺位",
      round: clamp(Math.round(finiteNumber(b.round, 1)), 1, 9999),
      activeIndex: clamp(Math.round(finiteNumber(b.activeIndex, 0)), 0, Math.max(0, entries.length - 1)), entries,
    };
  }
  if (type === "roll_table") {
    const entries = childRecords(b.entries, 50).flatMap((entry, index) => {
      const text = textField(entry.text, 400);
      return text ? [{ id: textField(entry.id, 48) || `${id}-rt${index + 1}`, text,
        weight: clamp(Math.round(finiteNumber(entry.weight, 1)), 1, 1000), tag: textField(entry.tag, 24) }] : [];
    });
    return { id, type, label: textField(b.label, 40) || "随机表", entries,
      lastRolledId: entries.some((entry) => entry.id === b.lastRolledId) ? String(b.lastRolledId) : null };
  }

  if (type === "kv_list") {
    const label =
      typeof b.label === "string" && b.label.trim()
        ? b.label.trim().slice(0, 40)
        : undefined;
    const rows = normalizeRows(b.rows);
    return { id, type: "kv_list", ...(label ? { label } : {}), rows };
  }

  if (type === "note_text") {
    const heading =
      typeof b.heading === "string" && b.heading.trim()
        ? stripMarkdownSyntax(b.heading).slice(0, 60)
        : undefined;
    const text = stripMarkdownSyntax(String(b.text ?? "")).slice(0, 800);
    if (!heading && !text) return null;
    const emphasis = b.emphasis === "callout" ? "callout" : "normal";
    return {
      id,
      type: "note_text",
      ...(heading ? { heading } : {}),
      text,
      emphasis,
      ...(b.fontSize != null ? { fontSize: clamp(Math.round(finiteNumber(b.fontSize, 15)), 12, 28) } : {}),
    };
  }

  return null;
}

function migrateLegacyToBlocks(
  kind: CustomPanelKind,
  body: string,
  rows: CustomPanelRow[],
): CustomPanelBlock[] {
  const blocks: CustomPanelBlock[] = [];
  if (body.trim()) {
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    let heading: string | undefined;
    const bulletItems: string[] = [];
    const textLines: string[] = [];

    for (const line of lines) {
      if (!heading && /^#+\s+/.test(line)) {
        heading = stripMarkdownSyntax(line).slice(0, 60);
      } else if (/^[-*]\s+/.test(line)) {
        bulletItems.push(stripMarkdownSyntax(line.replace(/^[-*]\s+/, "")));
      } else {
        textLines.push(stripMarkdownSyntax(line));
      }
    }

    if (heading || textLines.length) {
      blocks.push({
        id: "legacy-note",
        type: "note_text",
        ...(heading ? { heading } : {}),
        text: textLines.join("\n"),
        emphasis: kind === "callout" ? "callout" : "normal",
      });
    }
    if (bulletItems.length) {
      blocks.push({
        id: "legacy-checks",
        type: "checkbox_group",
        label: heading && !textLines.length ? heading : "要点核对",
        items: bulletItems.slice(0, 12).map((txt, idx) => ({
          id: `legacy-chk-${idx + 1}`,
          label: txt.slice(0, 80),
          checked: false,
        })),
      });
    }
  }
  if (rows.length) {
    blocks.push({
      id: "legacy-kv",
      type: "kv_list",
      rows,
    });
  }
  return blocks;
}

export function normalizeCustomPanel(
  raw: Partial<BoardCustomPanel> & { id?: string },
): BoardCustomPanel {
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().slice(0, 64)
      : `panel-${crypto.randomUUID().slice(0, 8)}`;
  const kind = KINDS.includes(raw.kind as CustomPanelKind)
    ? (raw.kind as CustomPanelKind)
    : "interactive";
  const title =
    (typeof raw.title === "string" ? raw.title.trim() : "").slice(0, 40) ||
    "自定义面板";
  const color = normalizeColor(raw.color) ?? "#35536b";
  const body =
    typeof raw.body === "string" ? raw.body.trim().slice(0, 2000) : "";
  const rows = normalizeRows(raw.rows);
  const interactiveFor: CustomPanelInteractiveRole =
    raw.interactiveFor === "gm" ? "gm" : "members";
  const effect = normalizeCardVisualEffect(raw.effect);

  let blocks: CustomPanelBlock[] = Array.isArray(raw.blocks)
    ? raw.blocks
        .slice(0, 12)
        .map((item, idx) => normalizeCustomPanelBlock(item, idx))
        .filter((x): x is CustomPanelBlock => x !== null)
    : [];

  if (!blocks.length && (body || rows.length)) {
    blocks = migrateLegacyToBlocks(kind, body, rows);
  }

  const w = clamp(
    snapValue(Number.isFinite(Number(raw.w)) ? Number(raw.w) : 420),
    PANEL_MIN_WIDTH,
    PANEL_MAX_WIDTH,
  );
  const h = clamp(
    snapValue(Number.isFinite(Number(raw.h)) ? Number(raw.h) : 320),
    PANEL_MIN_HEIGHT,
    PANEL_MAX_HEIGHT,
  );
  const x = clamp(
    snapValue(Number.isFinite(Number(raw.x)) ? Number(raw.x) : 880),
    EDGE,
    BOARD_WIDTH - w - EDGE,
  );
  const y = clamp(
    snapValue(Number.isFinite(Number(raw.y)) ? Number(raw.y) : 50),
    EDGE,
    BOARD_HEIGHT - h - EDGE,
  );

  const fontSizeRaw = Number(raw.fontSize);
  const fontSize = Number.isFinite(fontSizeRaw)
    ? Math.max(11, Math.min(24, Math.round(fontSizeRaw)))
    : undefined;

  return {
    id,
    kind,
    title,
    color,
    body,
    rows,
    blocks,
    interactiveFor,
    effect,
    ...(fontSize ? { fontSize } : {}),
    x,
    y,
    w,
    h,
  };
}

export function normalizeCustomPanels(raw: unknown): BoardCustomPanel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: BoardCustomPanel[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const panel = normalizeCustomPanel(entry as Partial<BoardCustomPanel>);
    if (seen.has(panel.id)) continue;
    seen.add(panel.id);
    result.push(panel);
    if (result.length >= CUSTOM_PANEL_LIMIT) break;
  }
  return result;
}

/** 随机源可注入；在线模式由服务器决定抽取结果。 */
export function applyPanelBlockInteraction(
  panel: BoardCustomPanel,
  blockId: string,
  interaction: CustomPanelInteraction,
  random: () => number = Math.random,
): BoardCustomPanel {
  const blocks = panel.blocks.map((block): CustomPanelBlock => {
    if (block.id !== blockId) return block;

    if (
      block.type === "event_clock" &&
      interaction.type === "step_event_clock"
    ) {
      return {
        ...block,
        progress: clamp(block.progress + interaction.delta, 0, block.segments),
      };
    }

    if (
      block.type === "choice_selector" &&
      interaction.type === "set_option"
    ) {
      if (!block.options.includes(interaction.value)) return block;
      return { ...block, value: interaction.value };
    }

    if (block.type === "toggle" && interaction.type === "toggle_switch") {
      return { ...block, checked: interaction.checked };
    }

    if (block.type === "checkbox_group") {
      if (interaction.type === "toggle_checkbox") {
        return {
          ...block,
          items: block.items.map((item) =>
            item.id === interaction.itemId
              ? { ...item, checked: !item.checked }
              : item,
          ),
        };
      }
      if (interaction.type === "add_checkbox_item") {
        const label = interaction.label.trim().slice(0, 80);
        if (!label || block.items.length >= 20) return block;
        const tag = interaction.tag?.trim().slice(0, 24);
        return {
          ...block,
          items: [
            ...block.items,
            {
              id: `${block.id}-${Date.now().toString(36)}`,
              label,
              checked: false,
              ...(tag ? { tag } : {}),
            },
          ],
        };
      }
      if (interaction.type === "remove_checkbox_item") {
        return {
          ...block,
          items: block.items.filter((item) => item.id !== interaction.itemId),
        };
      }
    }

    if (block.type === "meter_counter" && interaction.type === "set_value") {
      if (!Number.isFinite(interaction.value)) return block;
      return { ...block, value: clamp(block.min + Math.round((interaction.value - block.min) / block.step) * block.step, block.min, block.max) };
    }
    if (block.type === "meter_counter" && interaction.type === "step_value") {
      const nextVal = clamp(
        block.value + interaction.delta * block.step,
        block.min,
        block.max,
      );
      return { ...block, value: nextVal };
    }

    if (block.type === "initiative_track") {
      if (interaction.type === "sort_initiative") {
        const activeId = block.entries[block.activeIndex]?.id;
        const entries = [...block.entries].sort((a, b) => b.initiative - a.initiative);
        return { ...block, entries, activeIndex: Math.max(0, entries.findIndex((entry) => entry.id === activeId)) };
      }
      if (interaction.type === "next_initiative" && block.entries.length) {
        const nextIndex = (block.activeIndex + 1) % block.entries.length;
        return { ...block, activeIndex: nextIndex, round: nextIndex === 0 ? Math.min(9999, block.round + 1) : block.round,
          entries: block.entries.map((entry, index) => ({ ...entry, acted: nextIndex === 0 ? false : index <= block.activeIndex ? true : Boolean(entry.acted) })) };
      }
      if (interaction.type === "import_initiative_members") {
        const existing = new Set(block.entries.map((entry) => entry.id));
        const imported = interaction.entries.filter((entry) => !existing.has(entry.id));
        return normalizeCustomPanelBlock({ ...block, entries: [...block.entries, ...imported] }) ?? block;
      }
    }
    if (block.type === "roll_table" && interaction.type === "roll_table" && block.entries.length) {
      const total = block.entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
      let target = clamp(random(), 0, 1 - Number.EPSILON) * total;
      const winner = block.entries.find((entry) => { target -= entry.weight ?? 1; return target < 0; });
      return { ...block, lastRolledId: (winner ?? block.entries[block.entries.length - 1]).id };
    }

    if (block.type === "resource_list") {
      if (interaction.type === "step_resource_qty") {
        return {
          ...block,
          items: block.items.map((item) => {
            if (item.id !== interaction.itemId) return item;
            const quantity = clamp(item.quantity + interaction.delta, 0, 9999);
            const status: ResourceBlockStatus =
              quantity === 0 ? "out" : quantity <= 1 ? "low" : "ok";
            return { ...item, quantity, status };
          }),
        };
      }
      if (interaction.type === "cycle_resource_status") {
        const nextStatusMap: Record<ResourceBlockStatus, ResourceBlockStatus> = {
          ok: "low",
          low: "out",
          out: "ok",
        };
        return {
          ...block,
          items: block.items.map((item) =>
            item.id === interaction.itemId
              ? { ...item, status: nextStatusMap[item.status] }
              : item,
          ),
        };
      }
      if (interaction.type === "add_resource_item") {
        const name = interaction.name.trim().slice(0, 48);
        if (!name || block.items.length >= 24) return block;
        const quantity = clamp(Math.round(interaction.quantity ?? 1), 0, 9999);
        const unit = interaction.unit?.trim().slice(0, 12);
        return {
          ...block,
          items: [
            ...block.items,
            {
              id: `${block.id}-${Date.now().toString(36)}`,
              name,
              quantity,
              ...(unit ? { unit } : {}),
              status: quantity === 0 ? "out" : quantity <= 1 ? "low" : "ok",
            },
          ],
        };
      }
      if (interaction.type === "remove_resource_item") {
        return {
          ...block,
          items: block.items.filter((item) => item.id !== interaction.itemId),
        };
      }
    }

    if (block.type === "task_board") {
      if (interaction.type === "advance_task_status") {
        const nextTaskStatus: Record<TaskBlockStatus, TaskBlockStatus> = {
          open: "in_progress",
          in_progress: "completed",
          completed: "open",
        };
        return {
          ...block,
          items: block.items.map((item) => {
            if (item.id !== interaction.itemId) return item;
            const status = nextTaskStatus[item.status];
            const assignee =
              status === "in_progress" && !item.assignee && interaction.actorName
                ? interaction.actorName.slice(0, 32)
                : status === "open"
                  ? undefined
                  : item.assignee;
            return {
              ...item,
              status,
              ...(assignee ? { assignee } : { assignee: undefined }),
            };
          }),
        };
      }
      if (interaction.type === "add_task_item") {
        const title = interaction.title.trim().slice(0, 64);
        if (!title || block.items.length >= 20) return block;
        const detail = interaction.detail?.trim().slice(0, 160);
        const due = interaction.due?.trim().slice(0, 24);
        const reward = interaction.reward?.trim().slice(0, 80);
        return {
          ...block,
          items: [
            ...block.items,
            {
              id: `${block.id}-${Date.now().toString(36)}`,
              title,
              ...(detail ? { detail } : {}),
              ...(due ? { due } : {}),
              ...(reward ? { reward } : {}),
              status: "open",
            },
          ],
        };
      }
      if (interaction.type === "remove_task_item") {
        return {
          ...block,
          items: block.items.filter((item) => item.id !== interaction.itemId),
        };
      }
    }

    return block;
  });

  return { ...panel, blocks };
}

/**
 * 初始桌面默认搭载的三大核心原子展板（成员名册、事件钟、工作记录）：
 * 全部由对应原子能力积木组成，统一复用同一套展板编辑器与 Shader 体系。
 */
export function createInitialCorePanels(): BoardCustomPanel[] {
  return [
    normalizeCustomPanel({
      id: "core-panel-roster",
      kind: "interactive",
      title: "成员名册",
      color: "#254e70",
      interactiveFor: "gm",
      x: 50,
      y: 50,
      w: 380,
      h: 300,
      blocks: [
        {
          id: "core-blk-roster",
          type: "member_roster",
          label: "在场成员",
          maxItems: 4,
          showRoleBadge: true,
        },
      ],
    }),
    normalizeCustomPanel({
      id: "core-panel-clock",
      kind: "interactive",
      title: "事件钟",
      color: "#8c4a27",
      interactiveFor: "gm",
      x: 460,
      y: 50,
      w: 380,
      h: 280,
      blocks: [
        {
          id: "core-blk-clock",
          type: "event_clock",
          name: "调查局势推进",
          segments: 6,
          progress: 0,
          color: "#b24b37",
          consequence: "进度填满时触发关键局势变化，由主持人裁定后果。",
        },
      ],
    }),
    normalizeCustomPanel({
      id: "core-panel-activity",
      kind: "interactive",
      title: "工作记录",
      color: "#b8862b",
      interactiveFor: "gm",
      x: 50,
      y: 380,
      w: 380,
      h: 380,
      blocks: [
        {
          id: "core-blk-activity",
          type: "activity_feed",
          label: "最近操作动态",
          maxItems: 5,
        },
      ],
    }),
  ];
}

export const ATOMIC_PANEL_TEMPLATES: ReadonlyArray<{
  id:
    | "atomic_roster"
    | "atomic_clock"
    | "atomic_activity"
    | "atomic_inventory"
    | "atomic_tasks"
    | "atomic_checklist";
  label: string;
  description: string;
  create: (coords?: { x: number; y: number }) => BoardCustomPanel;
}> = [
  {
    id: "atomic_roster",
    label: "成员名册（原子拼装）",
    description: "由「成员名册积木 member_roster」组成，实时展示在场成员并可追加状态块",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "成员名册",
        color: "#254e70",
        interactiveFor: "gm",
        x: coords?.x ?? 50,
        y: coords?.y ?? 50,
        w: 380,
        h: 300,
        blocks: [
          {
            id: "tpl-roster",
            type: "member_roster",
            label: "在场成员",
            maxItems: 4,
            showRoleBadge: true,
          },
        ],
      }),
  },
  {
    id: "atomic_clock",
    label: "事件钟（原子拼装）",
    description: "由「事件钟积木 event_clock」组成，支持多格推进与后果高亮",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "事件钟",
        color: "#8c4a27",
        interactiveFor: "gm",
        x: coords?.x ?? 460,
        y: coords?.y ?? 50,
        w: 380,
        h: 280,
        blocks: [
          {
            id: "tpl-clock",
            type: "event_clock",
            name: "局势推进事件钟",
            segments: 6,
            progress: 0,
            color: "#b24b37",
            consequence: "进度填满时触发关键局势变化，由主持人裁定后果。",
          },
        ],
      }),
  },
  {
    id: "atomic_activity",
    label: "工作记录（原子拼装）",
    description: "由「工作记录流积木 activity_feed」组成，实时追踪房间动态",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "工作记录",
        color: "#b8862b",
        interactiveFor: "gm",
        x: coords?.x ?? 50,
        y: coords?.y ?? 380,
        w: 380,
        h: 380,
        blocks: [
          {
            id: "tpl-activity",
            type: "activity_feed",
            label: "最近操作动态",
            maxItems: 5,
          },
        ],
      }),
  },
  {
    id: "atomic_inventory",
    label: "可用物资与设施（原子拼装）",
    description: "由 3 组「物资库存积木 resource_list」拼装：装备补给、线索道具、设施资产",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "可用物资与设施",
        color: "#8f2929",
        interactiveFor: "members",
        x: coords?.x ?? 870,
        y: coords?.y ?? 50,
        w: 440,
        h: 580,
        blocks: [
          {
            id: "inv-gear",
            type: "resource_list",
            label: "装备与补给",
            allowQuickAdd: true,
            items: [
              { id: "g-1", name: "提灯与煤油", quantity: 3, unit: "罐", status: "ok" },
              { id: "g-2", name: "急救绷带包", quantity: 1, unit: "套", status: "low" },
            ],
          },
          {
            id: "inv-clues",
            type: "resource_list",
            label: "线索与道具",
            allowQuickAdd: true,
            items: [
              { id: "c-1", name: "黄铜栈桥钥匙", quantity: 1, unit: "枚", status: "ok" },
            ],
          },
          {
            id: "inv-assets",
            type: "resource_list",
            label: "设施与资产",
            allowQuickAdd: true,
            items: [
              { id: "a-1", name: "旧港区安全屋", quantity: 1, unit: "处", status: "ok" },
            ],
          },
        ],
      }),
  },
  {
    id: "atomic_tasks",
    label: "委托与行动报告（原子拼装）",
    description: "由「委托流转积木 task_board」+「分段状态器 segmented」自由拼装",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "委托与行动报告",
        color: "#9e3329",
        interactiveFor: "members",
        x: coords?.x ?? 870,
        y: coords?.y ?? 50,
        w: 470,
        h: 520,
        blocks: [
          {
            id: "task-priority",
            type: "choice_selector",
            label: "小队当前重心",
            options: ["外围调查", "潜入取证", "正面对抗"],
            value: "外围调查",
          },
          {
            id: "task-main-board",
            type: "task_board",
            label: "悬赏与委托栏",
            allowQuickAdd: true,
            items: [
              {
                id: "q-1",
                title: "查明北码头 4 号仓夜间异响",
                detail: "走访守夜人并核对近三日进港货单。",
                due: "今夜子时前",
                status: "open",
              },
              {
                id: "q-2",
                title: "破译密封铁盒上的纹章",
                detail: "前往图书馆特藏室查阅旧港志。",
                assignee: "帷幕主持人",
                status: "in_progress",
              },
            ],
          },
        ],
      }),
  },
  {
    id: "atomic_checklist",
    label: "行动检查清单（原子拼装）",
    description: "由带分类标签、进度统计条与快速追加的「核对清单积木 checkbox_group」拼装",
    create: (coords) =>
      normalizeCustomPanel({
        kind: "interactive",
        title: "行动检查清单",
        color: "#2e6b47",
        interactiveFor: "members",
        x: coords?.x ?? 460,
        y: coords?.y ?? 360,
        w: 440,
        h: 440,
        blocks: [
          {
            id: "chk-ops",
            type: "checkbox_group",
            label: "出发前安全与战备核查",
            showProgress: true,
            allowQuickAdd: true,
            items: [
              { id: "s-1", label: "校对全员联络暗号与撤离路线", checked: true, tag: "战术" },
              { id: "s-2", label: "分发照明器材与备用干粮", checked: false, tag: "补给" },
              { id: "s-3", label: "销毁据点遗留的敏感文书", checked: false, tag: "保密" },
            ],
          },
        ],
      }),
  },
];
