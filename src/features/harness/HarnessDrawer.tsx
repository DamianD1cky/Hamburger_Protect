import {
  Bookmark,
  Check,
  KeyRound,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { backend } from "../../lib/backend";
import type { CampaignBoard } from "../campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import {
  ACCOUNT_ASSET_KIND_LABELS,
  captureBlueprintAssetsToAccount,
  deleteAccountAsset,
  toggleAccountAssetFavorite,
  useAccountAssets,
  type AccountAssetKind,
  type AccountDesignAsset,
} from "../assets/accountAssetLibrary";
import {
  HARNESS_PROVIDER_PRESETS,
  loadSavedHarnessConfig,
  persistHarnessConfig,
  requestHarnessBlueprint,
} from "./client";
import { compileHarnessBlueprint, lintBoardLayout } from "./linter";
import { HARNESS_STARTER_RECIPES } from "./recipes";
import type {
  BoardUndoSnapshot,
  CompiledBoardBlueprint,
  HarnessApiConfig,
} from "./schema";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  badges?: string[];
  lintNotes?: string[];
  source?: "llm" | "offline" | "recipe";
}

export function HarnessPreviewBanner({
  staged,
  applying,
  onApply,
  onDiscard,
}: {
  staged: CompiledBoardBlueprint;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="harness-preview-banner"
      role="region"
      aria-label="AI 编排草稿预览控制栏"
    >
      <div className="harness-preview-info">
        <WandSparkles aria-hidden="true" />
        <div>
          <strong>正在预览草稿：{staged.summary}</strong>
          <small>
            尚未对房间成员生效 ·{" "}
            {staged.changeBadges.join(" · ") || "包含排版与外观更新"}
          </small>
        </div>
      </div>
      <div className="harness-preview-actions">
        <button
          type="button"
          className="harness-discard-btn"
          disabled={applying}
          onClick={onDiscard}
        >
          <X aria-hidden="true" />
          放弃草稿
        </button>
        <button
          type="button"
          className="harness-apply-btn"
          disabled={applying}
          onClick={onApply}
        >
          <Check aria-hidden="true" />
          {applying ? "正在落库…" : "确认应用到公告板"}
        </button>
      </div>
    </div>
  );
}

