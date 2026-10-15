import { ClipboardList, MessageSquare, Send, Trash2, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CampaignBoard,
  ComposerTarget,
  NoteColor,
  NoteDraft,
  QuestDraft,
} from "../../features/campaign/domain/types";

export type ComposeKind = "note" | "quest";

export interface ComposerState {
  open: boolean;
  kind: ComposeKind;
  target: ComposerTarget | null;
  sourceRect: DOMRect | null;
}

interface ComposerDialogProps {
  state: ComposerState;
  board: CampaignBoard;
  onClose: () => void;
  onSaveQuest: (draft: QuestDraft, id?: string) => Promise<void>;
  onSaveNote: (draft: NoteDraft, id?: string) => Promise<void>;
  onDelete: (target: ComposerTarget) => Promise<void>;
}

const colors: Array<{ value: NoteColor; label: string }> = [
  { value: "yellow", label: "黄色" },
  { value: "pink", label: "粉色" },
  { value: "blue", label: "蓝色" },
  { value: "green", label: "绿色" },
];

export function ComposerDialog({
  state,
  board,
  onClose,
  onSaveQuest,
  onSaveNote,
  onDelete,
}: ComposerDialogProps) {
  const composerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ComposeKind>(state.kind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [due, setDue] = useState("");
  const [color, setColor] = useState<NoteColor>("yellow");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setKind(state.kind);
    setSubmitting(false);

    if (state.target?.kind === "quest") {
      const quest = board.quests.find((item) => item.id === state.target?.id);
      setTitle(quest?.title ?? "");
      setBody(quest?.body ?? "");
      setAssigneeName(quest?.assigneeName ?? "");
      setDue(quest?.due ?? "");
    } else if (state.target?.kind === "note") {
      const note = board.notes.find((item) => item.id === state.target?.id);
      setTitle(note?.title ?? "");
      setBody(note?.body ?? "");
      setColor(note?.color ?? "yellow");
    } else {
      setTitle("");
      setBody("");
      setAssigneeName("");
      setDue("");
      setColor("yellow");
    }

    requestAnimationFrame(() => titleRef.current?.focus());
  }, [board.notes, board.quests, state.kind, state.open, state.target]);

  useLayoutEffect(() => {
    if (!state.open || !state.sourceRect || !composerRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const source = state.sourceRect;
    const target = composerRef.current.getBoundingClientRect();
    const dx =
      source.left + source.width / 2 - (target.left + target.width / 2);
    const dy =
      source.top + source.height / 2 - (target.top + target.height / 2);
    const scale = Math.max(0.18, Math.min(0.7, source.width / target.width));
    const animation = composerRef.current.animate(
      [
        {
          transform:
            "translate3d(" + dx + "px," + dy + "px,0) scale(" + scale + ")",
          opacity: 0.25,
        },
        { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation.cancel();
  }, [state.open, state.sourceRect]);

  useEffect(() => {
    if (!state.open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !composerRef.current) return;
      const focusable = Array.from(
        composerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([type="radio"]):not([disabled]), textarea:not([disabled])',
        ),
      ).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, state.open]);

  const heading = state.target
    ? kind === "quest"
      ? "编辑任务"
      : "编辑留言"
    : kind === "quest"
      ? "发布一项任务"
      : "写一张留言";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      if (kind === "quest") {
        await onSaveQuest(
          {
            title: title.trim(),
            body: body.trim(),
            assigneeName: assigneeName.trim() || "待认领",
            due,
          },
          state.target?.kind === "quest" ? state.target.id : undefined,
        );
      } else {
        await onSaveNote(
          { title: title.trim(), body: body.trim(), color },
          state.target?.kind === "note" ? state.target.id : undefined,
        );
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={"dialog-layer " + (state.open ? "is-open" : "")}
      aria-hidden={!state.open}
    >
      <button
        className="dialog-scrim"
        type="button"
        onClick={onClose}
        aria-label="关闭"
      />
      <section
        ref={composerRef}
        className="composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composerTitle"
      >
        <header className="composer-header">
          <div>
            <span className="composer-kicker">发布到战役公告板</span>
            <h1 id="composerTitle">{heading}</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {!state.target && (
          <div className="compose-type" role="tablist" aria-label="发布类型">
            <button
              className={kind === "note" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={kind === "note"}
              onClick={() => setKind("note")}
            >
              <MessageSquare aria-hidden="true" />
              留言
            </button>
            <button
              className={kind === "quest" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={kind === "quest"}
              onClick={() => setKind("quest")}
            >
              <ClipboardList aria-hidden="true" />
              任务
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>标题</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={20}
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            <span>内容</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={100}
              rows={4}
              required
            />
          </label>

          {kind === "quest" && (
            <div className="task-fields">
              <label className="field">
                <span>负责人</span>
                <input
                  value={assigneeName}
                  onChange={(event) => setAssigneeName(event.target.value)}
                  maxLength={10}
                  autoComplete="off"
                  placeholder="待认领"
                />
              </label>
              <label className="field">
                <span>完成时间</span>
                <input
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                  type="time"
                />
              </label>
            </div>
          )}

          {kind === "note" && (
            <fieldset className="color-field">
              <legend>便签颜色</legend>
              {colors.map((option) => (
                <label title={option.label} key={option.value}>
                  <input
                    type="radio"
                    name="color"
                    value={option.value}
                    checked={color === option.value}
                    onChange={() => setColor(option.value)}
                  />
                  <span className={"swatch swatch-" + option.value} />
                </label>
              ))}
            </fieldset>
          )}

          <footer className="composer-actions">
            {state.target && (
              <button
                className="delete-button"
                type="button"
                onClick={() => void onDelete(state.target!)}
                aria-label="删除"
                title="删除"
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
            <span className="action-spacer" />
            <button className="text-button" type="button" onClick={onClose}>
              取消
            </button>
            <button
              className="publish-button"
              type="submit"
              disabled={submitting}
            >
              <Send aria-hidden="true" />
              {submitting ? "保存中" : "发布"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
