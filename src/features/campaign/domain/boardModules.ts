import { BOARD_HEIGHT, BOARD_WIDTH } from "./boardGeometry.ts";
export { BOARD_HEIGHT, BOARD_WIDTH } from "./boardGeometry.ts";

/**
 * 公告板模块定义。
 *
 * 每个区块现在都是一个可以自由摆放的模块：尺寸固定（用户不能改大小），
 * 位置存在 campaign_settings.module_layout 里，拖拽时按网格吸附且不允许重叠。
 *
 * 坐标是「世界坐标」——相对 .board 左上角、未缩放的像素，和便签的 x/y 同一套。
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

/** 只存位置；尺寸由下面的定义决定，用户改不了。 */
export type BoardModuleLayout = Partial<Record<BoardModuleKey, { x: number; y: number }>>;

/** 拖拽时吸附到这个格子上，摆出来整齐，也好做碰撞判断。 */
export const SNAP_GRID = 10;

/** 画布四周留一点余量，模块不会被贴死在边上。 */
const EDGE = 8;

export const boardModules: Record<
  BoardModuleKey,
  { label: string; rect: BoardModuleRect }
> = {
  inventory: { label: "物资", rect: { x: 42, y: 48, w: 410, h: 751 } },
  tasks: { label: "任务委托", rect: { x: 491, y: 48, w: 564, h: 525 } },
  shifts: { label: "成员名册", rect: { x: 1081, y: 50, w: 340, h: 291 } },
  index: { label: "事件钟", rect: { x: 1081, y: 357, w: 340, h: 221 } },
  activity: { label: "行动记录", rect: { x: 58, y: 802, w: 395, h: 350 } },
  safety: { label: "检查清单", rect: { x: 545, y: 578, w: 540, h: 575 } },
};

export const boardModuleKeys = Object.keys(boardModules) as BoardModuleKey[];

export function snap(value: number) {
  return Math.round(value / SNAP_GRID) * SNAP_GRID;
}

/** 把坐标限制在画布内。 */
export function clampToBoard(x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(Math.max(x, EDGE), BOARD_WIDTH - w - EDGE),
    y: Math.min(Math.max(y, EDGE), BOARD_HEIGHT - h - EDGE),
  };
}

/** 取出某个模块当前的位置：用户摆过的优先，否则用默认位置。 */
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
  const clamped = clampToBoard(x, y, base.w, base.h);
  return { ...base, x: clamped.x, y: clamped.y };
}

export function rectsOverlap(a: BoardModuleRect, b: BoardModuleRect, gap = 0) {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

export function canPlaceRect(candidate: BoardModuleRect, occupied: BoardModuleRect[], gap = 0) {
  return candidate.x >= EDGE && candidate.y >= EDGE &&
    candidate.x + candidate.w <= BOARD_WIDTH - EDGE &&
    candidate.y + candidate.h <= BOARD_HEIGHT - EDGE &&
    occupied.every((other) => !rectsOverlap(candidate, other, gap));
}

export function nearestFreeRect(rect: BoardModuleRect, occupied: BoardModuleRect[]) {
  const target = { ...rect, ...clampToBoard(snap(rect.x), snap(rect.y), rect.w, rect.h) };
  if (canPlaceRect(target, occupied, 8)) return { x: target.x, y: target.y };
  let best: { x: number; y: number; distance: number } | null = null;
  for (let y = SNAP_GRID; y <= BOARD_HEIGHT - rect.h - EDGE; y += SNAP_GRID) {
    for (let x = SNAP_GRID; x <= BOARD_WIDTH - rect.w - EDGE; x += SNAP_GRID) {
      const distance = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (best && distance >= best.distance) continue;
      if (canPlaceRect({ ...rect, x, y }, occupied, 8)) best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** 这个位置能不能放：不超边界、不压到别的模块。 */
export function canPlace(
  key: BoardModuleKey,
  x: number,
  y: number,
  layout: BoardModuleLayout | null | undefined,
  gap = 0,
) {
  const base = boardModules[key].rect;
  const candidate: BoardModuleRect = { x, y, w: base.w, h: base.h };
  if (
    x < EDGE ||
    y < EDGE ||
    x + base.w > BOARD_WIDTH - EDGE ||
    y + base.h > BOARD_HEIGHT - EDGE
  )
    return false;
  for (const other of boardModuleKeys) {
    if (other === key) continue;
    if (rectsOverlap(candidate, moduleRect(other, layout), gap)) return false;
  }
  return true;
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
) {
  const base = boardModules[key].rect;
  if (canPlace(key, targetX, targetY, layout)) return { x: targetX, y: targetY };

  const maxRing = Math.ceil(Math.max(BOARD_WIDTH, BOARD_HEIGHT) / SNAP_GRID);
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const offsets: Array<[number, number]> = [];
    for (let i = -ring; i <= ring; i += 1) {
      offsets.push([i, -ring], [i, ring], [-ring, i], [ring, i]);
    }
    let best: { x: number; y: number; dist: number } | null = null;
    for (const [dx, dy] of offsets) {
      const x = base.x + (targetX - base.x) + dx * SNAP_GRID;
      const y = base.y + (targetY - base.y) + dy * SNAP_GRID;
      const clamped = clampToBoard(x, y, base.w, base.h);
      if (!canPlace(key, clamped.x, clamped.y, layout)) continue;
      const dist = Math.hypot(clamped.x - targetX, clamped.y - targetY);
      if (!best || dist < best.dist) best = { ...clamped, dist };
    }
    if (best) return { x: best.x, y: best.y };
  }
  // 画布塞满了：停在原地，由调用方提示。
  return null;
}
