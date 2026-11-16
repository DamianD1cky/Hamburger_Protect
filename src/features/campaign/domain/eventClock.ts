import { burgerIndexInfo, burgerIndexSteps } from "./burgerIndex";

export interface EventClockStage {
  label: string;
  color: string;
  description: string;
}
export interface EventClock {
  id: string;
  name: string;
  segments: number;
  progress: number;
  consequence: string;
  color: string;
  /** Status scales have named stages and do not trigger on reaching the end. */
  mode: "progress" | "scale";
  stages: EventClockStage[] | null;
  revision: number;
}
export type EventClockDraft = Pick<EventClock, "name" | "segments" | "progress" | "consequence" | "color">;
export const EVENT_CLOCK_LIMIT = 24;
export function eventClockComplete(clock: EventClock) {
  return clock.mode === "progress" && clock.progress === clock.segments;
}
export function validateEventClock(draft: EventClockDraft, current?: EventClock): EventClockDraft {
  const name = draft.name.trim(), consequence = draft.consequence.trim();
  if (!name || name.length > 80) throw new Error("事件名称需为 1–80 个字符。");
  if (!Number.isInteger(draft.segments) || draft.segments < 2 || draft.segments > 24)
    throw new Error("事件钟需为 2–24 格。");
  if (!Number.isInteger(draft.progress) || draft.progress < (current?.mode === "scale" ? 1 : 0) ||
    draft.progress > draft.segments) throw new Error("进度必须在事件钟的格数范围内。");
  if (current?.mode === "scale" && draft.segments !== current.segments)
    throw new Error("状态刻度需保留原来的分级。");
  if ((current?.mode !== "scale" && !consequence) || consequence.length > 500)
    throw new Error("请填写不超过 500 个字符的事件后果。");
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw new Error("事件钟颜色无效。");
  return { name, segments: draft.segments, progress: draft.progress, consequence, color: draft.color.toLowerCase() };
}
/** Preserve the old scale without inventing a consequence at green 3. */
export function legacyIndexClock(campaignId: string, value: number): EventClock {
  return {
    id: campaignId, name: "汉堡屋指数", segments: 9, progress: value,
    consequence: "", color: "#406b50", mode: "scale", revision: 1,
    stages: burgerIndexSteps.map(({ value, label, color }) => {
      const info = burgerIndexInfo(value);
      return {
        label, color: ({ red: "#ab3326", yellow: "#e7a723", green: "#406b50" })[color as "red" | "yellow" | "green"],
        description: `${info.service} · ${info.bonus}。${value === 1 ? "立即败北，请由 GM 处理结局。" : info.description}`,
      };
    }),
  };
}

export function eventClockError(error: unknown) {
  const message = error instanceof Error ? error.message : "事件钟保存失败，请重试。";
  return ({
    EVENT_CLOCK_CONFLICT: "其他 GM 已修改这个事件钟，请重新打开后再调整。",
    EVENT_CLOCK_NOT_FOUND: "这个事件钟已被移除，请刷新后重试。",
    EVENT_CLOCK_LIMIT: "每个战役最多保留 24 个事件钟，请先移除已结束的事件。",
    INVALID_EVENT_CLOCK: "事件钟内容无效，请检查名称、格数、进度和后果。",
  } as Record<string, string>)[message] ?? message;
}
