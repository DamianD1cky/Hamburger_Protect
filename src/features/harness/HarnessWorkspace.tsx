import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock3, LockKeyhole, Minus, Plus, Sparkles, X } from "lucide-react";
import type { CampaignBoard } from "../campaign/domain/types";
import { backend } from "../../lib/backend";
import { applyOperations, canEdit, describeOperation, newBlock, templateOperations, type Block, type Command, type HarnessBoard, type HarnessRole, type Operation } from "./model";
import { commitHarness, getHarness, harnessError, proposeWithAgent } from "./repository";
import "./harness.css";

const kindLabel = { note: "说明", counter: "资源计数", clock: "进度钟" };

export function HarnessWorkspace({ campaign, onClose }: { campaign: CampaignBoard; onClose: () => void }) {
  const local = backend === "local";
  const [demoRole, setDemoRole] = useState<HarnessRole>("gm");
  const role = local ? demoRole : campaign.viewer.role;
  const [tab, setTab] = useState<"board" | "agent">("board");
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [proposal, setProposal] = useState<{ command: Command; summary: string } | null>(null);
  const [editing, setEditing] = useState<{ block: Block; revision: number } | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const lock = useRef(false);
  const queryClient = useQueryClient();
  const queryKey = ["harness-board", backend, campaign.viewer.id, campaign.campaign.id, role];
  const query = useQuery({
    queryKey,
    queryFn: () => getHarness(campaign.campaign.id, role),
    refetchInterval: local ? 1000 : 3000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const board = query.data;
  const writable = Boolean(board && board.schema === 1 && !query.error && (local || online) && role !== "observer" && !busy);
  const preview = (operations: Operation[], summary: string, revision = board?.revision) => {
    if (!board || revision === undefined) return;
    try {
      if (revision !== board.revision) throw new Error("HARNESS_CONFLICT");
      applyOperations(board, operations, role);
      setProposal({ command: { id: crypto.randomUUID(), revision, operations }, summary });
      setRetryId(null);
      setNotice("");
      setTab("agent");
    } catch (error) { setNotice(harnessError(error)); }
  };
  const commit = async (command: Command) => {
    if (lock.current || !writable) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const next = await commitHarness(campaign.campaign.id, role, command);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, next);
      setProposal(null);
      setRetryId(null);
      setEditing(null);
      setAdding(false);
      setNotice("修改已保存。");
    } catch (error) {
      setNotice(harnessError(error));
      if (String(error).includes("HARNESS_CONFLICT")) { setProposal(null); setRetryId(null); }
      else setRetryId(command.id);
      await query.refetch();
    } finally { lock.current = false; setBusy(false); }
  };
  const submit = (operations: Operation[]) => {
    if (board) preview(operations, "确认本次修改", editing?.revision ?? board.revision);
  };
  const ask = async () => {
    if (!board || !prompt.trim() || thinking) return;
    setThinking(true);
    setNotice("");
    try {
      const result = await proposeWithAgent(campaign.campaign.id, prompt.trim());
      // Refetch after inference; the returned proposal is bound to the server's base revision.
      const current = await query.refetch();
      if (current.error) throw current.error;
      if (!current.data || current.data.revision !== result.revision) throw new Error("HARNESS_CONFLICT");
      if (result.operations.length === 0) {
        setProposal(null);
        setNotice(result.summary);
        return;
      }
      applyOperations(current.data, result.operations, role);
      setProposal({ command: { id: crypto.randomUUID(), revision: result.revision, operations: result.operations }, summary: result.summary });
      setRetryId(null);
    } catch (error) { setNotice(harnessError(error)); }
    finally { setThinking(false); }
  };
  return (
    <main className="harness" aria-label="跑团工作台">
      <header className="harness-header">
        <button className="harness-icon" onClick={onClose} aria-label="返回汉堡店公告板"><ArrowLeft size={20} /></button>
        <div className="harness-brand"><span>TABLE / 跑团工作台</span><h1>{campaign.campaign.name}</h1></div>
        <span className={`harness-status ${!online && !local ? "is-offline" : ""}`}>
          {local ? "本机演示 · 不跨设备联机" : !online ? "离线 · 共享修改暂停" : query.error ? "同步失败" : "云端房间 · 每 3 秒同步"}
        </span>
        <div className="harness-identity">
          {local ? <label>演示身份<select aria-label="演示身份" value={role} disabled={busy || thinking} onChange={e => {
            setDemoRole(e.target.value as HarnessRole); setProposal(null); setEditing(null); setAdding(false); setNotice("");
          }}><option value="gm">GM</option><option value="player">玩家</option><option value="observer">观察者</option></select></label>
            : <span>{campaign.viewer.displayName} · {role === "gm" ? "GM" : role === "player" ? "玩家" : "观察者"}</span>}
        </div>
      </header>
      <nav className="harness-mobile-tabs" aria-label="工作区">
        <button aria-current={tab === "board" ? "page" : undefined} onClick={() => setTab("board")}>公告板</button>
        <button aria-current={tab === "agent" ? "page" : undefined} onClick={() => setTab("agent")}>助手{proposal ? " · 待应用" : ""}</button>
      </nav>
      {notice && <p className="harness-banner" role="status">{notice}</p>}
      <div className="harness-layout" data-tab={tab}>
        <section className="harness-board-pane" aria-label="组件公告板">
          <div className="harness-section-heading">
            <div><span className="harness-eyebrow">SHARED WORKSPACE</span><h2>本场公告板 <small>{board?.blocks.length ?? 0}</small></h2></div>
            {role === "gm" && <button className="harness-primary" disabled={!writable} onClick={() => { setAdding(true); setEditing(null); }}><Plus size={16} />添加组件</button>}
          </div>
          {query.isPending && <p role="status">正在读取房间…</p>}
          {query.error && <div className="harness-notice" role="alert">{harnessError(query.error)} <button onClick={() => void query.refetch()}>重新连接</button></div>}
          {board?.schema !== undefined && board.schema !== 1 && <p role="alert">此房间使用更新的组件协议，请更新 App。</p>}
          {(adding || editing) && board && !query.error && (
            <BlockEditor key={editing?.block.id ?? "new"} block={editing?.block ?? null} role={role} disabled={!writable}
              onCancel={() => { setAdding(false); setEditing(null); }} onSubmit={submit} />
          )}
          {board && !query.error && board.blocks.length === 0 && (
            <div className="harness-empty"><span>01 / 开始这一场</span><h3>{role === "gm" ? "把规则放上桌。" : "等待 GM 布置公告板。"}</h3>
              <p>{role === "gm" ? "先选一个模板，或添加你自己的组件。同类组件可以放很多个。" : "GM 发布的说明、资源和进度会显示在这里。"}</p>
              {role === "gm" && <div className="harness-templates">{(["调查", "潜入", "汉堡店"] as const).map(theme =>
                <button disabled={!writable} key={theme} onClick={() => preview(templateOperations(theme), `添加${theme}模板，保留已有组件`)}>{theme}<ArrowRight size={16} /></button>)}</div>}
            </div>
          )}
          {board && !query.error && <div className="harness-blocks">{board.blocks.map((block, i) => (
            <article className={`harness-block harness-block-${block.kind}`} key={block.id}>
              <div className="harness-block-meta"><span>{String(i + 1).padStart(2, "0")} / {kindLabel[block.kind]}</span>
                <span>{block.visibility === "gm" ? <><LockKeyhole size={12} /> GM 私密</> : block.editable === "players" ? "玩家可操作" : "GM 维护"}</span></div>
              <h3>{block.title}</h3>
              {block.kind === "note" ? <p className="harness-note-text">{block.text || "还没有填写内容。"}</p> : <>
                <div className="harness-counter"><strong>{block.value}</strong><span>/ {block.max}</span></div>
                <div className="harness-meter" role="progressbar" aria-label={block.title} aria-valuenow={block.value} aria-valuemin={0} aria-valuemax={block.max}>
                  <span style={{ width: `${block.value / block.max * 100}%` }} />
                </div>
                {block.kind === "clock" && <span className="harness-clock-label"><Clock3 size={14} />{block.value === block.max ? "进度已满" : `还剩 ${block.max - block.value} 格`}</span>}
              </>}
              <div className="harness-block-actions">
                {canEdit(role, block) && block.kind !== "note" && <>
                  <button disabled={!writable || block.value <= 0} aria-label={`${block.title}减少 1`} onClick={() => submit([{ type: "adjust", id: block.id, delta: -1 }])}><Minus size={16} /></button>
                  <button disabled={!writable || block.value >= block.max} aria-label={`${block.title}增加 1`} onClick={() => submit([{ type: "adjust", id: block.id, delta: 1 }])}><Plus size={16} /></button>
                </>}
                {canEdit(role, block) && (role === "gm" || block.kind === "note") && <button disabled={!writable} onClick={() => { setEditing({ block, revision: board.revision }); setAdding(false); }}>{role === "gm" ? "编辑" : "填写"}</button>}
              </div>
            </article>
          ))}</div>}
        </section>
        <aside className="harness-agent-pane" aria-label="房间助手">
          <div className="harness-agent-heading"><Sparkles size={20} /><h2>{role === "gm" ? "搭板助手" : "我的助手"}</h2><span>AGENT</span></div>
          <p className="harness-agent-intro">{role === "gm" ? "描述你要搭建或调整的公告板，检查修改后再应用。" : "描述要调整的资源或说明。助手只能操作 GM 授权的组件。"}</p>
          <label className="harness-prompt-label" htmlFor="harness-prompt">这次想做什么？</label>
          <textarea id="harness-prompt" value={prompt} maxLength={2000} onChange={e => setPrompt(e.target.value)}
            placeholder={role === "gm" ? "添加一个六格警戒钟和十份补给，允许玩家领取补给。" : "把公共补给减少一份。"} />
          <button className="harness-primary" disabled={!writable || thinking || !prompt.trim()} onClick={() => void ask()}><Sparkles size={16} />{thinking ? "正在生成…" : "生成修改预览"}</button>
          <p className="harness-provider-note">{local ? "AI 未连接。下方模板为内置演示，不调用模型。" : "仅将你可见的组件发送给房间配置的模型服务。"}</p>
          {role === "gm" && <div className="harness-template-list"><span>从模板开始</span>{(["调查", "潜入", "汉堡店"] as const).map(theme =>
            <button key={theme} disabled={!writable} onClick={() => preview(templateOperations(theme), `添加${theme}模板，保留已有组件`)}>{theme}<Plus size={15} /></button>)}</div>}
          {proposal && board && !query.error && <div className="harness-proposal">
            <div className="harness-proposal-title"><h3>修改预览</h3><button aria-label="取消修改" disabled={busy} onClick={() => setProposal(null)}><X size={16} /></button></div>
            <p>{proposal.summary}</p>
            <ol>{proposal.command.operations.map((op, i) => <li key={i}>
              <strong>{describeOperation(op, board)}</strong>
              <OperationDetail op={op} board={board} />
            </li>)}</ol>
            {proposal.command.revision !== board.revision && retryId !== proposal.command.id && <p role="alert">房间已更新，请取消后重新生成。</p>}
            <button className="harness-primary" disabled={!writable || (proposal.command.revision !== board.revision && retryId !== proposal.command.id)} onClick={() => void commit(proposal.command)}><Check size={16} />{busy ? "正在保存…" : retryId === proposal.command.id ? "重试本次修改" : "应用修改"}</button>
            <small>失败后可重试同一操作，不会重复扣减。</small>
          </div>}
          <footer>由 {role === "gm" ? "GM" : "你"} 确认 · 由房间校验<br />特殊规则与剧情裁决交给 GM</footer>
        </aside>
      </div>
    </main>
  );
}

