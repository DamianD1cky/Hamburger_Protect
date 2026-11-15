import { Dice5, RotateCcw, BookmarkPlus, Users, Trash2, Volume2, X, Plus, History, SlidersHorizontal, Eye, Ellipsis } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CampaignBoard } from "../campaign/domain/types";
import { backend } from "../../lib/backend";
import { DiceLayer } from "./DiceLayer";
import { DiceFanMenu, type DiceFanAction } from "./DiceFanMenu";
import { DicePopover, dicePopoverAnchor, type DicePopoverAnchor } from "./DicePopover";
import { DiceResult } from "./DiceResult";
import { DiceMembers } from "./DiceMembers";
import { useDiceSocial } from "./useDiceSocial";
import type { TrayDie } from "./trayModels";
import type { DiceSelection, DiceSceneHandle } from "./DiceScene";
import type { ThrowLaunch } from "./trayPhysics";
import { expandDiceSelection, replaceTrayDice, rollTrayDice, standardDice, trayNotation } from "./traySelection";
import { useDice } from "./useDice";
import {
  closeDiceCheck, createDiceCheck, deleteDicePreset, getDiceState,
  revealDice, saveDicePreset,
} from "./repository";
import { diceVisibilityLabels, type DiceRoll, type DiceVisibility, type RollInput } from "./types";
const DiceScene = lazy(() => import("./DiceScene").then((m) => ({ default: m.DiceScene })));
const errorMessage = (error: unknown) => {
  const text = error instanceof Error ? error.message : "操作失败，请重试。";
  const messages: Record<string, string> = {
    DICE_RATE_LIMIT: "投掷太频繁，请稍后重试。",
    DICE_CHECK_NOT_AVAILABLE: "检定已结束，或你不在参与名单中。",
    DICE_CHECK_TARGETS_REQUIRED: "请选择至少一位玩家。",
    DICE_ACCESS_REQUIRED: "你没有查看或操作这条记录的权限。",
    DICE_REQUEST_CONFLICT: "重试内容已变化，请先完成上次投掷。",
  };
  return messages[text] ?? text;
};
function playSound() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle"; oscillator.frequency.setValueAtTime(350, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(120, audio.currentTime + 0.09);
    gain.gain.setValueAtTime(0.07, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + 0.14);
    oscillator.onended = () => void audio.close();
  } catch { /* Audio is optional; never block a result. */ }
}
const preferenceKey = "hp-dice-presentation";
export function DiceWorkspace({ board }: { board: CampaignBoard }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"roll" | "checks">("roll");
  const [notation, setNotation] = useState("1d6");
  const [label, setLabel] = useState("");
  const [visibility, setVisibility] = useState<DiceVisibility>("public");
  const [quantity, setQuantity] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [busy, setBusy] = useState(false);
  const [casting, setCasting] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [panel, setPanel] = useState<"settings" | "history" | "checks" | null>(null);
  const [panelAnchor, setPanelAnchor] = useState<DicePopoverAnchor | null>(null);
  const [panelFromSelection, setPanelFromSelection] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addAnchor, setAddAnchor] = useState<DicePopoverAnchor | null>(null);
  const [addFromSelection, setAddFromSelection] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState<DicePopoverAnchor | null>(null);
  const [selection, setSelection] = useState<DiceSelection | null>(null);
  const [selectionSettings, setSelectionSettings] = useState({
    modifier: 0, label: "", visibility: "public" as DiceVisibility,
  });
  const selectionScope = useRef("");
  const [trayDice, setTrayDice] = useState<TrayDie[]>(() => [
    { id: crypto.randomUUID(), sides: 6, value: null, kept: true },
  ]);
  const [throwId, setThrowId] = useState<string | null>(null);
  const [throwLaunch, setThrowLaunch] = useState<ThrowLaunch | null>(null);
  const scene = useRef<DiceSceneHandle | null>(null);
  const launches = useRef(new Map<string, ThrowLaunch>());
  // Bind the replacement scope to its request, including uncertain retries.
  // Another result arriving through Realtime cannot consume this selection.
  const replacements = useRef(new Map<string, string[]>());
  const [error, setError] = useState("");
  const [last, setLast] = useState<DiceRoll | null>(null);
  const [notice, setNotice] = useState<DiceRoll | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [shared, setShared] = useState(false);
  const [checkTitle, setCheckTitle] = useState("");
  const [targets, setTargets] = useState<string[]>(() =>
    board.members.filter((m) => m.active && m.role === "player").map((m) => m.userId));
  const [preferences, setPreferences] = useState(() => {
    try { return JSON.parse(localStorage.getItem(preferenceKey) ?? "{}") as { three?: boolean; sound?: boolean; skin?: string }; }
    catch { return {}; }
  });
  const pending = useRef<RollInput | null>(null);
  const noticeTimer = useRef(0);
  const active = board.campaign.status === "active";
  const gm = board.viewer.role === "gm";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const social = useDiceSocial(board, open);
  const dice = useDice(board, (roll) => {
    setNotice(roll);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
    if (preferences.sound && roll.result) playSound();
    if (roll.actor_id === board.viewer.id) {
      setLast(roll);
      showRoll(roll);
    }
  });
  function showRoll(roll: DiceRoll) {
    const replacing = replacements.current.get(roll.id);
    replacements.current.delete(roll.id);
    setThrowLaunch(launches.current.get(roll.id) ?? null);
    launches.current.delete(roll.id);
    setTrayDice((current) => replaceTrayDice(current, replacing,
      rollTrayDice(roll, replacing ? current.filter((die) => replacing.includes(die.id)) : undefined)));
    setThrowId(`${roll.id}:${performance.now()}`);
    setSelection(null); setPanel(null);
  }
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    if (!selection) selectionScope.current = "";
  }, [selection]);
  useEffect(() => {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  }, [preferences]);
  const operation = async (run: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await run(); await dice.refetch(); return true; }
    catch (cause) { setError(errorMessage(cause)); return false; }
    finally { setBusy(false); }
  };
  const submitRoll = (overrides?: Partial<RollInput>, selectedIds?: string[], launch?: ThrowLaunch) => operation(async () => {
    setCasting(true);
    const retrying = pending.current !== null;
    const input = pending.current ?? {
      requestId: crypto.randomUUID(), notation, label, visibility, ...overrides,
    };
    if (!retrying && selectedIds) replacements.current.set(input.requestId, selectedIds);
    if (!retrying && launch) launches.current.set(input.requestId, launch);
    pending.current = input;
    try {
      await dice.roll(input);
      pending.current = null;
    } finally { setCasting(false); }
  });
  const quickDie = (sides: number) => {
    pending.current = null;
    setNotation(`${quantity}d${sides}${modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : ""}`);
  };
  const stageDie = (sides: TrayDie["sides"]) => {
    if (busy || rolling || !active) return;
    const types: TrayDie["sides"][] = sides === 100 ? [100, 10] : [sides];
    if (trayDice.length + types.length > 20) { setError("骰盘最多摆放 20 颗，更多骰子请用公式投掷。"); return; }
    const poses = scene.current?.allocate(types);
    if (!poses) { setError("骰盘空位不足，请先移出一些骰子。"); return; }
    const id = crypto.randomUUID();
    setTrayDice((current) => [...current, ...types.map((type, index) => ({
      id: index ? `${id}:units` : id, sides: type, value: null, kept: true, initialPose: poses[index],
    }))]);
    setError("");
    setSelection(null); setAddOpen(false); setThrowId(null);
  };
  const castTray = (selected?: TrayDie[], launch?: ThrowLaunch) => {
    const settings = selected ? selectionSettings : { modifier, label, visibility };
    const previous = new Set(selected?.map((die) => die.rollId).filter((id) => id !== undefined));
    return submitRoll({
      notation: trayNotation(selected ?? trayDice, settings.modifier),
      label: settings.label, visibility: settings.visibility,
      ...(previous.size === 1 ? { parentId: [...previous][0] } : {}),
    }, selected?.map((die) => die.id), launch);
  };
  const canReveal = (roll: DiceRoll) => roll.result && !roll.revealed_at && roll.visibility !== "public" &&
    (roll.visibility === "self" ? roll.actor_id === board.viewer.id :
      roll.visibility === "blind" ? gm : gm || roll.actor_id === board.viewer.id);
  const rows = dice.data?.rolls.slice(0, 50) ?? [];
  const [older, setOlder] = useState<DiceRoll[]>([]);
  const [more, setMore] = useState(true);
  const checks = dice.data?.checks ?? [];
  const awaiting = checks.filter((check) => check.open &&
    check.targets.some((t) => t.id === board.viewer.id) && !check.responses[board.viewer.id]).length;

  const selectedDice = trayDice.filter((die) => selection?.ids.includes(die.id));
  const selectedDie = selectedDice.length === 1 ? selectedDice[0] : undefined;
  const selectedLocked = selectedDice.some((die) => die.rollId !== undefined && die.value === null);
  const selectionPanel = panel === "settings" && selectedDice.length > 0;
  const selectDice = (next: DiceSelection | null) => {
    const ids = next ? expandDiceSelection(trayDice, next.ids) : [];
    const normalized = next && ids.length ? { ...next, ids } : null;
    const scope = ids.join("|");
    if (normalized && scope !== selectionScope.current) {
      setSelectionSettings({ modifier, label, visibility });
    }
    selectionScope.current = scope;
    setSelection((current) => {
      if (!normalized) return current ? null : current;
      if (current && current.ids.join("|") === ids.join("|") &&
        Math.abs(current.x - normalized.x) < .1 && Math.abs(current.y - normalized.y) < .1 &&
        !!current.dragging === !!normalized.dragging) return current;
      return normalized;
    });
  };
  const selectedRoll = selectedDie?.rollId
    ? [...rows, ...older].find((roll) => roll.id === selectedDie.rollId) : null;
  const changePanel = (next: typeof panel, preserveSelection: boolean, trigger: HTMLButtonElement) => {
    const selectedBounds = preserveSelection
      ? [...(trigger.closest(".dice-stage")?.querySelectorAll<HTMLElement>(".dice-pick-target") ?? [])]
        .filter((target) => selection?.ids.includes(target.dataset.dieId ?? "")).map((target) => target.getBoundingClientRect())
      : [];
    setPanelAnchor(dicePopoverAnchor(trigger, selectedBounds.length ? {
      left: Math.min(...selectedBounds.map((rect) => rect.left)) - 20,
      top: Math.min(...selectedBounds.map((rect) => rect.top)) - 20,
      right: Math.max(...selectedBounds.map((rect) => rect.right)) + 20,
      bottom: Math.max(...selectedBounds.map((rect) => rect.bottom)) + 20,
    } : undefined));
    setPanelFromSelection(preserveSelection);
    setPanel((current) => current === next ? null : next);
    if (!preserveSelection) setSelection(null);
    setAddOpen(false); setToolsAnchor(null);
    if (next === "checks") setTab("checks");
    if (next === "settings") setTab("roll");
  };
  const openAdd = (button: HTMLButtonElement, fromSelection: boolean) => {
    setAddAnchor(dicePopoverAnchor(button));
    setAddFromSelection(fromSelection);
    setAddOpen(true); setToolsAnchor(null); setPanel(null); setError("");
    if (!fromSelection) setSelection(null);
  };
  const addAction: DiceFanAction = {
    id: "add", label: "加一颗", accessibleLabel: "选择新增骰型",
    icon: <Plus size={25} />, disabled: busy || rolling || !active,
    onClick: (button) => openAdd(button, true),
  };
  const fanActions: DiceFanAction[] = selectedDice.length > 1 ? [
    {
      id: "roll", label: "投掷", accessibleLabel: `投掷选中的 ${selectedDice.length} 颗骰子`,
      icon: <Dice5 size={25} />, tone: "primary",
      disabled: busy || rolling || !active || selectedLocked,
      onClick: () => castTray(selectedDice),
    },
    addAction,
    {
      id: "settings", label: "设置", accessibleLabel: "统一设置选中骰子",
      icon: <SlidersHorizontal size={23} />,
      onClick: (button) => changePanel("settings", true, button),
    },
    {
      id: "remove", label: "移出", accessibleLabel: "移出选中骰子",
      icon: <Trash2 size={22} />, tone: "destructive", disabled: busy || rolling,
      onClick: () => {
        setTrayDice((current) => current.filter((die) => !selection?.ids.includes(die.id)));
        setSelection(null); setThrowId(null);
      },
    },
  ] : selectedDie ? [
    {
      id: "roll", label: selectedDie.rollId ? "重投" : "投掷",
      accessibleLabel: selectedDie.rollId ? "重投这颗骰子" : "投掷这颗骰子",
      icon: selectedDie.rollId ? <RotateCcw size={23} /> : <Dice5 size={25} />,
      tone: "primary",
      disabled: busy || rolling || !active || (selectedDie.rollId !== undefined && selectedDie.value === null),
      onClick: () => castTray(selectedDice),
    },
    addAction,
    {
      id: "settings", label: "设置", accessibleLabel: "修正与可见范围",
      icon: <SlidersHorizontal size={23} />, onClick: (button) => changePanel("settings", true, button),
    },
    ...(selectedRoll ? [{
      id: "details", label: "明细", accessibleLabel: "查看明细",
      icon: <History size={23} />, onClick: (button: HTMLButtonElement) => changePanel("history", true, button),
    }] : []),
    ...(selectedRoll && active && canReveal(selectedRoll) ? [{
      id: "reveal", label: "公开", accessibleLabel: "公开结果",
      icon: <Eye size={24} />, disabled: busy,
      onClick: () => void operation(async () => {
        await revealDice(board, selectedRoll.id); setSelection(null);
      }),
    }] : []),
    {
      id: "remove", label: "移出", accessibleLabel: "移出骰盘",
      icon: <Trash2 size={22} />, tone: "destructive", disabled: busy || rolling,
      onClick: () => {
        setTrayDice((current) => current.filter((die) => die.id !== selectedDie.id));
        setSelection(null); setThrowId(null);
      },
    },
  ] : [];

  return <>
    <button type="button" className="dice-launcher" aria-label={awaiting ? `打开骰盘，${awaiting} 项待检定` : "打开骰盘"}
      title="骰盘" onClick={() => setOpen(true)}>
      <Dice5 aria-hidden="true" />{awaiting > 0 && <span>{awaiting}</span>}
    </button>
    {!open && notice && <button className="dice-notice" type="button" onClick={() => setOpen(true)} aria-live="polite">
      <Dice5 aria-hidden="true" />
      <span>{notice.actor_name} {notice.label || notice.notation}</span>
      <strong>{notice.result?.total ?? "已投出"}</strong>
    </button>}
    {open && <DiceLayer onClose={() => setOpen(false)}>
      <header className="dice-layer-header">
        <strong><Dice5 size={19} />骰盘</strong>
        <nav aria-label="骰盘工具">
          <button type="button" aria-label="骰盘更多操作" title="更多" aria-expanded={!!toolsAnchor} onClick={(event) => {
            setToolsAnchor(toolsAnchor ? null : dicePopoverAnchor(event.currentTarget)); setPanel(null); setAddOpen(false);
          }}><Ellipsis />{awaiting > 0 && <span>{awaiting}</span>}</button>
          <button type="button" aria-label="关闭" title="关闭" onClick={() => setOpen(false)}><X /></button>
        </nav>
      </header>
      <DiceMembers board={board} social={social.data} rolling={casting || rolling} onReact={social.react} />
      {toolsAnchor && <DicePopover anchor={toolsAnchor} title="骰盘" label="骰盘更多操作" compact onClose={() => setToolsAnchor(null)}>
        <div className="dice-tools-menu">
          <button type="button" disabled={busy || rolling || !active} onClick={(event) => openAdd(event.currentTarget, false)}><Plus size={18} />添加骰子</button>
          <button type="button" onClick={(event) => changePanel("settings", false, event.currentTarget)}><SlidersHorizontal size={18} />公式与预设</button>
          <button type="button" onClick={(event) => changePanel("history", false, event.currentTarget)}><History size={18} />投掷记录</button>
          <button type="button" onClick={(event) => changePanel("checks", false, event.currentTarget)}><Users size={18} />全员检定</button>
        </div>
      </DicePopover>}
      {addOpen && addAnchor && <DicePopover anchor={addAnchor} title="添加骰子" label="添加骰型" compact
        onClose={() => setAddOpen(false)} onBack={addFromSelection ? () => setAddOpen(false) : undefined}>
        <div className="dice-add-menu">
          {[...standardDice, "F" as const].map((sides) => <button type="button" key={sides}
            disabled={busy || rolling || !active} onClick={() => stageDie(sides)}>d{sides}</button>)}
        </div>
        {error && <p className="dice-add-error dice-error" role="alert">{error}</p>}
      </DicePopover>}
      <div className="dice-stage" data-panel-open={panel !== null}>
        <Suspense fallback={<p className="dice-stage-loading">正在展开骰盘…</p>}>
          <DiceScene ref={scene} dice={trayDice} skin={preferences.skin ?? "jade"}
            throwId={throwId} throwLaunch={throwLaunch} selection={selection} disabled={busy || panel !== null || addOpen || !!toolsAnchor}
            canThrow={active && !pending.current && !selectedLocked} reducedMotion={reducedMotion}
            onThrow={(ids, launch) => castTray(trayDice.filter((die) => ids.includes(die.id)), launch)}
            onSelect={selectDice} onRolling={setRolling} />
        </Suspense>
        {selectedDice.length > 0 && selection && !selection.dragging && !panel && !addOpen && !toolsAnchor && <DiceFanMenu key={selection.ids.join("|")}
          selection={selection} label={selectedDie ? `d${selectedDie.sides}` : `${selectedDice.length} 颗`} actions={fanActions}
          onClose={() => setSelection(null)} />}
      </div>
      <footer className="dice-layer-footer" hidden={panel !== null || addOpen || !!toolsAnchor || selection?.dragging}>
        <div className="dice-tray-result" aria-live="polite">
          {selectedDice.length ? <span>选中 {selectedDice.length} 颗</span>
            : last ? <DiceResult roll={last} />
            : <span>{trayDice.length} 颗骰子</span>}
          {last?.result && (last.result.dice.reduce((count, die) => count + (die.sides === 100 ? 2 : 1), 0) > 20 ||
            last.result.dice.some((die) => die.sides !== "F" && !standardDice.includes(die.sides))) && <small>完整结果见投掷记录</small>}
        </div>
        <button type="button" className="dice-stage-roll" disabled={busy || rolling || !active || !trayDice.length || (!!selectedDice.length && selectedLocked && !pending.current)}
          onClick={() => castTray(selectedDice.length ? selectedDice : undefined)}><Dice5 size={20} />{busy ? "正在确认…" : rolling ? "滚动中…" : pending.current ? "重试这次投掷" : selectedDice.length ? `投掷选中（${selectedDice.length}）` : "投掷全部"}</button>
      </footer>
      {!panel && !addOpen && error && <p className="dice-stage-error dice-error" role="alert">{error}</p>}
      {panel && panelAnchor && <DicePopover key={`${panel}:${panelFromSelection}`} anchor={panelAnchor}
        title={selectionPanel ? `选中 ${selectedDice.length} 颗` : panel === "history" ? "投掷记录" : panel === "checks" ? "全员检定" : "公式与预设"}
        label={selectionPanel ? "选中骰子设置面板" : panel === "history" ? "投掷记录面板" : panel === "checks" ? "检定面板" : "公式设置面板"}
        onClose={() => setPanel(null)} onBack={panelFromSelection ? () => setPanel(null) : undefined}>
      <div className="dice-layout" data-popover-panel={panel}>
        <section className="dice-controls">
          {selectionPanel ? <form className="dice-selection-settings" onSubmit={(event) => {
            event.preventDefault(); castTray(selectedDice);
          }}>
            <fieldset disabled={busy || rolling || !active}>
              <output className="dice-selection-formula" aria-label="选中骰子公式">{trayNotation(selectedDice, selectionSettings.modifier)}</output>
              <label className="dice-field">总修正<input aria-label="选中骰子总修正" type="number" min={-10000} max={10000}
                disabled={pending.current !== null} value={selectionSettings.modifier} onChange={(event) => setSelectionSettings({
                  ...selectionSettings, modifier: Number(event.target.value),
                })} /></label>
              <label className="dice-field">用途<input aria-label="选中骰子用途" maxLength={80} disabled={pending.current !== null} value={selectionSettings.label}
                onChange={(event) => setSelectionSettings({ ...selectionSettings, label: event.target.value })} /></label>
              <label className="dice-field">谁能查看<select aria-label="选中骰子可见性" disabled={pending.current !== null} value={selectionSettings.visibility}
                onChange={(event) => setSelectionSettings({ ...selectionSettings, visibility: event.target.value as DiceVisibility })}>
                {Object.entries(diceVisibilityLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select></label>
              <button type="submit" className="dice-roll-button" disabled={selectedLocked && !pending.current}><Dice5 />
                {busy ? "正在确认…" : pending.current ? "重试这次投掷" : `投掷选中（${selectedDice.length}）`}
              </button>
            </fieldset>
          </form> : <>
          <nav className="dice-tabs" aria-label="骰盘功能">
            <button type="button" aria-pressed={tab === "roll"} onClick={() => setTab("roll")}>投掷</button>
            <button type="button" aria-pressed={tab === "checks"} onClick={() => setTab("checks")}><Users size={15} />检定{awaiting > 0 ? ` (${awaiting})` : ""}</button>
          </nav>
          {tab === "roll" ? <>
            <form onSubmit={(event) => { event.preventDefault(); void submitRoll(); }}>
              <fieldset disabled={busy || rolling || !active}>
                <div className="dice-quick-fields">
                  <label>数量<input type="number" min={1} max={100} value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value))))} /></label>
                  <label>修正<input type="number" min={-10000} max={10000} value={modifier} onChange={(e) => setModifier(Number(e.target.value))} /></label>
                </div>
                <div className="dice-quick">
                  {standardDice.map((sides) => <button type="button" key={sides} onClick={() => quickDie(sides)}>d{sides}</button>)}
                </div>
                <label className="dice-field">公式<input aria-label="骰子公式" value={notation} maxLength={160}
                  onChange={(e) => { pending.current = null; setNotation(e.target.value); }} autoCapitalize="off" spellCheck={false} /></label>
                <div className="dice-examples">
                  {["2d20kh1", "2d20kl1", "4d6dl1", "6d6>=5", "1d6!", "4dF"].map((formula) =>
                    <button type="button" key={formula} onClick={() => { pending.current = null; setNotation(formula); }}>{formula}</button>)}
                </div>
                <label className="dice-field">用途<input value={label} aria-label="投掷用途" maxLength={80}
                  onChange={(e) => { pending.current = null; setLabel(e.target.value); }} placeholder="例如：潜行检定" /></label>
                <label className="dice-field">谁能查看<select aria-label="投掷可见性" value={visibility}
                  onChange={(e) => { pending.current = null; setVisibility(e.target.value as DiceVisibility); }}>
                  {Object.entries(diceVisibilityLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select></label>
                <button type="submit" className="dice-roll-button"><Dice5 />{busy ? "投掷中…" : pending.current ? "重试这次投掷" : "投掷"}</button>
              </fieldset>
            </form>
            <div className="dice-preset-list">
              {dice.data?.presets.map((preset) => <div key={preset.id}>
                <button type="button" disabled={busy} onClick={() => {
                  pending.current = null; setNotation(preset.notation); setVisibility(preset.visibility); setLabel(preset.name);
                }}>{preset.shared && <Users size={13} />}<span>{preset.name}</span><code>{preset.notation}</code></button>
                {preset.owner_id === board.viewer.id && <button type="button" aria-label={`删除预设 ${preset.name}`} disabled={busy}
                  onClick={() => void operation(() => deleteDicePreset(board, preset.id))}><Trash2 size={14} /></button>}
              </div>)}
            </div>
            <button className="dice-save-preset" type="button" disabled={busy || !active} onClick={() => setPresetOpen(!presetOpen)}>
              <BookmarkPlus size={16} />保存为预设
            </button>
            {presetOpen && <form className="dice-preset-form" onSubmit={(event) => {
              event.preventDefault();
              void operation(async () => {
                await saveDicePreset(board, presetName, notation, visibility, shared);
                setPresetOpen(false); setPresetName("");
              });
            }}>
              <input aria-label="预设名称" maxLength={40} required value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              {gm && <label><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />房间共享</label>}
              <button type="submit" disabled={busy}>保存</button>
            </form>}
          </> : <>
            {gm && <form className="dice-check-form" onSubmit={(event) => {
              event.preventDefault();
              void operation(async () => {
                await createDiceCheck(board, checkTitle, notation, visibility, targets); setCheckTitle("");
              });
            }}>
              <label className="dice-field">检定名称<input aria-label="检定名称" value={checkTitle} onChange={(e) => setCheckTitle(e.target.value)} maxLength={80} required /></label>
              <label className="dice-field">公式<input aria-label="检定公式" value={notation} onChange={(e) => setNotation(e.target.value)} required /></label>
              <label className="dice-field">谁能查看<select aria-label="检定可见性" value={visibility} onChange={(e) => setVisibility(e.target.value as DiceVisibility)}>
                {Object.entries(diceVisibilityLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select></label>
              <div className="dice-targets">
                {board.members.filter((m) => m.role === "player" && m.active).map((m) =>
                  <label key={m.userId}><input type="checkbox" checked={targets.includes(m.userId)} onChange={(e) => setTargets((current) =>
                    e.target.checked ? [...current, m.userId] : current.filter((id) => id !== m.userId))} />{m.characterName}</label>)}
              </div>
              <button className="dice-roll-button" disabled={busy || !active || !targets.length} type="submit">发起检定</button>
            </form>}
            {checks.map((check) => <article key={check.id} className="dice-check">
              <header><strong>{check.title}</strong><code>{check.notation}</code></header>
              <p>{diceVisibilityLabels[check.visibility]} · {Object.keys(check.responses).length}/{check.targets.length} 已完成{!check.open && " · 已结束"}</p>
              <ul>{check.targets.map((t) => <li key={t.id}>{t.name}<span>{check.responses[t.id] ? "已投出" : "待投掷"}</span></li>)}</ul>
              {check.open && check.targets.some((t) => t.id === board.viewer.id) && !check.responses[board.viewer.id] &&
                <button type="button" disabled={busy || !active} onClick={() => {
                  pending.current = null;
                  void submitRoll({ notation: check.notation, label: check.title, visibility: check.visibility, checkId: check.id });
                }}>响应检定</button>}
              {gm && check.open && <button type="button" disabled={busy || !active}
                onClick={() => void operation(() => closeDiceCheck(board, check.id))}>结束检定</button>}
            </article>)}
            {!checks.length && <p className="dice-empty">暂无检定</p>}
          </>}
          {panel && error && <p className="dice-error" role="alert">{error}</p>}
          {!active && <p className="dice-empty">战役已归档，投掷记录只读</p>}
          <div className="dice-preferences">
            <label><input type="checkbox" checked={!!preferences.sound} onChange={(e) => setPreferences({ ...preferences, sound: e.target.checked })} /><Volume2 size={14} />声音</label>
            <select aria-label="骰子皮肤" value={preferences.skin ?? "jade"} onChange={(e) => setPreferences({ ...preferences, skin: e.target.value })}>
              <option value="jade">青玉</option>
              <option value="ivory">象牙</option><option value="obsidian">黑曜石</option><option value="neon">霓虹</option>
            </select>
          </div>
          {backend === "local" && <p className="dice-empty">本地演示 · 结果仅保存在此浏览器</p>}
          </>}
          {selectionPanel && error && <p className="dice-error" role="alert">{error}</p>}
        </section>
        <section className="dice-history" aria-label="投掷记录">
          {dice.isLoading && <p>读取记录中…</p>}
          {dice.error && <p className="dice-error">{errorMessage(dice.error)}<button type="button" onClick={() => void dice.refetch()}>重试</button></p>}
          {[...rows, ...older.filter((r) => !rows.some((item) => item.id === r.id))].map((roll) => <article className="dice-record" key={roll.id}>
            <div className="dice-record-heading"><strong>{roll.actor_name}</strong><time dateTime={roll.created_at}>
              {new Date(roll.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>
            <p>{roll.label || "自由投掷"}<span>{roll.revealed_at ? "已公开" : diceVisibilityLabels[roll.visibility]}</span></p>
            <details>
              <summary><code>{roll.notation}</code><strong>{roll.result?.total ?? (roll.status === "pending" ? "待确认" : roll.status === "failed" ? "计算失败" : "已投出")}</strong></summary>
              {roll.result ? <>
                <div className="dice-breakdown">{roll.result.dice.map((die, i) => <span key={i} className={die.kept ? "" : "is-dropped"}>
                  <small>d{die.sides}</small>{die.value}<em>{die.flags}</em>
                </span>)}</div>
                <p className="dice-output">{roll.result.output}</p>
                {roll.parent_id && <small>重投自记录 {roll.parent_id.slice(0, 8)}</small>}
              </> : <p>结果仅供 GM 查看</p>}
            </details>
            <div className="dice-record-actions">
              {active && roll.result && <button type="button" disabled={busy} onClick={() => {
                pending.current = null;
                void submitRoll({ notation: roll.notation, label: roll.label, visibility: roll.visibility, parentId: roll.id });
              }}><RotateCcw size={13} />重投</button>}
              {roll.status === "complete" && <button type="button" disabled={busy || rolling} onClick={() => { setLast(roll); showRoll(roll); }}>在骰盘查看</button>}
              {active && canReveal(roll) && <button type="button" disabled={busy} onClick={() => void operation(() => revealDice(board, roll.id))}>公开结果</button>}
            </div>
          </article>)}
          {!rows.length && !dice.isLoading && !dice.error && <p className="dice-empty">还没有投掷记录</p>}
          {dice.data?.hasMore && more && <button type="button" className="dice-load-more" disabled={busy} onClick={() => void operation(async () => {
            const cursor = older.at(-1)?.created_at ?? rows.at(-1)?.created_at;
            const page = await getDiceState(board, cursor);
            setOlder((current) => [...current, ...page.rolls.slice(0, 50)]);
            setMore(page.hasMore);
          })}>更早记录</button>}
        </section>
      </div>
      </DicePopover>}
    </DiceLayer>}
  </>;
}