export function HarnessDrawer({
  open,
  board,
  stagedBlueprint,
  lastUndo,
  applying,
  onClose,
  onStageBlueprint,
  onApplyStaged,
  onDiscardStaged,
  onUndoLast,
  onCreateCustomPanel,
}: {
  open: boolean;
  board: CampaignBoard;
  stagedBlueprint: CompiledBoardBlueprint | null;
  lastUndo: BoardUndoSnapshot | null;
  applying: boolean;
  onClose: () => void;
  onStageBlueprint: (compiled: CompiledBoardBlueprint) => void;
  onApplyStaged: () => Promise<void>;
  onDiscardStaged: () => void;
  onUndoLast: () => Promise<void>;
  onCreateCustomPanel: () => void;
}) {
  const ime = useImeEnterGuard();
  const [tab, setTab] = useState<"compose" | "assets" | "api">("compose");
  const [assetFilter, setAssetFilter] = useState<AccountAssetKind | "all">("all");
  const [assetStatus, setAssetStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<HarnessApiConfig>(() =>
    loadSavedHarnessConfig(),
  );
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const accountAssets = useAccountAssets(board.viewer.id);

  if (!open) return null;

  const filteredAssets =
    assetFilter === "all"
      ? accountAssets
      : accountAssets.filter((item) => item.kind === assetFilter);

  const applySavedAsset = (asset: AccountDesignAsset) => {
    setError("");
    setAssetStatus("");
    const baseBoard = stagedBlueprint ? stagedBlueprint.previewBoard : board;
    if (asset.payload.kind === "dice_material") {
      try {
        const key = "hp-dice-presentation";
        const current = JSON.parse(localStorage.getItem(key) ?? "{}");
        localStorage.setItem(
          key,
          JSON.stringify({
            ...current,
            skin: asset.payload.config.presetId,
            material: asset.payload.config,
          }),
        );
        window.dispatchEvent(new CustomEvent("vb:dice-material-applied"));
        setAssetStatus(`已将「${asset.name}」设为当前骰子材质，打开骰盘即可查看。`);
      } catch {
        setAssetStatus("骰子材质应用失败。");
      }
      return;
    }

    const nextTokens = structuredClone(baseBoard.settings.styleTokens);
    let clockPatch: Partial<CampaignBoard["settings"]["clock"]> | undefined;

    if (asset.payload.kind === "ambient_shader") {
      if (asset.payload.surfaceShader) {
        nextTokens.surfaceShader = structuredClone(asset.payload.surfaceShader);
      }
      if (asset.payload.frameShader) {
        nextTokens.frameShader = structuredClone(asset.payload.frameShader);
      }
    } else if (asset.payload.kind === "card_shader") {
      if (asset.payload.target === "note") {
        nextTokens.defaultNoteEffect = structuredClone(asset.payload.effect);
      } else {
        nextTokens.defaultCardEffect = structuredClone(asset.payload.effect);
      }
    } else if (asset.payload.kind === "board_style") {
      Object.assign(nextTokens, structuredClone(asset.payload.styleTokens));
    } else if (asset.payload.kind === "clock_style") {
      nextTokens.clockAppearance = structuredClone(asset.payload.clockAppearance);
      if (asset.payload.clockStyle) {
        clockPatch = { style: asset.payload.clockStyle };
      }
    }

    const compiled = compileHarnessBlueprint(baseBoard, {
      summary: `套用个人资产：${asset.name}`,
      assistantReply: `已从你的个人资产库加载「${asset.name}」到画布预览。`,
      styleTokens: nextTokens,
      ...(clockPatch ? { clock: clockPatch } : {}),
    });
    onStageBlueprint(compiled);
    setAssetStatus(`已在左侧画布预览「${asset.name}」，点击「确认应用」即对全员生效。`);
  };

  const currentLintIssues = lintBoardLayout(
    stagedBlueprint ? stagedBlueprint.previewBoard : board,
  );

  const updateConfig = (patch: Partial<HarnessApiConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      persistHarnessConfig(next);
      return next;
    });
  };

  const applyRecipe = (recipeId: string) => {
    const recipe = HARNESS_STARTER_RECIPES.find((r) => r.id === recipeId);
    if (!recipe || busy || applying) return;
    setError("");
    const raw = recipe.build(board);
    const compiled = compileHarnessBlueprint(board, raw);
    const captured = captureBlueprintAssetsToAccount(
      board.viewer.id,
      compiled,
      recipe.promptHint,
    );
    onStageBlueprint(compiled);
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: `套用预设：${recipe.label}` },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: compiled.assistantReply,
        badges: [
          ...compiled.changeBadges,
          ...(captured.length > 0 ? [`已存入 ${captured.length} 项个人资产`] : []),
        ],
        lintNotes: compiled.lintNotes,
        source: "recipe",
      },
    ]);
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy || applying) return;
    setBusy(true);
    setError("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    try {
      const baseBoard = stagedBlueprint ? stagedBlueprint.previewBoard : board;
      const { blueprint, source } = await requestHarnessBlueprint({
        campaignId: board.campaign.id,
        prompt: trimmed,
        board: baseBoard,
        config,
        history,
      });
      const compiled = compileHarnessBlueprint(baseBoard, blueprint, trimmed);
      const captured = captureBlueprintAssetsToAccount(
        board.viewer.id,
        compiled,
        trimmed,
      );
      onStageBlueprint(compiled);
      setPrompt("");
      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: trimmed },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: compiled.assistantReply,
          badges: [
            ...compiled.changeBadges,
            ...(captured.length > 0 ? [`已存入 ${captured.length} 项个人资产`] : []),
          ],
          lintNotes: compiled.lintNotes,
          source,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "AI 编排请求未完成，请检查配置后重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="harness-drawer"
      aria-label="AI 帷幕编排助手"
    >
      <header className="harness-drawer-header">
        <div>
          <span className="harness-kicker">BOARD AGENT HARNESS</span>
          <h2>AI 帷幕编排官</h2>
        </div>
        <button
          type="button"
          className="harness-close-btn"
          aria-label="关闭 AI 帷幕编排"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="harness-tabs" role="tablist" aria-label="编排助手分页">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "compose"}
          className={tab === "compose" ? "is-active" : ""}
          onClick={() => setTab("compose")}
        >
          <Sparkles aria-hidden="true" />
          智能编排
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assets"}
          className={tab === "assets" ? "is-active" : ""}
          onClick={() => setTab("assets")}
        >
          <Bookmark aria-hidden="true" />
          资产库
          {accountAssets.length > 0 && (
            <em className="harness-asset-count">{accountAssets.length}</em>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "api"}
          className={tab === "api" ? "is-active" : ""}
          onClick={() => setTab("api")}
        >
          <KeyRound aria-hidden="true" />
          API
          {config.apiKey.trim() && <i className="harness-key-dot" aria-hidden="true" />}
        </button>
      </div>

      {tab === "compose" ? (
        <div className="harness-drawer-body">
          <section className="harness-quick-section">
            <div className="harness-section-row">
              <strong>一键规则与场景配方</strong>
              <button
                type="button"
                className="harness-inline-action"
                onClick={onCreateCustomPanel}
              >
                <Plus aria-hidden="true" />
                新建自由展板
              </button>
            </div>
            <div className="harness-recipe-grid">
              {HARNESS_STARTER_RECIPES.map((recipe) => (
                <button
                  type="button"
                  key={recipe.id}
                  className="harness-recipe-chip"
                  disabled={busy || applying}
                  onClick={() => applyRecipe(recipe.id)}
                >
                  <strong>{recipe.label}</strong>
                  <small>{recipe.tagline}</small>
                </button>
              ))}
            </div>
          </section>

          {currentLintIssues.length > 0 && (
            <div className="harness-lint-box" role="status">
              <strong>空间检查提示（{currentLintIssues.length}）</strong>
              {currentLintIssues.map((issue, idx) => (
                <p key={idx}>{issue.message}</p>
              ))}
            </div>
          )}

          {lastUndo && !stagedBlueprint && (
            <div className="harness-undo-bar">
              <span>上次已应用：{lastUndo.summary}</span>
              <button
                type="button"
                disabled={applying || busy}
                onClick={() => void onUndoLast()}
              >
                <RotateCcw aria-hidden="true" />
                撤销上次编排
              </button>
            </div>
          )}

          <div className="harness-chat-log" aria-live="polite">
            {turns.length === 0 ? (
              <p className="harness-empty-hint">
                点击上方任意配方立即在左侧并列画布生成实时预览，或直接输入自然语言描述（例如：「用原子积木拼装一块救援物资与抢修委托面板，卡片加上烈火烧焦效果」或「生成一段熔金裂纹燃烧 Shader」）。
              </p>
            ) : (
              turns.map((turn) => (
                <article
                  key={turn.id}
                  className={`harness-turn is-${turn.role}`}
                >
                  <header>
                    <strong>{turn.role === "user" ? "GM 指令" : "帷幕编排官"}</strong>
                    {turn.source && (
                      <small>
                        {turn.source === "llm"
                          ? "API 模型生成"
                          : turn.source === "recipe"
                            ? "内置配方"
                            : "离线蓝图引擎"}
                      </small>
                    )}
                  </header>
                  <p>{turn.content}</p>
                  {turn.badges && turn.badges.length > 0 && (
                    <div className="harness-badges">
                      {turn.badges.map((badge, i) => (
                        <span key={i}>{badge}</span>
                      ))}
                    </div>
                  )}
                  {turn.lintNotes && turn.lintNotes.length > 0 && (
                    <ul className="harness-lint-notes">
                      {turn.lintNotes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </div>

          {error && (
            <p className="harness-error" role="alert">
              {error}
            </p>
          )}

          {stagedBlueprint && (
            <div className="harness-drawer-staged-card" role="status">
              <div className="staged-card-summary">
                <strong>待确认草稿：{stagedBlueprint.summary}</strong>
                <small>左侧公告板已实时渲染预览，确认后对全员生效</small>
              </div>
              <div className="harness-drawer-staged-actions">
                <button
                  type="button"
                  className="harness-discard-btn"
                  disabled={applying}
                  onClick={onDiscardStaged}
                >
                  放弃草稿
                </button>
                <button
                  type="button"
                  className="harness-apply-btn"
                  disabled={applying}
                  onClick={() => void onApplyStaged()}
                >
                  {applying ? "正在落库…" : "确认应用到公告板"}
                </button>
              </div>
            </div>
          )}

          <form
            className="harness-prompt-form"
            onSubmit={(e) => void submitPrompt(e)}
            {...ime}
          >
            <textarea
              aria-label="描述你想要的公告板排版与风格"
              rows={3}
              maxLength={4000}
              disabled={busy || applying}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submitPrompt(e as unknown as FormEvent);
                }
              }}
              placeholder="描述排版、材质风格、新增自定义面板或开局线索…（Ctrl/⌘ + Enter 发送）"
            />
            <button
              type="submit"
              className="harness-send-btn"
              disabled={busy || applying || !prompt.trim()}
            >
              <Send aria-hidden="true" />
              {busy ? "正在编排预览…" : "生成排版预览"}
            </button>
          </form>
        </div>
      ) : tab === "assets" ? (
        <div className="harness-drawer-body harness-assets-panel">
          <div className="harness-asset-intro">
            <strong>我的账号资产库</strong>
            <small>
              使用 AI 生成的 Shader、板面材质、时钟与骰子样式都会自动归档到当前账号（{board.viewer.displayName}），随时跨战役复用。
            </small>
          </div>
          <div className="harness-asset-filters" role="tablist" aria-label="资产分类筛选">
            {(
              [
                ["all", "全部"],
                ["card_shader", "卡片/便签"],
                ["ambient_shader", "黑板/外框"],
                ["clock_style", "时钟样式"],
                ["dice_material", "骰子材质"],
                ["board_style", "视觉风格"],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                role="tab"
                aria-selected={assetFilter === key}
                className={assetFilter === key ? "effect-chip is-active" : "effect-chip"}
                onClick={() => setAssetFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {assetStatus && (
            <p className="harness-asset-status" role="status">
              {assetStatus}
            </p>
          )}

          {filteredAssets.length === 0 ? (
            <p className="harness-empty-hint">
              当前分类下暂无资产。使用 AI 编排官生成任意 Shader、时钟样式，或在骰子工坊点击「存入资产库」后会自动出现在这里。
            </p>
          ) : (
            <div className="harness-asset-list">
              {filteredAssets.map((asset) => (
                <article key={asset.id} className="harness-asset-card">
                  <div
                    className="harness-asset-bar"
                    style={{
                      background:
                        asset.previewColors.length >= 2
                          ? `linear-gradient(135deg, ${asset.previewColors[0]} 0%, ${asset.previewColors[1]} 100%)`
                          : asset.previewColors[0] ?? "#5ca8f5",
                    }}
                    aria-hidden="true"
                  />
                  <div className="harness-asset-content">
                    <header>
                      <strong>{asset.name}</strong>
                      <em>{ACCOUNT_ASSET_KIND_LABELS[asset.kind]}</em>
                    </header>
                    {asset.description && <p>{asset.description}</p>}
                    <div className="harness-asset-actions">
                      <button
                        type="button"
                        className="harness-asset-apply"
                        disabled={applying || busy}
                        onClick={() => applySavedAsset(asset)}
                      >
                        <WandSparkles size={13} aria-hidden="true" />
                        套用
                      </button>
                      <button
                        type="button"
                        className={asset.favorite ? "harness-asset-icon is-fav" : "harness-asset-icon"}
                        aria-label={asset.favorite ? "取消收藏" : "收藏资产"}
                        onClick={() =>
                          toggleAccountAssetFavorite(board.viewer.id, asset.id)
                        }
                      >
                        <Star size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="harness-asset-icon"
                        aria-label={`删除资产 ${asset.name}`}
                        onClick={() => deleteAccountAsset(board.viewer.id, asset.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="harness-drawer-body harness-api-settings">
          <label className="harness-field">
            <span>运行模式</span>
            <select
              aria-label="运行模式"
              value={config.mode}
              onChange={(e) =>
                updateConfig({
                  mode: e.target.value as HarnessApiConfig["mode"],
                })
              }
            >
              <option value="auto">
                自动（填了个人 Key 优先走 BYOK，否则用站点托管 / 离线引擎）
              </option>
              <option value="byok">自带 API Key (BYOK)</option>
              <option value="offline">内置离线蓝图引擎（免 Key 零延迟）</option>
            </select>
          </label>

          {config.mode !== "offline" && (
            <>
              <div className="harness-provider-chips">
                {HARNESS_PROVIDER_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() =>
                      updateConfig({
                        provider: preset.provider,
                        baseUrl: preset.baseUrl,
                        model: preset.defaultModel,
                      })
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <label className="harness-field">
                <span>接口协议</span>
                <select
                  aria-label="接口协议"
                  value={config.provider}
                  onChange={(e) =>
                    updateConfig({
                      provider: e.target.value as HarnessApiConfig["provider"],
                    })
                  }
                >
                  <option value="openai_compat">
                    OpenAI 兼容 (OpenRouter / DeepSeek / OpenAI / Qwen)
                  </option>
                  <option value="anthropic">Anthropic Messages API</option>
                </select>
              </label>

              <label className="harness-field">
                <span>API Base URL（需为公网 HTTPS）</span>
                <input
                  type="url"
                  value={config.baseUrl}
                  onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <label className="harness-field">
                <span>模型名称 (Model)</span>
                <input
                  value={config.model}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  placeholder="gpt-4o / deepseek-chat / claude-sonnet-4-20250514"
                />
              </label>

              <label className="harness-field">
                <span>个人 API Key（绝不存入房间共享数据）</span>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => updateConfig({ apiKey: e.target.value })}
                  placeholder={
                    backend === "supabase"
                      ? "留空则尝试使用站长托管模型"
                      : "sk-...（留空时自动回退离线蓝图引擎）"
                  }
                  autoComplete="off"
                />
              </label>

              <label className="harness-checkbox">
                <input
                  type="checkbox"
                  checked={config.rememberLocally}
                  onChange={(e) =>
                    updateConfig({ rememberLocally: e.target.checked })
                  }
                />
                <span>在本机浏览器记住此配置（其他玩家不可见）</span>
              </label>
            </>
          )}

          <p className="harness-security-note">
            安全架构说明：线上环境所有模型请求均经由同源许可的 Supabase Edge Function（
            <code>board-harness</code>
            ）验证 GM 身份后转发，严格遵循站点 CSP 策略且内置内网 SSRF 拦截。所有生成的排版先进入本机沙盒预览，点「确认应用」才通过事务原子写入房间。
          </p>
        </div>
      )}
    </aside>
  );
}
