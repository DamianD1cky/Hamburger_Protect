import { BOARD_HEIGHT, BOARD_WIDTH } from "./boardGeometry.ts";
import {
  defaultCardVisualEffect,
  normalizeCardVisualEffect,
  type CardVisualEffect,
} from "./cardEffects.ts";
export { BOARD_HEIGHT, BOARD_WIDTH } from "./boardGeometry.ts";

/**
 * 公告板模块几何与空间防碰撞定义。
 *
 * 每个内置区块以及自定义面板都位于 2144×1206 的固定世界坐标系中，
 * 支持按 10px 网格吸附移动与宽高缩放，并在落点重叠时自动寻找就近合法空位。
 */
export type BoardModuleKey =
  | "inventory"
  | "tasks"
  | "shifts"
  | "index"
  | "activity"
  | "safety";

export interface BoardModuleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardModuleLayoutEntry {
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** 单模块独立视觉装饰覆盖（荒草、烧焦火焰、寒霜、蛛网、蜡封等）；未设置时跟随全局默认。 */
  effect?: CardVisualEffect | null;
}

export type BoardModuleLayout = Partial<
  Record<BoardModuleKey, BoardModuleLayoutEntry>
>;

/** 拖拽与缩放统一吸附到 10px 栅格。 */
export const SNAP_GRID = 10;

/** 画布四周安全内边距。 */
export const BOARD_EDGE_MARGIN = 8;
const EDGE = BOARD_EDGE_MARGIN;

export const MODULE_MIN_WIDTH = 280;
export const MODULE_MAX_WIDTH = 1400;
export const MODULE_MIN_HEIGHT = 180;
export const MODULE_MAX_HEIGHT = 1140;

export const boardModules: Record<
  BoardModuleKey,
  {
    label: string;
    rect: BoardModuleRect;
    minW: number;
    minH: number;
  }
> = {
  inventory: {
    label: "物资",
    rect: { x: 42, y: 48, w: 410, h: 751 },
    minW: 320,
    minH: 320,
  },
  tasks: {
    label: "任务委托",
    rect: { x: 491, y: 48, w: 564, h: 525 },
    minW: 360,
    minH: 280,
  },
  shifts: {
    label: "成员名册",
    rect: { x: 1081, y: 50, w: 340, h: 291 },
    minW: 280,
    minH: 190,
  },
  index: {
    label: "事件钟",
    rect: { x: 1081, y: 357, w: 340, h: 221 },
    minW: 280,
    minH: 200,
  },
  activity: {
    label: "行动记录",
    rect: { x: 58, y: 802, w: 395, h: 350 },
    minW: 300,
    minH: 210,
  },
  safety: {
    label: "检查清单",
    rect: { x: 545, y: 578, w: 540, h: 575 },
    minW: 320,
    minH: 240,
  },
};

export const boardModuleKeys = Object.keys(boardModules) as BoardModuleKey[];

export function snap(value: number) {
  return Math.round(value / SNAP_GRID) * SNAP_GRID;
}

export function clampModuleSize(
  key: BoardModuleKey,
  w: number | undefined,
  h: number | undefined,
) {
  const def = boardModules[key];
  const nextW =
    w !== undefined && Number.isFinite(Number(w))
      ? Math.min(Math.max(snap(Number(w)), def.minW), MODULE_MAX_WIDTH)
      : def.rect.w;
  const nextH =
    h !== undefined && Number.isFinite(Number(h))
      ? Math.min(Math.max(snap(Number(h)), def.minH), MODULE_MAX_HEIGHT)
      : def.rect.h;
  return { w: nextW, h: nextH };
}

/** 把坐标限制在画布安全边界内。 */
export function clampToBoard(x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(Math.max(x, EDGE), Math.max(EDGE, BOARD_WIDTH - w - EDGE)),
    y: Math.min(Math.max(y, EDGE), Math.max(EDGE, BOARD_HEIGHT - h - EDGE)),
  };
}