function OperationDetail({ op, board }: { op: Operation; board: HarnessBoard }) {
  const block = op.type === "create" ? op.block : board.blocks.find(b => b.id === op.id);
  if (op.type === "create") return <small>{kindLabel[op.block.kind]} · {op.block.visibility === "gm" ? "GM 私密" : "团内可见"} · {op.block.editable === "players" ? "玩家可操作" : "GM 维护"}<br />{op.block.kind === "note" ? op.block.text : `${op.block.value} / ${op.block.max}`}</small>;
  if (op.type === "configure") return <small>名称：{op.title} · 上限：{op.max}<br />{op.visibility === "gm" ? "GM 私密" : "团内可见"} · {op.editable === "players" ? "玩家可操作" : "GM 维护"}；保留当前数值</small>;
  if (op.type === "write") return <small className="harness-preview-text">{op.text || "（清空内容）"}</small>;
  if (op.type === "adjust") return <small>{block?.value} → {(block?.value ?? 0) + op.delta}</small>;
  return <small>组件及其现有数据会被移除。</small>;
}

function BlockEditor({ block, role, disabled, onCancel, onSubmit }: {
  block: Block | null; role: HarnessRole; disabled: boolean; onCancel: () => void; onSubmit: (ops: Operation[]) => void;
}) {
  const [draft, setDraft] = useState(() => block ? { ...block } : newBlock("note", ""));
  const gm = role === "gm";
  return <form className="harness-editor" onSubmit={event => {
    event.preventDefault();
    const operations: Operation[] = !block ? [{ type: "create", block: draft }] : [
      ...(gm ? [{ type: "configure" as const, id: block.id, title: draft.title, max: draft.max, visibility: draft.visibility, editable: draft.editable }] : []),
      ...(block.kind === "note" ? [{ type: "write" as const, id: block.id, text: draft.text }] : []),
    ];
    if (operations.length) onSubmit(operations);
  }}>
    <div className="harness-proposal-title"><h3>{block ? "编辑组件" : "添加组件"}</h3><button type="button" onClick={onCancel} aria-label="关闭组件编辑"><X size={18} /></button></div>
    {!block && <label>组件类型<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Block["kind"], max: e.target.value === "clock" ? 6 : 10 })}>
      <option value="note">说明</option><option value="counter">资源计数</option><option value="clock">进度钟</option></select></label>}
    {gm && <label>名称<input required maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>}
    {draft.kind === "note" ? <label>内容<textarea aria-label="内容" maxLength={8000} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label>
      : gm && <div className="harness-form-row"><label>上限<input type="number" min={Math.max(1, draft.value)} max={1000000} required value={draft.max} onChange={e => setDraft({ ...draft, max: Number(e.target.value) })} /></label>
        {!block && <label>初始数值<input type="number" min={0} max={draft.max} required value={draft.value} onChange={e => setDraft({ ...draft, value: Number(e.target.value) })} /></label>}</div>}
    {gm && <div className="harness-form-row"><label>谁能看到<select value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as Block["visibility"] })}><option value="members">团内成员</option><option value="gm">仅 GM</option></select></label>
      <label>谁能操作<select value={draft.editable} onChange={e => setDraft({ ...draft, editable: e.target.value as Block["editable"] })}><option value="gm">仅 GM</option><option value="players">GM 和玩家</option></select></label></div>}
    <div className="harness-form-row"><button className="harness-primary" disabled={disabled}>预览修改</button>
      {block && gm && <button type="button" disabled={disabled} onClick={() => onSubmit([{ type: "remove", id: block.id }])}>移除组件…</button>}</div>
  </form>;
}
