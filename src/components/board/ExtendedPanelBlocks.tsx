import { ArrowDownWideNarrow, Dice5, Plus, Users, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { CampaignBoard } from "../../features/campaign/domain/types";
import type { CustomPanelBlock, CustomPanelInteraction, DiceMacroBlock, ImageMediaBlock, InitiativeTrackBlock, RollTableBlock } from "../../features/campaign/domain/customPanels";
import { requestBoardDiceMacro } from "../../features/dice/boardMacro";
import { blobToFile, compressImage } from "../../lib/imageCompress";
import { CampaignImage } from "./CampaignImage";

type ExtendedBlock = ImageMediaBlock | DiceMacroBlock | InitiativeTrackBlock | RollTableBlock;
export function isExtendedBlock(block: CustomPanelBlock): block is ExtendedBlock {
  return ["image_media", "dice_macro", "initiative_track", "roll_table"].includes(block.type);
}

export function ExtendedPanelBlockView({ block, board, canInteract, onInteract, onPostNote }: {
  block: ExtendedBlock; board?: CampaignBoard; canInteract: boolean;
  onInteract: (id: string, interaction: CustomPanelInteraction) => void;
  onPostNote?: (title: string, body: string) => Promise<unknown>;
}) {
  const [lightbox, setLightbox] = useState<ImageMediaBlock["images"][number] | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const act = (action: CustomPanelInteraction) => onInteract(block.id, action);
  return <div className={`hig-block hig-${block.type}-block`}>
    <div className="hig-block-header"><span className="hig-block-label">{block.label}</span>
      {block.type === "initiative_track" && <small>第 {block.round} 轮</small>}
    </div>
    {block.type === "image_media" && <>
      <div className={`atomic-media is-${block.layout}${block.images.length >= 6 ? " is-three-column" : ""}`}>
        {block.images.map((image) => <button type="button" key={image.id} onClick={() => setLightbox(image)} aria-label={`放大${image.caption || block.label}`}>
          <CampaignImage src={image.url} alt={image.caption || block.label} loading="lazy" draggable={false}
            style={{ aspectRatio: image.aspect === "auto" ? undefined : image.aspect.replace(":", "/") }} />
          {image.caption && <span>{image.caption}</span>}
        </button>)}
      </div>
      {!block.images.length && <p className="hig-empty-inline">暂无图片</p>}
      {lightbox && createPortal(<div className="atomic-image-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.caption || "图片详情"}
        tabIndex={-1} ref={(element) => element?.focus()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setLightbox(null); } }}
        onClick={() => setLightbox(null)}>
        <button type="button" aria-label="关闭图片" onClick={() => setLightbox(null)}><X /></button>
        <CampaignImage src={lightbox.url} alt={lightbox.caption} onClick={(event) => event.stopPropagation()} />
        {lightbox.caption && <p>{lightbox.caption}</p>}
      </div>, document.body)}
    </>}
    {block.type === "dice_macro" && <div className="atomic-macro-buttons">{block.macros.map((macro) =>
      <button type="button" key={macro.id} data-tone={macro.tone} disabled={!canInteract || !board}
        onClick={() => board && requestBoardDiceMacro({ campaignId: board.campaign.id, macro })}>
        <Dice5 size={16} /><strong>{macro.name}</strong><small>{macro.notation}</small>
      </button>)}</div>}
    {block.type === "initiative_track" && <>
      <ol className="atomic-initiative-list">{block.entries.map((entry, index) =>
        <li key={entry.id} data-active={index === block.activeIndex} data-acted={entry.acted}>
          <b>{entry.initiative}</b><span>{entry.name}{entry.isNpc && <small> NPC</small>}</span><small>{entry.hpNote}</small>
        </li>)}</ol>
      {canInteract && <div className="atomic-actions">
        <button type="button" onClick={() => act({ type: "sort_initiative" })} aria-label="按先攻排序"><ArrowDownWideNarrow size={15} />排序</button>
        <button type="button" onClick={() => act({ type: "import_initiative_members", entries: (board?.members ?? [])
          .filter((member) => member.active && member.role === "player")
          .map((member) => ({ id: member.userId, name: member.characterName, initiative: 0, isNpc: false })) })}><Users size={15} />导入玩家</button>
        <button type="button" disabled={!block.entries.length} onClick={() => act({ type: "next_initiative" })}>下一位 →</button>
      </div>}
    </>}
    {block.type === "roll_table" && <>
      <ul className="atomic-roll-table">{block.entries.map((entry) => <li key={entry.id} data-picked={entry.id === block.lastRolledId}>
        <span>{entry.text}</span>{entry.tag && <em>{entry.tag}</em>}
      </li>)}</ul>
      {canInteract && <div className="atomic-actions"><button type="button" disabled={!block.entries.length} onClick={() => act({ type: "roll_table" })}><Dice5 size={15} />随机抽取</button>
        {onPostNote && block.lastRolledId && <button type="button" disabled={posting} onClick={async () => {
          const picked = block.entries.find((entry) => entry.id === block.lastRolledId);
          if (!picked) return;
          setPosting(true); setError("");
          try { await onPostNote(block.label, picked.text); } catch (err) { setError(err instanceof Error ? err.message : "便签保存失败"); }
          finally { setPosting(false); }
        }}>贴成便签</button>}
      </div>}
      {error && <p role="alert">{error}</p>}
    </>}
  </div>;
}

