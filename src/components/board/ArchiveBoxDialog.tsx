import { ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, Pencil, Pin, Plus, Search, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ARCHIVE_CATEGORY_META, ARCHIVE_ENTRY_LIMIT, ARCHIVE_FIELD_LABELS, clampArchiveFontSize,
  createStarterArchiveEntries, normalizeArchiveEntry, visibleArchiveEntriesForRole,
  type ArchiveCategory, type ArchiveEntry,
} from "../../features/campaign/domain/archiveBox";
import type { CampaignBoard } from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { blobToFile, compressImage } from "../../lib/imageCompress";
import { PaperDialog } from "../composer/PaperDialog";
import { CampaignImage } from "./CampaignImage";

const CATEGORIES: ArchiveCategory[] = ["clue", "evidence", "character", "news"];
const emptyEntry = (category: ArchiveCategory): ArchiveEntry => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), category, title: "", subtitle: "", dateLabel: "", summary: "", body: "",
    tags: [], imageUrl: null, fontSize: 15, visibility: "public", pinned: false, createdAt: now, updatedAt: now };
};

function ArchivePage({ entry, zoom }: { entry: ArchiveEntry; zoom: number }) {
  const meta = ARCHIVE_CATEGORY_META[entry.category];
  const labels = ARCHIVE_FIELD_LABELS[entry.category];
  const photo = entry.imageUrl && <figure className="manila-photo">
    <CampaignImage src={entry.imageUrl} alt={entry.title} draggable={false} />
  </figure>;
  return <article className={`manila-dossier is-${entry.category}`}
    style={{ "--archive-font-size": `${clampArchiveFontSize(entry.fontSize + zoom)}px` } as CSSProperties}>
    <div className="manila-document-meta"><span className="manila-stamp">{meta.stamp}</span><time>{entry.dateLabel}</time></div>
    {entry.category === "character" ? <>
      {photo}
      <div className="manila-character-card">
        <h2><span>姓名：</span>{entry.title}</h2>
        {entry.subtitle && <p className="manila-identity"><b>职业 / 身份：</b>{entry.subtitle}</p>}
        {entry.dateLabel && <p><b>最后目击 / 备注：</b>{entry.dateLabel}</p>}
        <h3>详细信息</h3>
        {entry.summary && <p className="manila-summary">{entry.summary}</p>}
        <p className="manila-body">{entry.body}</p>
      </div>
    </> : entry.category === "news" ? <div className="manila-news-clipping">
      <div className="manila-masthead">{entry.subtitle || "报刊剪报"}<small>{entry.dateLabel}</small></div>
      <h2>{entry.title}</h2>{photo}
      {entry.summary && <p className="manila-news-deck">{entry.summary}</p>}
      <p className="manila-body">{entry.body}</p>
    </div> : <>
      <div className={entry.category === "clue" ? "manila-clue-heading" : "manila-evidence-heading"}>
        <h2>{entry.title}</h2>{entry.subtitle && <p>{entry.subtitle}</p>}
        {entry.category === "evidence" && <span className="manila-exhibit-seal">EXHIBIT<br />已封存</span>}
      </div>
      {photo}
      <div className={entry.category === "clue" ? "manila-lined-paper" : "manila-evidence-card"}>
        {entry.summary && <p className="manila-summary">{entry.summary}</p>}
        <h3>{labels.body}</h3><p className="manila-body">{entry.body}</p>
      </div>
    </>}
    {!!entry.tags.length && <div className="manila-tags">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
  </article>;
}

export function ArchiveBoxDialog({ board, onClose, onSaveEntries, onUploadPhoto, onPinToBoard }: {
  board: CampaignBoard; onClose: () => void;
  onSaveEntries: (entries: ArchiveEntry[]) => Promise<unknown>;
  onUploadPhoto?: (file: File) => Promise<string>;
  onPinToBoard?: (entry: ArchiveEntry) => Promise<unknown>;
}) {
  const canEdit = board.viewer.role === "gm" && board.campaign.status === "active";
  const allEntries = board.settings.styleTokens.archiveEntries ?? [];
  const visible = useMemo(() => visibleArchiveEntriesForRole(allEntries, board.viewer.role === "gm"), [allEntries, board.viewer.role]);
  const [category, setCategory] = useState<ArchiveCategory>(visible[0]?.category ?? "clue");
  const [selectedId, setSelectedId] = useState<string | null>(visible[0]?.id ?? null);
  const [editing, setEditing] = useState<ArchiveEntry | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const [turn, setTurn] = useState<{ from: ArchiveEntry; direction: "next" | "prev" } | null>(null);
  const turnTimer = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const ime = useImeEnterGuard();
  const pages = visible.filter((entry) => entry.category === category);
  const active = pages.find((entry) => entry.id === selectedId) ?? pages[0] ?? null;
  const index = active ? pages.findIndex((entry) => entry.id === active.id) : -1;
  const directoryEntries = visible.filter((entry) => {
    const q = query.trim().toLowerCase();
    return q ? [entry.title, entry.subtitle, entry.body, ...entry.tags].join(" ").toLowerCase().includes(q) : entry.category === category;
  });
  const requestNavigation = (action: () => void) => {
    if (busy) return;
    if (editing) { pendingAction.current = action; setConfirmDiscard(true); return; }
    action();
  };
  const selectCategory = (next: ArchiveCategory) => requestNavigation(() => {
    clearTimeout(turnTimer.current); setTurn(null); setCategory(next);
    setSelectedId(visible.find((entry) => entry.category === next)?.id ?? null);
    setConfirmDelete(false); setError(""); setDirectoryOpen(false);
  });
  const changePage = (direction: -1 | 1) => {
    if (busy || editing || turn) return;
    const next = pages[index + direction];
    if (!active || !next) return;
    setTurn({ from: active, direction: direction > 0 ? "next" : "prev" });
    setSelectedId(next.id); setConfirmDelete(false);
    turnTimer.current = window.setTimeout(() => { setTurn(null); scrollRef.current?.scrollTo({ top: 0 }); }, 340);
  };
  useEffect(() => () => clearTimeout(turnTimer.current), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [active?.id]);
  useEffect(() => {
    const element = stageRef.current?.closest("dialog");
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]") || event.isComposing) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); changePage(event.key === "ArrowRight" ? 1 : -1);
      } else if (/^[1-4]$/.test(event.key)) {
        event.preventDefault(); selectCategory(CATEGORIES[Number(event.key) - 1]);
      }
    };
    element?.addEventListener("keydown", onKey);
    return () => element?.removeEventListener("keydown", onKey);
  });
  const saveEntries = async (entries: ArchiveEntry[]) => {
    if (!canEdit || busy) return false;
    setBusy(true); setError("");
    try { await onSaveEntries(entries); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "档案保存失败，修改已保留。"); return false; }
    finally { setBusy(false); }
  };
  const startEdit = (entry: ArchiveEntry) => {
    setEditing(structuredClone(entry)); setTagsText(entry.tags.join("、"));
    setError(""); setDirectoryOpen(false); setConfirmDelete(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy || !canEdit) return;
    const entry = normalizeArchiveEntry({ ...editing, tags: tagsText.split(/[,，、\s]+/).filter(Boolean), updatedAt: new Date().toISOString() });
    if (!entry) { setError("请填写标题或姓名。"); return; }
    const exists = allEntries.some((item) => item.id === entry.id);
    if (!exists && allEntries.length >= ARCHIVE_ENTRY_LIMIT) { setError("档案盒最多保存 60 页。"); return; }
    if (await saveEntries(exists ? allEntries.map((item) => item.id === entry.id ? entry : item) : [entry, ...allEntries])) {
      setCategory(entry.category); setSelectedId(entry.id); setEditing(null);
    }
  };
  const labels = ARCHIVE_FIELD_LABELS[editing?.category ?? category];
  const field = (key: "title" | "subtitle" | "dateLabel" | "summary" | "body", label: string, multiline = false) =>
    editing && <label className="field"><span>{label}</span>{multiline
      ? <textarea aria-label={label} value={editing[key]} rows={key === "body" ? 8 : 2} maxLength={key === "body" ? 6000 : 200}
          onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} />
      : <input aria-label={label} value={editing[key]} maxLength={key === "title" || key === "subtitle" ? 80 : 40} required={key === "title"}
          onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} />}</label>;
  return <PaperDialog title="档案盒" className="archive-box-dialog manila-archive-dialog" onClose={() => requestNavigation(onClose)}>
    <div className={`manila-archive-case is-${category}`}>
      <nav className="manila-folder-tabs" role="tablist" aria-label="档案分类">
        {CATEGORIES.map((cat) => <button type="button" role="tab" className="manila-tab" key={cat} aria-selected={category === cat}
          data-category={cat} disabled={busy} onClick={() => selectCategory(cat)}>
          {ARCHIVE_CATEGORY_META[cat].shortLabel}<small>{visible.filter((entry) => entry.category === cat).length}</small>
        </button>)}
      </nav>
      <div className="manila-folder-body">
        <header className="manila-page-header">
          <span className={`manila-visibility ${active?.visibility === "gm_only" ? "is-secret" : ""}`}>
            {active ? active.visibility === "gm_only" ? "机密 · 仅 GM" : "公开" : ARCHIVE_CATEGORY_META[category].stamp}
          </span>
          <button type="button" className="manila-page-number" aria-label="打开档案目录" disabled={!!editing} onClick={() => setDirectoryOpen(!directoryOpen)}>
            第 {index + 1} / {pages.length} 页
          </button>
          <div className="manila-header-actions">
            <button type="button" aria-label="减小阅读字号" disabled={editing !== null || (active ? active.fontSize + zoom <= 12 : true)} onClick={() => setZoom(zoom - 1)}>A−</button>
            <button type="button" aria-label="增大阅读字号" disabled={editing !== null || (active ? active.fontSize + zoom >= 26 : true)} onClick={() => setZoom(zoom + 1)}>A+</button>
            <button type="button" aria-label="搜索档案" disabled={!!editing} onClick={() => setDirectoryOpen(!directoryOpen)}><Search size={17} /></button>
            <button type="button" aria-label="关闭档案盒" disabled={busy} onClick={() => requestNavigation(onClose)}><X size={18} /></button>
          </div>
        </header>
        {canEdit && !editing && <div className="manila-gm-tools">
          <button type="button" disabled={busy || allEntries.length >= ARCHIVE_ENTRY_LIMIT} onClick={() => startEdit(emptyEntry(category))}><Plus size={15} />新建一页</button>
          {active && <>
            <button type="button" disabled={busy} onClick={() => startEdit(active)}><Pencil size={15} />编辑本页</button>
            <button type="button" disabled={busy} onClick={() => void saveEntries(allEntries.map((entry) => entry.id === active.id
              ? { ...entry, visibility: entry.visibility === "public" ? "gm_only" : "public", updatedAt: new Date().toISOString() } : entry))}>
              {active.visibility === "public" ? <EyeOff size={15} /> : <Eye size={15} />}{active.visibility === "public" ? "设为机密" : "公开"}</button>
            {onPinToBoard && active.visibility === "public" && <button type="button" disabled={busy} onClick={async () => {
              setBusy(true); setError(""); try { await onPinToBoard(active); }
              catch (err) { setError(err instanceof Error ? err.message : "张贴失败"); } finally { setBusy(false); }
            }}><Send size={15} />贴到黑板</button>}
            <button type="button" disabled={busy} aria-label="删除本页" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></button>
          </>}
        </div>}
        {confirmDelete && active && <div className="manila-confirm" role="alert">
          <span>删除「{active.title}」？</span><button type="button" disabled={busy} onClick={async () => {
            if (await saveEntries(allEntries.filter((entry) => entry.id !== active.id))) setConfirmDelete(false);
          }}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>保留</button>
        </div>}
        {confirmDiscard && <div className="manila-confirm" role="alert">
          <span>本页有未保存修改。</span><button type="button" onClick={() => {
            setEditing(null); setConfirmDiscard(false); pendingAction.current?.(); pendingAction.current = null;
          }}>放弃修改</button><button type="button" onClick={() => { setConfirmDiscard(false); pendingAction.current = null; }}>继续编辑</button>
        </div>}
        {error && <p className="manila-error" role="alert">{error}</p>}
        <div className="manila-page-stage" ref={stageRef} onTouchStart={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("input,textarea,button") || editing) return;
          touchRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }} onTouchEnd={(event) => {
          const start = touchRef.current; touchRef.current = null;
          if (!start) return;
          const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) changePage(dx < 0 ? 1 : -1);
        }}>
          <div className="manila-page-scroll" ref={scrollRef}>
            {editing && canEdit ? <form className="manila-editor" onSubmit={(event) => void submit(event)} {...ime}>
              <fieldset disabled={busy}>
                <div className="manila-editor-heading"><strong>{allEntries.some((entry) => entry.id === editing.id) ? "编辑本页" : "新建一页"}</strong>
                  <select aria-label="档案分类" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value as ArchiveCategory })}>
                    {CATEGORIES.map((cat) => <option key={cat} value={cat}>{ARCHIVE_CATEGORY_META[cat].shortLabel}</option>)}
                  </select></div>
                <label className="manila-photo-upload">
                  {editing.imageUrl ? <CampaignImage src={editing.imageUrl} alt={editing.title || "档案照片"} /> : <><ImageIcon size={30} /><span>上传{editing.category === "character" ? "肖像" : "照片"}</span></>}
                  <input type="file" accept="image/*" aria-label="上传档案照片" disabled={!onUploadPhoto || busy} onChange={async (event) => {
                    const file = event.target.files?.[0]; event.target.value = ""; if (!file || !onUploadPhoto) return;
                    setBusy(true); setError(""); try { const url = await onUploadPhoto(blobToFile(await compressImage(file), file.name));
                      setEditing((current) => current ? { ...current, imageUrl: url } : current);
                    } catch (err) { setError(err instanceof Error ? err.message : "图片上传失败"); } finally { setBusy(false); }
                  }} />
                </label>
                {editing.imageUrl && <button type="button" onClick={() => setEditing({ ...editing, imageUrl: null })}>移除照片</button>}
                {field("title", labels.title)}{field("subtitle", labels.subtitle)}{field("dateLabel", "日期 / 最后目击")}
                {field("summary", "摘要", true)}{field("body", labels.body, true)}
                <label className="field"><span>标签</span><input aria-label="档案标签" value={tagsText} onChange={(event) => setTagsText(event.target.value)} maxLength={160} /></label>
                <label className="field"><span>正文字号 {editing.fontSize}px</span><input aria-label="档案正文字号" type="range" min={12} max={26} value={editing.fontSize}
                  onChange={(event) => setEditing({ ...editing, fontSize: Number(event.target.value) })} /></label>
                <div className="manila-editor-options">
                  <label><input type="checkbox" checked={editing.visibility === "public"} onChange={(event) => setEditing({ ...editing, visibility: event.target.checked ? "public" : "gm_only" })} />对玩家公开</label>
                  <label><input type="checkbox" checked={editing.pinned} onChange={(event) => setEditing({ ...editing, pinned: event.target.checked })} /><Pin size={14} />置顶</label>
                </div>
                <footer><button type="button" onClick={() => requestNavigation(() => setEditing(null))}>取消</button>
                  <button type="submit" className="publish-button" disabled={!editing.title.trim()}>保存本页</button></footer>
              </fieldset>
            </form> : active ? <ArchivePage entry={active} zoom={zoom} /> : <div className="manila-empty">
              <span className="manila-stamp">{ARCHIVE_CATEGORY_META[category].stamp}</span><h2>尚无{ARCHIVE_CATEGORY_META[category].shortLabel}</h2>
              {canEdit && <><button type="button" disabled={busy} onClick={() => startEdit(emptyEntry(category))}>新建此分类第一页</button>
                {allEntries.length === 0 && <button type="button" disabled={busy} onClick={async () => {
                  const examples = createStarterArchiveEntries();
                  if (await saveEntries(examples)) { setCategory("clue"); setSelectedId(examples[0].id); }
                }}>载入示例档案</button>}</>}
            </div>}
          </div>
          {turn && <div className={`manila-turning-page is-${turn.direction}`} aria-hidden="true">
            <ArchivePage entry={turn.direction === "next" ? turn.from : active ?? turn.from} zoom={zoom} />
          </div>}
          {!editing && <><button type="button" className="manila-page-corner is-prev" aria-label="页角上一页" disabled={index <= 0 || !!turn} onClick={() => changePage(-1)} />
            <button type="button" className="manila-page-corner is-next" aria-label="页角下一页" disabled={index >= pages.length - 1 || !!turn} onClick={() => changePage(1)} /></>}
          {directoryOpen && <aside className="manila-directory" aria-label="档案速查目录">
            <header><input type="search" autoFocus aria-label="搜索档案" placeholder="标题、正文、标签" value={query} onChange={(event) => setQuery(event.target.value)} />
              <button type="button" aria-label="关闭目录" onClick={() => setDirectoryOpen(false)}><X size={16} /></button></header>
            <div>{directoryEntries.map((entry) => <button type="button" key={entry.id} onClick={() => {
              setCategory(entry.category); setSelectedId(entry.id); setDirectoryOpen(false); setConfirmDelete(false);
            }}><small>{ARCHIVE_CATEGORY_META[entry.category].shortLabel}</small><strong>{entry.title}</strong>
              {entry.visibility === "gm_only" && <EyeOff size={14} />}</button>)}
              {!directoryEntries.length && <p>没有匹配档案</p>}</div>
          </aside>}
        </div>
        <footer className="manila-pagination">
          <button type="button" aria-label="上一页" disabled={!!editing || !!turn || index <= 0} onClick={() => changePage(-1)}><ChevronLeft size={17} />上一页</button>
          <div className="manila-page-dots">{pages.length <= 9 ? pages.map((entry, i) => <button key={entry.id} type="button" aria-label={`跳到第${i + 1}页`}
            aria-current={entry.id === active?.id ? "page" : undefined} disabled={!!editing || !!turn} onClick={() => setSelectedId(entry.id)} />)
            : <button type="button" disabled={!!editing} onClick={() => setDirectoryOpen(true)}>{index + 1} / {pages.length}</button>}</div>
          <button type="button" aria-label="下一页" disabled={!!editing || !!turn || index >= pages.length - 1} onClick={() => changePage(1)}>下一页<ChevronRight size={17} /></button>
        </footer>
      </div>
    </div>
  </PaperDialog>;
}
