import { Minus, Plus } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { eventClockComplete, eventClockError, type EventClock } from "../../features/campaign/domain/eventClock";
import { defaultSectionColors } from "../../features/campaign/domain/campaignSettings";
import { BoardContentCard, BoardSectionHeader, type SectionActions } from "./BoardSectionPrimitives";
import { MotionText } from "../MotionText";
import { PaperDialog } from "../composer/PaperDialog";

export function EventClockTrack({ clock }: { clock: EventClock }) {
  const stage = clock.stages?.[clock.progress - 1];
  return <div className="event-clock-track" role="progressbar" aria-label={`${clock.name}进度`}
    aria-valuemin={clock.mode === "scale" ? 1 : 0} aria-valuemax={clock.segments} aria-valuenow={clock.progress}
    aria-valuetext={stage?.label ?? `${clock.progress}/${clock.segments}`}
    style={{ "--event-clock-color": stage?.color ?? clock.color } as CSSProperties}>
    {Array.from({ length: clock.segments }, (_, i) => <span key={i}
      data-filled={clock.mode === "scale" ? i === clock.progress - 1 : i < clock.progress}
      style={clock.stages ? { backgroundColor: clock.stages[i]?.color } : undefined} />)}
  </div>;
}

export function EventClockSection({ clock, canManage, onProgress, title, color, actions }: {
  clock?: EventClock; canManage: boolean;
  onProgress: (id: string, progress: number, revision: number) => Promise<unknown>;
  title: string; color?: string; actions?: SectionActions;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const complete = clock && eventClockComplete(clock);
  const change = async (delta: number) => {
    if (!clock || busy) return;
    setBusy(true); setError("");
    try { await onProgress(clock.id, clock.progress + delta, clock.revision); }
    catch (error) { setError(eventClockError(error)); }
    finally { setBusy(false); }
  };
  return <section className="board-section event-clock-section" data-section="index"
    data-event-clock-id={clock?.id} data-complete={!!complete}>
    <BoardSectionHeader title={title} color={color ?? defaultSectionColors.index} actions={actions} />
    <BoardContentCard className="event-clock-card" label={clock?.name ?? "事件钟"}>
    {!clock ? <div className="event-clock-empty"><span>暂无事件钟</span></div> : <>
      <div className="event-clock-name">
        <span>{clock.name}</span>
        <strong><MotionText value={clock.stages?.[clock.progress - 1]?.label ?? `${clock.progress}/${clock.segments}`} /></strong>
      </div>
      <EventClockTrack clock={clock} />
      {complete && <span className="event-clock-complete" role="status">事件已满</span>}
      <div className="event-clock-footer">
        <button type="button" className="event-clock-details-link" onClick={() => setDetailsOpen(true)}
          aria-label={`查看${clock.name}${complete ? "的后果" : "详情"}`} aria-haspopup="dialog">
          {complete ? "查看后果" : "查看详情"}
        </button>
        {canManage && <div className="event-clock-progress-actions">
          <button type="button" aria-label={`${clock.name}进度减一`} disabled={busy || clock.progress <= (clock.mode === "scale" ? 1 : 0)}
            onClick={() => void change(-1)}><Minus /></button>
          <button type="button" aria-label={`${clock.name}进度加一`} disabled={busy || clock.progress >= clock.segments}
            onClick={() => void change(1)}><Plus /></button>
        </div>}
      </div>
    </>}
    {error && <p className="event-clock-error" role="alert">{error}</p>}
    </BoardContentCard>
    {detailsOpen && clock && <PaperDialog title={clock.name} className="event-clock-details-dialog"
      onClose={() => setDetailsOpen(false)}>
      <div className="event-clock-readonly" data-complete={!!complete}>
        <strong>{clock.stages?.[clock.progress - 1]?.label ?? `${clock.progress}/${clock.segments}`}</strong>
        <EventClockTrack clock={clock} />
        <h2>{clock.mode === "scale" ? "当前状态" : complete ? "已触发的后果" : "事件后果"}</h2>
        <p>{clock.stages?.[clock.progress - 1]?.description ?? clock.consequence}</p>
      </div>
    </PaperDialog>}
  </section>;
}
