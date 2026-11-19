import { Dice5, RotateCcw, BookmarkPlus, Users, Trash2, Volume2, X, Plus, History, SlidersHorizontal, Eye, Ellipsis, ListChecks, Check, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CampaignBoard } from "../campaign/domain/types";
import { backend } from "../../lib/backend";
import { DiceLayer } from "./DiceLayer";
import { DiceFanMenu, type DiceFanAction } from "./DiceFanMenu";
import { DicePopover, dicePopoverAnchor, type DicePopoverAnchor } from "./DicePopover";
import { DiceResult } from "./DiceResult";
import { DiceMembers } from "./DiceMembers";
import { DiceMaterialStudio } from "./DiceMaterialStudio";
import { Dock3DIcon } from "../../components/board/Dock3DIcon";
import {
  DICE_MATERIAL_PRESETS,
  configForPreset,
  sanitizeDiceMaterialConfig,
  type DiceMaterialConfig,
} from "./diceMaterialConfig";
import { playDiceReleaseCue } from "./diceAudio";
import { useDiceSocial } from "./useDiceSocial";
import type { TrayDie } from "./trayModels";
import type { DiceSelection, DiceSceneHandle } from "./DiceScene";
import type { ThrowLaunch } from "./trayPhysics";
import { expandDiceSelection, replaceTrayDice, rollTrayDice, standardDice, trayNotation } from "./traySelection";
import { useDice } from "./useDice";
import { PreparedRoll } from "./preparedRoll";
import { DiceRequestRejected } from "./invocationError";
import {
  closeDiceCheck, createDiceCheck, deleteDicePreset, getDiceState,
  revealDice, saveDicePreset,
} from "./repository";
import { diceVisibilityLabels, type DiceRoll, type DiceVisibility, type RollInput } from "./types";
import { BOARD_DICE_MACRO_EVENT, type BoardDiceMacroRequest } from "./boardMacro";
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
const preferenceKey = "hp-dice-presentation";
interface DicePresentationPreferences {
  three?: boolean;
  sound?: boolean;
  skin?: string;
  material?: DiceMaterialConfig;
}
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
  const [waitingIds, setWaitingIds] = useState<string[]>([]);
  const [reserved, setReserved] = useState(false);
  const rollInFlight = useRef(false);
  const [rolling, setRolling] = useState(false);
  const [panel, setPanel] = useState<"settings" | "history" | "checks" | "material" | null>(null);
  const [shaderStatus, setShaderStatus] = useState<{ ok: boolean; error?: string }>({ ok: true });
  const [panelAnchor, setPanelAnchor] = useState<DicePopoverAnchor | null>(null);
  const [panelFromSelection, setPanelFromSelection] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addAnchor, setAddAnchor] = useState<DicePopoverAnchor | null>(null);
  const [addFromSelection, setAddFromSelection] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState<DicePopoverAnchor | null>(null);
  const [selection, setSelection] = useState<DiceSelection | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
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
  const [error, setError] = useState("");
  const [last, setLast] = useState<DiceRoll | null>(null);
  const [notice, setNotice] = useState<DiceRoll | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [shared, setShared] = useState(false);
  const [checkTitle, setCheckTitle] = useState("");
  const [targets, setTargets] = useState<string[]>(() =>
    board.members.filter((m) => m.active && m.role === "player").map((m) => m.userId));
  const [preferences, setPreferences] = useState<DicePresentationPreferences>(() => {
    try { return JSON.parse(localStorage.getItem(preferenceKey) ?? "{}") as DicePresentationPreferences; }
    catch { return {}; }
  });
  const materialConfig = sanitizeDiceMaterialConfig(preferences.material, preferences.skin ?? "jade");
  const updateMaterial = (next: DiceMaterialConfig) => {
    setPreferences((current) => ({ ...current, skin: next.presetId, material: next }));
  };
  useEffect(() => {
    const onExternalApply = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}") as DicePresentationPreferences;
        setPreferences(parsed);
      } catch { /* ignore */ }
    };
    window.addEventListener("vb:dice-material-applied", onExternalApply);
    return () => window.removeEventListener("vb:dice-material-applied", onExternalApply);
  }, []);
  const pending = useRef<PreparedRoll | null>(null);
  const pendingLaunch = useRef<ThrowLaunch | undefined>(undefined);
  const noticeTimer = useRef(0);
  const active = board.campaign.status === "active";
  const gm = board.viewer.role === "gm";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const social = useDiceSocial(board, open);
  const dice = useDice(board, (roll) => {
    // The request owner decides when a prepared result is presented.
    // Realtime/refetch must never start a throw while it is still being held.
    if (roll.actor_id === board.viewer.id) return;
    setNotice(roll);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
    if (preferences.sound && roll.result) playDiceReleaseCue(materialConfig.acousticProfile);
  });
  function showRoll(roll: DiceRoll, replacing?: string[], launch?: ThrowLaunch) {
    setLast(roll);
    if (preferences.sound && roll.result && reducedMotion) playDiceReleaseCue(materialConfig.acousticProfile);
    setThrowLaunch(launch ?? null);
    setWaitingIds(replacing ?? []);
    setTrayDice((current) => replaceTrayDice(current, replacing,
      rollTrayDice(roll, replacing ? current.filter((die) => replacing.includes(die.id)) : undefined)));
    setThrowId(`${roll.id}:${performance.now()}`);
    setSelection(null); setPanel(null); setSelectionMode(false);
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
  const submitRoll = async (overrides?: Partial<RollInput>, selectedIds?: string[], launch?: ThrowLaunch) => {
    if (rollInFlight.current) return false;
    rollInFlight.current = true;
    const originalPanel = panel;
    setBusy(true); setCasting(true); setError("");
    const request = reserveRoll(overrides, selectedIds);
    if (launch) pendingLaunch.current = launch;
    setWaitingIds(request.ids ?? []);
    setPanel(null); setAddOpen(false); setToolsAnchor(null);
    try {
      const saved = await request.resolve(dice.roll);
      // Lock controls until the scene finishes preparing/playing the replay.
      setRolling(true);
      showRoll(saved, request.ids, pendingLaunch.current);
      pending.current = null;
      pendingLaunch.current = undefined;
      setReserved(false);
      return true;
    } catch (cause) {
      setPanel(originalPanel);
      handleRollError(cause);
      return false;
    } finally { setCasting(false); setBusy(false); rollInFlight.current = false; }
  };
  function handleRollError(cause: unknown) {
    if (cause instanceof DiceRequestRejected) {
      pending.current = null; pendingLaunch.current = undefined; setReserved(false);
    }
    setError(errorMessage(cause));
  }
  function reserveRoll(overrides?: Partial<RollInput>, ids?: string[]) {
    if (!pending.current) {
      pending.current = new PreparedRoll({
        requestId: crypto.randomUUID(), notation, label, visibility, ...overrides,
      }, ids);
      setReserved(true);
    }
    return pending.current;
  }
  const quickDie = (sides: number) => {
    if (reserved) return;
    setNotation(`${quantity}d${sides}${modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : ""}`);
  };
  const stageDie = (sides: TrayDie["sides"]) => {
    if (busy || rolling || reserved || !active) return;
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
  const trayInput = (selected?: TrayDie[]) => {
    const settings = selected ? selectionSettings : { modifier, label, visibility };
    const previous = new Set(selected?.map((die) => die.rollId).filter((id) => id !== undefined));
    return {
      notation: trayNotation(selected ?? trayDice, settings.modifier),
      label: settings.label, visibility: settings.visibility,
      ...(previous.size === 1 ? { parentId: [...previous][0] } : {}),
    };
  };
  const castTray = (selected?: TrayDie[], launch?: ThrowLaunch) =>
    submitRoll(trayInput(selected), (selected ?? trayDice).map((die) => die.id), launch);
  useEffect(() => {
    const onMacro = (event: Event) => {
      const request = (event as CustomEvent<BoardDiceMacroRequest>).detail;
      if (!request || request.campaignId !== board.campaign.id || !active) return;
      setOpen(true);
      if (busy || rolling || reserved || rollInFlight.current) {
        setError("请先完成当前投掷。"); return;
      }
      setNotation(request.macro.notation); setLabel(request.macro.name);
      setVisibility(request.macro.visibility ?? "public");
      void submitRoll({ notation: request.macro.notation, label: request.macro.name, visibility: request.macro.visibility ?? "public" });
    };
    window.addEventListener(BOARD_DICE_MACRO_EVENT, onMacro);
    return () => window.removeEventListener(BOARD_DICE_MACRO_EVENT, onMacro);
  });
  const prepareTray = async (ids: string[]): Promise<TrayDie[] | null> => {
    if (!active) return null;
    const selected = trayDice.filter((die) => ids.includes(die.id));
    const request = reserveRoll(trayInput(selected), ids);
    setError("");
    try {
      const saved = await request.resolve(dice.roll);
      return rollTrayDice(saved, selected);
    } catch (cause) { handleRollError(cause); return null; }
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
    if (pending.current?.ids && next &&
      (next.ids.length !== pending.current.ids.length || next.ids.some((id) => !pending.current!.ids!.includes(id)))) return;
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
  const closeTray = () => {
    setOpen(false); setSelection(null); setRolling(false); setSelectionMode(false);
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
    icon: <Plus size={25} />, disabled: busy || rolling || reserved || !active,
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
      icon: <SlidersHorizontal size={23} />, disabled: reserved,
      onClick: (button) => changePanel("settings", true, button),
    },
    {
      id: "remove", label: "移出", accessibleLabel: "移出选中骰子",
      icon: <Trash2 size={22} />, tone: "destructive", disabled: busy || rolling || reserved,
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
      icon: <SlidersHorizontal size={23} />, disabled: reserved, onClick: (button) => changePanel("settings", true, button),
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
      icon: <Trash2 size={22} />, tone: "destructive", disabled: busy || rolling || reserved,
      onClick: () => {
        setTrayDice((current) => current.filter((die) => die.id !== selectedDie.id));
        setSelection(null); setThrowId(null);
      },
    },
  ] : [];

  return <>
    <button type="button" className="board-tool-button dice-launcher macos-dock-item is-dice" aria-label={awaiting ? `打开骰盘，${awaiting} 项待检定` : "打开骰盘"}
      title="3D 骰盘" onClick={() => setOpen(true)}>
      <Dock3DIcon kind="dice" fallback={<Dice5 />} />
      <span className="macos-dock-label">骰盘</span>
      {awaiting > 0 && <span className="macos-dock-badge is-alert">{awaiting}</span>}
    </button>
    {!open && notice && <button className="dice-notice" type="button" onClick={() => setOpen(true)} aria-live="polite">
      <Dice5 aria-hidden="true" />
      <span>{notice.actor_name} {notice.label || notice.notation}</span>
      <strong>{notice.result?.total ?? "已投出"}</strong>
    </button>}
    {open && <DiceLayer onClose={closeTray}>
      <header className="dice-layer-header">
        <strong><Dice5 size={19} />骰盘</strong>
        <nav aria-label="骰盘工具">
          <button type="button" className="dice-mobile-select"
            aria-label={selectionMode ? "完成骰子多选" : "多选骰子"} aria-pressed={selectionMode}
            disabled={busy || rolling || reserved} onClick={() => {
              setSelectionMode(!selectionMode); setPanel(null); setAddOpen(false); setToolsAnchor(null);
            }}>{selectionMode ? <Check /> : <ListChecks />}<b>{selectionMode ? "完成" : "多选"}</b></button>
          <button type="button" aria-label="材质与 Shader 工坊" title="材质与 Shader" aria-pressed={panel === "material"}
            onClick={(event) => changePanel("material", false, event.currentTarget)}><Sparkles /></button>
          <button type="button" aria-label="骰盘更多操作" title="更多" aria-expanded={!!toolsAnchor} onClick={(event) => {
            setToolsAnchor(toolsAnchor ? null : dicePopoverAnchor(event.currentTarget)); setPanel(null); setAddOpen(false);
          }}><Ellipsis />{awaiting > 0 && <span>{awaiting}</span>}</button>
          <button type="button" aria-label="关闭" title="关闭" onClick={closeTray}><X /></button>
        </nav>
      </header>
      <DiceMembers board={board} social={social.data} rolling={casting || rolling} onReact={social.react} />
      {toolsAnchor && <DicePopover anchor={toolsAnchor} title="骰盘" label="骰盘更多操作" compact onClose={() => setToolsAnchor(null)}>
        <div className="dice-tools-menu">
          <button type="button" disabled={busy || rolling || reserved || !active} onClick={(event) => openAdd(event.currentTarget, false)}><Plus size={18} />添加骰子</button>
          <button type="button" onClick={(event) => changePanel("material", false, event.currentTarget)}><Sparkles size={18} />材质与 Shader</button>
          <button type="button" disabled={reserved} onClick={(event) => changePanel("settings", false, event.currentTarget)}><SlidersHorizontal size={18} />公式与预设</button>
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
      <div className="dice-stage" data-panel-open={panel !== null} data-selection-mode={selectionMode}>
        <Suspense fallback={<p className="dice-stage-loading">正在展开骰盘…</p>}>
          <DiceScene ref={scene} dice={trayDice} skin={materialConfig.presetId}
            materialConfig={materialConfig} soundEnabled={!!preferences.sound}
            throwId={throwId} throwLaunch={throwLaunch} selection={selection} selectionMode={selectionMode}
            disabled={busy || panel !== null || addOpen || !!toolsAnchor}
            canThrow={active && !selectedLocked && (!pending.current || !!pending.current.ids?.length)} reducedMotion={reducedMotion}
            waiting={casting} waitingIds={waitingIds}
            onPrepare={prepareTray}
            onThrow={(ids, launch) => castTray(trayDice.filter((die) => ids.includes(die.id)), launch)}
            onSelect={selectDice} onRolling={setRolling}
            onShaderStatus={setShaderStatus} />
        </Suspense>
        {selectedDice.length > 0 && selection && !selectionMode && !selection.dragging && !casting && !rolling && !panel && !addOpen && !toolsAnchor && <DiceFanMenu key={selection.ids.join("|")}
          selection={selection} label={selectedDie ? `d${selectedDie.sides}` : `${selectedDice.length} 颗`} actions={fanActions}
          onClose={() => setSelection(null)} />}
      </div>
      <footer className="dice-layer-footer" hidden={panel !== null || addOpen || !!toolsAnchor || selection?.dragging}>
        {selectionMode && <div className="dice-selection-controls" role="group" aria-label="骰子多选">
          <button type="button" disabled={busy || rolling || reserved || !trayDice.length}
            onClick={() => selectDice({ ids: trayDice.map((die) => die.id), x: selection?.x ?? 0, y: selection?.y ?? 0 })}>全选</button>
          <button type="button" disabled={busy || rolling || reserved || !selectedDice.length}
            onClick={() => selectDice(null)}>清除选择</button>
        </div>}
        <div className="dice-tray-result" aria-live="polite">
          {casting || rolling ? <span>{trayDice.length} 颗骰子</span> : selectedDice.length || selectionMode ? <span>选中 {selectedDice.length} 颗</span>
            : last ? <DiceResult roll={last} />
            : <span>{trayDice.length} 颗骰子</span>}
          {last?.result && (last.result.dice.reduce((count, die) => count + (die.sides === 100 ? 2 : 1), 0) > 20 ||
            last.result.dice.some((die) => die.sides !== "F" && !standardDice.includes(die.sides))) && <small>完整结果见投掷记录</small>}
        </div>
        <button type="button" className="dice-stage-roll" disabled={busy || rolling || !active || !trayDice.length ||
          (selectionMode && !selectedDice.length) || (!!selectedDice.length && selectedLocked && !pending.current)}
          onClick={() => castTray(selectedDice.length ? selectedDice : undefined)}><Dice5 size={20} />{busy ? "正在准备…" : rolling ? "投掷中…" : pending.current ? error ? "重试这次投掷" : "继续这次投掷" : selectedDice.length || selectionMode ? `投掷选中（${selectedDice.length}）` : "投掷全部"}</button>
      </footer>
      {!panel && !addOpen && error && <p className="dice-stage-error dice-error" role="alert">{error}</p>}
      {panel && panelAnchor && <DicePopover key={`${panel}:${panelFromSelection}`} anchor={panelAnchor}
        title={selectionPanel ? `选中 ${selectedDice.length} 颗` : panel === "material" ? "材质与 Shader 工坊" : panel === "history" ? "投掷记录" : panel === "checks" ? "全员检定" : "公式与预设"}
        label={selectionPanel ? "选中骰子设置面板" : panel === "material" ? "骰子材质与 Shader 工坊" : panel === "history" ? "投掷记录面板" : panel === "checks" ? "检定面板" : "公式设置面板"}
        onClose={() => setPanel(null)} onBack={panelFromSelection ? () => setPanel(null) : undefined}>
      {panel === "material" ? (
        <DiceMaterialStudio
          config={materialConfig}
          ownerId={board.viewer.id}
          soundEnabled={!!preferences.sound}
          shaderStatus={shaderStatus}
          onChange={updateMaterial}
          onToggleSound={(sound) => setPreferences((current) => ({ ...current, sound }))}
        />
      ) : (
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
                  <label>数量<input type="number" min={1} max={100} value={quantity} disabled={reserved}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value))))} /></label>
                  <label>修正<input type="number" min={-10000} max={10000} value={modifier} disabled={reserved} onChange={(e) => setModifier(Number(e.target.value))} /></label>
                </div>
                <div className="dice-quick">
                  {standardDice.map((sides) => <button type="button" key={sides} disabled={reserved} onClick={() => quickDie(sides)}>d{sides}</button>)}
                </div>
                <label className="dice-field">公式<input aria-label="骰子公式" value={notation} maxLength={160} disabled={reserved}
                  onChange={(e) => setNotation(e.target.value)} autoCapitalize="off" spellCheck={false} /></label>
                <div className="dice-examples">
                  {["2d20kh1", "2d20kl1", "4d6dl1", "6d6>=5", "1d6!", "4dF"].map((formula) =>
                    <button type="button" key={formula} disabled={reserved} onClick={() => setNotation(formula)}>{formula}</button>)}
                </div>
                <label className="dice-field">用途<input value={label} aria-label="投掷用途" maxLength={80} disabled={reserved}
                  onChange={(e) => setLabel(e.target.value)} placeholder="例如：潜行检定" /></label>
                <label className="dice-field">谁能查看<select aria-label="投掷可见性" value={visibility} disabled={reserved}
                  onChange={(e) => setVisibility(e.target.value as DiceVisibility)}>
                  {Object.entries(diceVisibilityLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select></label>
                <button type="submit" className="dice-roll-button"><Dice5 />{busy ? "投掷中…" : pending.current ? "重试这次投掷" : "投掷"}</button>
              </fieldset>
            </form>
            <div className="dice-preset-list">
              {dice.data?.presets.map((preset) => <div key={preset.id}>
                <button type="button" disabled={busy || reserved} onClick={() => {
                  setNotation(preset.notation); setVisibility(preset.visibility); setLabel(preset.name);
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
                <button type="button" disabled={busy || rolling || reserved || !active} onClick={() => {
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
            <select aria-label="骰子皮肤" value={materialConfig.presetId} onChange={(e) => updateMaterial(configForPreset(e.target.value))}>
              {DICE_MATERIAL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
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
              {active && roll.result && <button type="button" disabled={busy || rolling || reserved} onClick={() => {
                void submitRoll({ notation: roll.notation, label: roll.label, visibility: roll.visibility, parentId: roll.id });
              }}><RotateCcw size={13} />重投</button>}
              {roll.status === "complete" && <button type="button" disabled={busy || rolling || reserved} onClick={() => { setRolling(true); showRoll(roll); }}>在骰盘查看</button>}
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
      )}
      </DicePopover>}
    </DiceLayer>}
  </>;
}
