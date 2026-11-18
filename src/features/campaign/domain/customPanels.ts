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

export interface SegmentedBlock {
  id: string;
  type: "segmented";
  label: string;
  options: string[];
  value: string;
}

export interface SelectBlock {
  id: string;
  type: "select";
  label: string;
  options: string[];
  value: string;
}

export interface CheckboxItem {
  id: string;
  label: string;
  checked: boolean;
  /** 可选分类标签（分解原「行动检查清单」的分类归属能力）。 */
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

export interface StepperBlock {
  id: string;
  type: "stepper";
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  tone?: CustomPanelTone;
}

export type ResourceBlockStatus = "ok" | "low" | "out";

export interface ResourceBlockItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  status: ResourceBlockStatus;
}

/**
 * 新增原子能力：物资与库存状态积木（分解原「可用物资与设施」板块）。
 * 支持每个条目的数量步进（−/＋）、库存状态徽章流转（充足 / 紧缺 / 耗尽）以及面板内快速补录。
 */
export interface ResourceListBlock {
  id: string;
  type: "resource_list";
  label: string;
  allowQuickAdd?: boolean;
  items: ResourceBlockItem[];
}

export type TaskBlockStatus = "open" | "in_progress" | "completed";

export interface TaskBlockItem {
  id: string;
  title: string;
  detail?: string;
  assignee?: string;
  due?: string;
  status: TaskBlockStatus;
}

/**
 * 新增原子能力：委托与行动流转积木（分解原「委托与行动报告」板块）。
 * 支持认领署名、三态流转（待认领 → 进行中 → 已完成）以及面板内快速发布委托。
 */
export interface TaskBoardBlock {
  id: string;
  type: "task_board";
  label: string;
  allowQuickAdd?: boolean;
  items: TaskBlockItem[];
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
}

export type CustomPanelBlock =
  | SegmentedBlock
  | SelectBlock
  | CheckboxGroupBlock
  | ToggleBlock
  | StepperBlock
  | ResourceListBlock
  | TaskBoardBlock
  | KvListBlock
  | NoteTextBlock;

export type CustomPanelInteraction =
  | { type: "set_option"; value: string }
  | { type: "toggle_switch"; checked: boolean }
  | { type: "toggle_checkbox"; itemId: string }
  | { type: "add_checkbox_item"; label: string; tag?: string }
  | { type: "remove_checkbox_item"; itemId: string }
  | { type: "step_value"; delta: number }
  | { type: "step_resource_qty"; itemId: string; delta: number }
  | { type: "cycle_resource_status"; itemId: string }
  | { type: "add_resource_item"; name: string; quantity?: number; unit?: string }
  | { type: "remove_resource_item"; itemId: string }
  | { type: "advance_task_status"; itemId: string; actorName?: string }
  | { type: "add_task_item"; title: string; detail?: string; due?: string }
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

  if (type === "segmented" || type === "select") {
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
    return { id, type, label, options, value };
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
            const title = String(e.title ?? "").trim().slice(0, 64);
            if (!title) return null;
            const itemId =
              typeof e.id === "string" && e.id.trim()
                ? e.id.trim().slice(0, 48)
                : `${id}-t${idx + 1}`;
            const detail =
              typeof e.detail === "string" && e.detail.trim()
                ? e.detail.trim().slice(0, 160)
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
              status,
            };
          })
          .filter((x): x is TaskBlockItem => x !== null)
      : [];
    return {
      id,
      type: "task_board",
      label,
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

  if (type === "stepper") {
    const label = String(b.label ?? "").trim().slice(0, 40) || "数值追踪";
    const min = Number.isFinite(Number(b.min)) ? Math.round(Number(b.min)) : 0;
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
      type: "stepper",
      label,
      value,
      min,
      max,
      step,
      ...(unit ? { unit } : {}),
      ...(tone ? { tone } : {}),
    };
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
    snapValue(Number.isFinite(Number(raw.x)) ? Number(raw.x) : 860),
    EDGE,
    BOARD_WIDTH - w - EDGE,
  );
  const y = clamp(
    snapValue(Number.isFinite(Number(raw.y)) ? Number(raw.y) : 50),
    EDGE,
    BOARD_HEIGHT - h - EDGE,
  );

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

/** 纯函数状态转移：支持全部 9 类原子能力积木的直接操作。 */
export function applyPanelBlockInteraction(
  panel: BoardCustomPanel,
  blockId: string,
  interaction: CustomPanelInteraction,
): BoardCustomPanel {
  const blocks = panel.blocks.map((block): CustomPanelBlock => {
    if (block.id !== blockId) return block;

    if (
      (block.type === "segmented" || block.type === "select") &&
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

    if (block.type === "stepper" && interaction.type === "step_value") {
      const nextVal = clamp(
        block.value + interaction.delta * block.step,
        block.min,
        block.max,
      );
      return { ...block, value: nextVal };
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
        return {
          ...block,
          items: [
            ...block.items,
            {
              id: `${block.id}-${Date.now().toString(36)}`,
              title,
              ...(detail ? { detail } : {}),
              ...(due ? { due } : {}),
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
 * 原内置「物资与设施 / 任务委托 / 行动检查清单」三大板块的纯原子能力拼装模板。
 * 用户或 AI 编排官可一键实例化，也可与其他原子能力（选项块、步进条、开关等）自由混搭。
 */
export const ATOMIC_PANEL_TEMPLATES: ReadonlyArray<{
  id: "atomic_inventory" | "atomic_tasks" | "atomic_checklist";
  label: string;
  description: string;
  create: (coords?: { x: number; y: number }) => BoardCustomPanel;
}> = [
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
        x: coords?.x ?? 490,
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
        x: coords?.x ?? 950,
        y: coords?.y ?? 50,
        w: 470,
        h: 520,
        blocks: [
          {
            id: "task-priority",
            type: "segmented",
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
        x: coords?.x ?? 490,
        y: coords?.y ?? 650,
        w: 440,
        h: 460,
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