/** 取出某个模块当前的几何框：自定义坐标与尺寸优先，缺省回退默认定义。 */
export function moduleRect(
  key: BoardModuleKey,
  layout: BoardModuleLayout | null | undefined,
): BoardModuleRect {
  const base = boardModules[key].rect;
  const custom = layout?.[key];
  if (!custom) return base;
  const x = Number(custom.x);
  const y = Number(custom.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return base;
  const size = clampModuleSize(key, custom.w, custom.h);
  const clamped = clampToBoard(x, y, size.w, size.h);
  return { x: clamped.x, y: clamped.y, w: size.w, h: size.h };
}

/** 解析某个模块的最终卡片装饰效果：模块独立覆盖优先，否则回退全局默认。 */
export function resolveModuleCardEffect(
  key: BoardModuleKey,
  layout: BoardModuleLayout | null | undefined,
  boardDefault?: CardVisualEffect | null,
): CardVisualEffect {
  const customEffect = layout?.[key]?.effect;
  if (customEffect) return normalizeCardVisualEffect(customEffect);
  if (boardDefault) return normalizeCardVisualEffect(boardDefault);
  return defaultCardVisualEffect();
}

export function rectsOverlap(a: BoardModuleRect, b: BoardModuleRect, gap = 0) {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

/** 通用矩形合法性判定：不越界且不与障碍矩形集合重叠。 */
export function canPlaceRect(
  candidate: BoardModuleRect,
  obstacles: readonly BoardModuleRect[],
  gap = 0,
) {
  if (
    candidate.x < EDGE ||
    candidate.y < EDGE ||
    candidate.x + candidate.w > BOARD_WIDTH - EDGE ||
    candidate.y + candidate.h > BOARD_HEIGHT - EDGE
  ) {
    return false;
  }
  for (const other of obstacles) {
    if (rectsOverlap(candidate, other, gap)) return false;
  }
  return true;
}

export function nearestFreeRect(
  rect: BoardModuleRect,
  occupied: readonly BoardModuleRect[],
) {
  const target = {
    ...rect,
    ...clampToBoard(snap(rect.x), snap(rect.y), rect.w, rect.h),
  };
  if (canPlaceRect(target, occupied, 8)) return { x: target.x, y: target.y };
  let best: { x: number; y: number; distance: number } | null = null;
  for (let y = SNAP_GRID; y <= BOARD_HEIGHT - rect.h - EDGE; y += SNAP_GRID) {
    for (let x = SNAP_GRID; x <= BOARD_WIDTH - rect.w - EDGE; x += SNAP_GRID) {
      const distance = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (best && distance >= best.distance) continue;
      if (canPlaceRect({ ...rect, x, y }, occupied, 8)) {
        best = { x, y, distance };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** 通用矩形就近空位同心方环求解器（供手动拖拽、缩放与 AI Harness 共用）。 */
export function nearestFreeSpotForRect(
  w: number,
  h: number,
  targetX: number,
  targetY: number,
  obstacles: readonly BoardModuleRect[],
  gap = 0,
): { x: number; y: number } | null {
  const initial = clampToBoard(targetX, targetY, w, h);
  if (canPlaceRect({ ...initial, w, h }, obstacles, gap)) return initial;

  const maxRing = Math.ceil(Math.max(BOARD_WIDTH, BOARD_HEIGHT) / SNAP_GRID);
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const offsets: Array<[number, number]> = [];
    for (let i = -ring; i <= ring; i += 1) {
      offsets.push([i, -ring], [i, ring], [-ring, i], [ring, i]);
    }
    let best: { x: number; y: number; dist: number } | null = null;
    for (const [dx, dy] of offsets) {
      const clamped = clampToBoard(
        targetX + dx * SNAP_GRID,
        targetY + dy * SNAP_GRID,
        w,
        h,
      );
      if (!canPlaceRect({ ...clamped, w, h }, obstacles, gap)) continue;
      const dist = Math.hypot(clamped.x - targetX, clamped.y - targetY);
      if (!best || dist < best.dist) best = { ...clamped, dist };
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

export interface ModulePlacementContext {
  extraObstacles?: readonly BoardModuleRect[];
  hiddenKeys?: ReadonlySet<BoardModuleKey>;
  overrideSize?: { w: number; h: number };
}

function collectModuleObstacles(
  excludeKey: BoardModuleKey,
  layout: BoardModuleLayout | null | undefined,
  context?: ModulePlacementContext,
): BoardModuleRect[] {
  const obstacles: BoardModuleRect[] = [];
  for (const other of boardModuleKeys) {
    if (other === excludeKey) continue;
    if (context?.hiddenKeys?.has(other)) continue;
    obstacles.push(moduleRect(other, layout));
  }
  if (context?.extraObstacles) {
    obstacles.push(...context.extraObstacles);
  }
  return obstacles;
}

/** 这个位置能不能放：不超边界、不压到别的可见模块或自定义面板。 */
export function canPlace(
  key: BoardModuleKey,
  x: number,
  y: number,
  layout: BoardModuleLayout | null | undefined,
  gap = 0,
  context?: ModulePlacementContext,
) {
  const current = moduleRect(key, layout);
  const w = context?.overrideSize?.w ?? current.w;
  const h = context?.overrideSize?.h ?? current.h;
  const obstacles = collectModuleObstacles(key, layout, context);
  return canPlaceRect({ x, y, w, h }, obstacles, gap);
}

/**
 * 找离目标最近的合法落点：先试目标格，不行就按同心方环往外搜，
 * 保证松手时总能落在一个不重叠的位置。
 */
export function nearestFreeSpot(
  key: BoardModuleKey,
  targetX: number,
  targetY: number,
  layout: BoardModuleLayout | null | undefined,
  context?: ModulePlacementContext,
) {
  const current = moduleRect(key, layout);
  const w = context?.overrideSize?.w ?? current.w;
  const h = context?.overrideSize?.h ?? current.h;
  const obstacles = collectModuleObstacles(key, layout, context);
  return nearestFreeSpotForRect(w, h, targetX, targetY, obstacles, 0);
}
