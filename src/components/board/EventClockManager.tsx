import { Plus } from "lucide-react";
import { useState } from "react";
import type { CampaignBoard } from "../../features/campaign/domain/types";
import { EVENT_CLOCK_LIMIT, eventClockComplete, eventClockError, type EventClock, type EventClockDraft } from "../../features/campaign/domain/eventClock";
import { EventClockTrack } from "./EventClockSection";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { ColorField } from "./ColorField";

const emptyDraft = (): EventClockDraft => ({
  name: "", segments: 6, progress: 0, consequence: "", color: "#b24b37",
});
export function EventClockManager({ board, clockId, onSave, onDelete, onBusyChange }: {
  board: CampaignBoard; clockId?: string | null;
  onSave: (draft: EventClockDraft, id?: string, revision?: number) => Promise<EventClock>;
  onDelete: (id: string, revision: number) => Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const initial = clockId === null ? undefined : board.eventClocks.find((clock) => clock.id === clockId) ?? board.eventClocks[0];
  const [editing, setEditing] = useState<EventClock | null>(initial ?? null);
  const [draft, setDraft] = useState<EventClockDraft>(initial ?? emptyDraft());
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const editable = board.viewer.role === "gm" && board.campaign.status === "active";
  const ime = useImeEnterGuard();
  const setSaving = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };
  const choose = (clock: EventClock | null) => {
    setEditing(clock); setDraft(clock ?? emptyDraft()); setError(""); setConfirmDelete(false);
  };
  const save = async () => {
    if (!editable || busy) return;
    setSaving(true); setError("");
    try {
      const saved = await onSave(draft, editing?.id, editing?.revision);
      choose(saved);
    }
    catch (error) { setError(eventClockError(error)); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editable || busy || !editing) return;
    setSaving(true); setError("");
    try {
      await onDelete(editing.id, editing.revision);
      choose(board.eventClocks.find((clock) => clock.id !== editing.id) ?? null);
    } catch (error) { setError(eventClockError(error)); }
    finally { setSaving(false); }
  };
  const preview: EventClock = { ...editing, ...draft, id: editing?.id ?? "preview", mode: editing?.mode ?? "progress",
    stages: editing?.stages ?? null, revision: editing?.revision ?? 1 };
  // Readers follow the shared clock while the GM's draft retains its original
  // revision so an external progress change cannot be overwritten silently.
  const readonlyClock = board.eventClocks.find((clock) => clock.id === editing?.id);
  return <div className="event-clock-editor">
      <nav className="event-clock-list" aria-label="事件钟列表">
        {board.eventClocks.map((clock) => <button type="button" key={clock.id} disabled={busy}
          aria-pressed={editing?.id === clock.id} data-complete={eventClockComplete(clock)} onClick={() => choose(clock)}>
          <span>{clock.name}</span><strong>{clock.stages?.[clock.progress - 1]?.label ?? `${clock.progress}/${clock.segments}`}</strong>
        </button>)}
        {editable && <button type="button" className="event-clock-create" disabled={busy || board.eventClocks.length >= EVENT_CLOCK_LIMIT}
          aria-label="新建事件钟" aria-pressed={!editing} onClick={() => choose(null)}><Plus />发起事件钟</button>}
      </nav>
      {!editable ? <article className="event-clock-readonly" data-complete={readonlyClock ? eventClockComplete(readonlyClock) : false}>
        {readonlyClock ? <><h2>{readonlyClock.name}</h2><strong>
          {readonlyClock.stages?.[readonlyClock.progress - 1]?.label ?? `${readonlyClock.progress}/${readonlyClock.segments}`}
        </strong><EventClockTrack clock={readonlyClock} />
          <p role={eventClockComplete(readonlyClock) ? "status" : undefined}>
            {readonlyClock.stages?.[readonlyClock.progress - 1]?.description ?? readonlyClock.consequence}
          </p></> :
          <p>暂无事件钟</p>}
      </article> : <form {...ime} onSubmit={(event) => {
        event.preventDefault(); void save();
      }}>
        <fieldset disabled={busy} className="event-clock-fields">
          <label className="field"><span>事件名称</span><input aria-label="事件名称" value={draft.name} maxLength={80} required
            placeholder="例如：被追捕" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="event-clock-numbers">
            <label className="field"><span>总格数</span><input type="number" aria-label="事件钟总格数" min={2} max={24}
              disabled={editing?.mode === "scale"} value={draft.segments} onChange={(event) => {
                const segments = Number(event.target.value);
                setDraft({ ...draft, segments, progress: Math.min(draft.progress, segments) });
              }} /></label>
            <label className="field"><span>{editing ? "当前进度" : "起始进度"}</span>
              {editing?.stages ? <select aria-label="事件钟当前进度" value={draft.progress}
                onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })}>
                {editing.stages.map((stage, i) => <option key={i} value={i + 1}>{stage.label}</option>)}
              </select> : <input type="number" aria-label={editing ? "事件钟当前进度" : "事件钟起始进度"} min={0}
                max={draft.segments} value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} />}
            </label>
          </div>
          {draft.segments >= 2 && draft.segments <= 24 && <EventClockTrack clock={preview} />}
          {editing?.mode === "scale" ? <p className="event-clock-scale-description">{editing.stages?.[draft.progress - 1]?.description}</p> :
            <label className="field"><span>填满后的后果</span><textarea aria-label="事件后果" rows={3} maxLength={500} required
              placeholder="例如：追兵发现藏身处，立即进入冲突。" value={draft.consequence}
              onChange={(event) => setDraft({ ...draft, consequence: event.target.value })} /></label>}
          <ColorField label="进度颜色" accessibleLabel="事件钟进度" value={draft.color}
            onChange={(color) => setDraft({ ...draft, color })} disabled={busy} />
        </fieldset>
        {error && <p className="access-error" role="alert">{error}</p>}
        <footer className="composer-actions">
          {editing && <button className="text-button danger-button" type="button" disabled={busy}
            onClick={() => confirmDelete ? void remove() : setConfirmDelete(true)}>
            {confirmDelete ? "确认移除事件钟" : "移除事件钟"}</button>}
          <button type="submit" className="publish-button" disabled={busy || !draft.name.trim()}>
            {busy ? "保存中…" : editing ? "保存事件钟" : "发起事件钟"}</button>
        </footer>
      </form>}
  </div>;
}