export function AdditionalBlockFields({ block, onChange, onUploadPhoto }: {
  block: CustomPanelBlock; onChange: (next: CustomPanelBlock) => void;
  onUploadPhoto?: (file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const textInput = (label: string, value: string, change: (value: string) => void, maxLength = 120) =>
    <label><span>{label}</span><input aria-label={label} value={value} maxLength={maxLength} onChange={(event) => change(event.target.value)} /></label>;
  const numberInput = (label: string, value: number, change: (value: number) => void) =>
    <label><span>{label}</span><input aria-label={label} type="number" value={value} onChange={(event) => change(Number(event.target.value))} /></label>;
  const optionInput = (label: string, value: string, options: Record<string, string>, change: (value: string) => void) =>
    <label><span>{label}</span><select aria-label={label} value={value} onChange={(event) => change(event.target.value)}>
      {Object.entries(options).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>;
  const removeButton = (action: () => void) => <button type="button" aria-label="移除条目" onClick={action}><X size={14} /></button>;
  return <div className="hig-block-fields atomic-extra-fields">
    {block.type === "choice_selector" && optionInput("显示方式", block.display ?? "auto",
      { auto: "自动", segmented: "分段选项", dropdown: "下拉框" }, (value) => onChange({ ...block, display: value as typeof block.display }))}
    {block.type === "meter_counter" && <>
      {optionInput("计量样式", block.variant ?? "stepper", { stepper: "步进数值", bar: "血条 / 进度条", pips: "离散点槽", bipolar: "双向声望轴" },
        (value) => onChange({ ...block, variant: value as typeof block.variant }))}
      {numberInput("下限", block.min, (min) => onChange({ ...block, min }))}
      {numberInput("步长", block.step, (step) => onChange({ ...block, step }))}
      <label><span>计量颜色</span><input type="color" value={block.color ?? "#b24b37"} onChange={(event) => onChange({ ...block, color: event.target.value })} /></label>
    </>}
    {block.type === "task_board" && <>
      {optionInput("任务类型", block.variant ?? "quest", { quest: "委托", bounty: "悬赏", wanted: "通缉", objective: "调查目标" }, (value) => onChange({ ...block, variant: value as typeof block.variant }))}
      {block.items.map((item, index) => <fieldset key={item.id}><legend>{item.title || `任务 ${index + 1}`}</legend>
        {(["detail", "reward", "badge", "assignee", "imageUrl"] as const).map((key) => textInput(
          { detail: "详情", reward: "报酬", badge: "角标", assignee: "认领人", imageUrl: "肖像链接" }[key], item[key] ?? "",
          (value) => onChange({ ...block, items: block.items.map((entry, i) => i === index ? { ...entry, [key]: value } : entry) }),
          key === "imageUrl" ? 2000 : key === "detail" ? 160 : 80))}
        {optionInput("状态", item.status, { open: "待接取", in_progress: "进行中", completed: "完成" }, (value) =>
          onChange({ ...block, items: block.items.map((entry, i) => i === index ? { ...entry, status: value as typeof item.status } : entry) }))}
      </fieldset>)}
    </>}
    {block.type === "note_text" && numberInput("说明字号", block.fontSize ?? 15, (fontSize) => onChange({ ...block, fontSize }))}
    {isExtendedBlock(block) && textInput("积木标题", block.label, (label) => onChange({ ...block, label }), 40)}
    {block.type === "image_media" && <>
      {optionInput("图片布局", block.layout, { hero: "主图", grid: "照片墙", polaroid: "拍立得" }, (value) => onChange({ ...block, layout: value as typeof block.layout }))}
      {block.images.map((image, index) => <fieldset key={image.id}><legend>图片 {index + 1}</legend>
        {textInput("图片链接", image.url, (url) => onChange({ ...block, images: block.images.map((entry, i) => i === index ? { ...entry, url } : entry) }), 2000)}
        {textInput("图注", image.caption, (caption) => onChange({ ...block, images: block.images.map((entry, i) => i === index ? { ...entry, caption } : entry) }))}
        {optionInput("图片比例", image.aspect, { auto: "原始比例", "16:9": "16:9", "4:3": "4:3", "1:1": "1:1" }, (value) =>
          onChange({ ...block, images: block.images.map((entry, i) => i === index ? { ...entry, aspect: value as typeof image.aspect } : entry) }))}
        {removeButton(() => onChange({ ...block, images: block.images.filter((_, i) => i !== index) }))}
      </fieldset>)}
      {block.images.length < 9 && <>
        <button type="button" onClick={() => onChange({ ...block, images: [...block.images, { id: crypto.randomUUID(), url: "", caption: "", aspect: "auto" }] })}><Plus size={14} />添加图片链接</button>
        {onUploadPhoto && <label className="atomic-upload"><span>{uploading ? "上传中…" : "上传图片"}</span><input type="file" accept="image/*" disabled={uploading} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return; setUploading(true); setError("");
          try { const url = await onUploadPhoto(blobToFile(await compressImage(file), file.name));
            onChange({ ...block, images: [...block.images, { id: crypto.randomUUID(), url, caption: "", aspect: "auto" }] });
          } catch (err) { setError(err instanceof Error ? err.message : "上传失败"); } finally { setUploading(false); }
        }} /></label>}
      </>}
    </>}
    {block.type === "dice_macro" && <>
      {block.macros.map((macro, index) => <fieldset key={macro.id}><legend>检定 {index + 1}</legend>
        {textInput("检定名称", macro.name, (name) => onChange({ ...block, macros: block.macros.map((entry, i) => i === index ? { ...entry, name } : entry) }), 40)}
        {textInput("骰子公式", macro.notation, (notation) => onChange({ ...block, macros: block.macros.map((entry, i) => i === index ? { ...entry, notation } : entry) }))}
        {optionInput("结果可见性", macro.visibility ?? "public", { public: "全员", gm: "我和 GM", self: "仅自己" }, (value) =>
          onChange({ ...block, macros: block.macros.map((entry, i) => i === index ? { ...entry, visibility: value as typeof macro.visibility } : entry) }))}
        {removeButton(() => onChange({ ...block, macros: block.macros.filter((_, i) => i !== index) }))}
      </fieldset>)}
      {block.macros.length < 12 && <button type="button" onClick={() => onChange({ ...block, macros: [...block.macros, { id: crypto.randomUUID(), name: "新检定", notation: "1d20", visibility: "public" }] })}>添加检定</button>}
    </>}
    {block.type === "initiative_track" && <>
      {numberInput("当前轮次", block.round, (round) => onChange({ ...block, round }))}
      {block.entries.map((entry, index) => <fieldset key={entry.id}><legend>行动者 {index + 1}</legend>
        {textInput("姓名", entry.name, (name) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, name } : item) }), 48)}
        {numberInput("先攻值", entry.initiative, (initiative) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, initiative } : item) }))}
        {textInput("生命 / 备注", entry.hpNote ?? "", (hpNote) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, hpNote } : item) }), 40)}
        <label><span>NPC</span><input type="checkbox" checked={Boolean(entry.isNpc)} onChange={(event) =>
          onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, isNpc: event.target.checked } : item) })} /></label>
        {removeButton(() => onChange({ ...block, entries: block.entries.filter((_, i) => i !== index) }))}
      </fieldset>)}
      {block.entries.length < 30 && <button type="button" onClick={() => onChange({ ...block, entries: [...block.entries, { id: crypto.randomUUID(), name: "新行动者", initiative: 0 }] })}>添加行动者</button>}
    </>}
    {block.type === "roll_table" && <>
      {block.entries.map((entry, index) => <fieldset key={entry.id}><legend>条目 {index + 1}</legend>
        {textInput("内容", entry.text, (text) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, text } : item) }), 400)}
        {numberInput("权重", entry.weight ?? 1, (weight) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, weight } : item) }))}
        {textInput("标签", entry.tag ?? "", (tag) => onChange({ ...block, entries: block.entries.map((item, i) => i === index ? { ...item, tag } : item) }), 24)}
        {removeButton(() => onChange({ ...block, entries: block.entries.filter((_, i) => i !== index) }))}
      </fieldset>)}
      {block.entries.length < 50 && <button type="button" onClick={() => onChange({ ...block, entries: [...block.entries, { id: crypto.randomUUID(), text: "新条目", weight: 1 }] })}>添加随机条目</button>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function MeterVisual({ block, canInteract, onSetValue }: {
  block: Extract<CustomPanelBlock, { type: "meter_counter" }>; canInteract: boolean; onSetValue: (value: number) => void;
}) {
  const pct = ((block.value - block.min) / Math.max(1, block.max - block.min)) * 100;
  const variant = block.variant ?? "stepper";
  const slots = Math.ceil((block.max - block.min) / block.step);
  return <div className={`atomic-meter is-${variant}`} style={{ "--meter-color": block.color ?? "#b24b37" } as CSSProperties}>
    {variant === "pips" && slots <= 12 ? <div className="atomic-pips" role="group" aria-label={block.label}>
      {Array.from({ length: slots }, (_, i) => <button type="button" key={i} aria-label={`${block.label}设为${Math.min(block.max, block.min + (i + 1) * block.step)}`}
        disabled={!canInteract} data-filled={block.value >= Math.min(block.max, block.min + (i + 1) * block.step)}
        onClick={() => onSetValue(block.value === block.min + (i + 1) * block.step ? block.min + i * block.step : Math.min(block.max, block.min + (i + 1) * block.step))} />)}
    </div> : variant === "stepper" ? <div className="hig-meter-track" aria-hidden="true"><span className="hig-meter-fill" style={{ width: `${pct}%` }} /></div>
      : <><input type="range" aria-label={`${block.label}计量`} min={block.min} max={block.max} step={block.step} value={block.value}
        disabled={!canInteract} onChange={(event) => onSetValue(Number(event.target.value))} />
        {variant === "bipolar" && <div className="atomic-axis-labels"><span>{block.min}</span><span>0</span><span>+{block.max}</span></div>}
      </>}
  </div>;
}
