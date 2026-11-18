import type { EventClock } from "./eventClock.ts";
import { boardModuleKeys, moduleRect, nearestFreeRect, type BoardModuleLayout, type BoardModuleRect } from "./boardModules.ts";

export type EventClockPosition = { x: number; y: number };
export const EVENT_CLOCK_CARD = { w: 340, h: 221 };

/** Old clocks without positions still render, and new cards never replace the
 * first card. Saved positions are authoritative, including intentional overlap. */
export function eventClockRects(clocks: EventClock[], layout: BoardModuleLayout, hidden: string[] = []) {
  const anchor = moduleRect("index", layout);
  const occupied = boardModuleKeys.filter((key) => key !== "index" && !hidden.includes(key))
    .map((key) => moduleRect(key, layout));
  const rects = new Map<string, BoardModuleRect>();
  // Reserve all explicit positions before allocating legacy cards.
  for (const clock of clocks) if (clock.position) {
    const rect = { ...EVENT_CLOCK_CARD, ...clock.position };
    rects.set(clock.id, rect); occupied.push(rect);
  }
  for (const clock of clocks) if (!rects.has(clock.id)) {
    const spot = rects.size === 0 ? { x: anchor.x, y: anchor.y } :
      nearestFreeRect({ ...anchor, ...EVENT_CLOCK_CARD }, occupied);
    const rect = { ...EVENT_CLOCK_CARD, ...(spot ?? anchor) };
    rects.set(clock.id, rect); occupied.push(rect);
  }
  return rects;
}
