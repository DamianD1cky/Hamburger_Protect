import { backend } from "../../lib/backend";
import { requireSupabase } from "../../lib/supabase/client";
import type { CampaignBoard } from "../campaign/domain/types";
import {
  COMPOSE_BOARD_TOOL_SCHEMA,
  HARNESS_SYSTEM_PROMPT,
  captureBoardContext,
  type CaptureBoardContextOptions,
} from "./eyes";
import { compileHarnessBlueprint } from "./linter";
import { synthesizeOfflineBlueprint } from "./recipes";
import type { AccountDesignAsset } from "../assets/accountAssetLibrary";
import type { DiceMaterialConfig } from "../dice/diceMaterialConfig";
import type {
  BoardHarnessBlueprint,
  CompiledBoardBlueprint,
  HarnessApiConfig,
} from "./schema";

const BYOK_STORAGE_KEY = "veilboard-harness-byok-v1";

export const DEFAULT_HARNESS_API_CONFIG: HarnessApiConfig = {
  mode: "auto",
  provider: "openai_compat",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  rememberLocally: false,
};

export const HARNESS_PROVIDER_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  provider: HarnessApiConfig["provider"];
  baseUrl: string;
  defaultModel: string;
}> = [
  {
    id: "openrouter",
    label: "OpenRouter (兼容多模型)",
    provider: "openai_compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "openai_compat",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai_compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
  },
];

export function loadSavedHarnessConfig(): HarnessApiConfig {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HARNESS_API_CONFIG };
    const parsed = JSON.parse(raw) as Partial<HarnessApiConfig>;
    return {
      mode:
        parsed.mode === "byok" || parsed.mode === "offline" || parsed.mode === "auto"
          ? parsed.mode
          : "auto",
      provider: parsed.provider === "anthropic" ? "anthropic" : "openai_compat",
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim()
        : DEFAULT_HARNESS_API_CONFIG.baseUrl,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" && parsed.model.trim()
        ? parsed.model.trim()
        : DEFAULT_HARNESS_API_CONFIG.model,
      rememberLocally: Boolean(parsed.rememberLocally),
    };
  } catch {
    return { ...DEFAULT_HARNESS_API_CONFIG };
  }
}

export function persistHarnessConfig(config: HarnessApiConfig) {
  try {
    if (!config.rememberLocally) {
      localStorage.removeItem(BYOK_STORAGE_KEY);
      return;
    }
    localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore private browsing quota errors
  }
}

export function parseModelBlueprintResponse(raw: unknown): BoardHarnessBlueprint {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 未返回有效的公告板蓝图结构。");
  }
  const obj = raw as Record<string, unknown>;
  return {
    ...(obj as unknown as BoardHarnessBlueprint),
    summary:
      typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : "AI 定制排版方案",
    assistantReply:
      typeof obj.assistantReply === "string" && obj.assistantReply.trim()
        ? obj.assistantReply.trim()
        : "已根据你的要求生成公告板排版预览。",
  };
}

async function callDirectByokInLocalMode(
  prompt: string,
  board: CampaignBoard,
  config: HarnessApiConfig,
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  contextOptions?: CaptureBoardContextOptions,
): Promise<BoardHarnessBlueprint> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const contextJson = JSON.stringify(captureBoardContext(board, contextOptions));
  const userContent = `当前公告板状态快照（JSON）：\n${contextJson}\n\nGM 编排需求：\n${prompt}`;

  if (config.provider === "anthropic") {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model.trim(),
        max_tokens: 4096,
        system: HARNESS_SYSTEM_PROMPT,
        messages: [
          ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userContent },
        ],
        tools: [
          {
            name: COMPOSE_BOARD_TOOL_SCHEMA.name,
            description: COMPOSE_BOARD_TOOL_SCHEMA.description,
            input_schema: COMPOSE_BOARD_TOOL_SCHEMA.parameters,
          },
        ],
        tool_choice: { type: "tool", name: COMPOSE_BOARD_TOOL_SCHEMA.name },
      }),
    });
    if (!res.ok) {
      throw new Error(`模型请求失败（HTTP ${res.status}），请检查 API Key、模型名或跨域配置。`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; input?: unknown }>;
    };
    const toolUse = data.content?.find((part) => part.type === "tool_use");
    if (!toolUse?.input) throw new Error("模型未输出有效的编排工具调用。");
    return parseModelBlueprintResponse(toolUse.input);
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      temperature: 0.4,
      messages: [
        { role: "system", content: HARNESS_SYSTEM_PROMPT },
        ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: COMPOSE_BOARD_TOOL_SCHEMA,
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: COMPOSE_BOARD_TOOL_SCHEMA.name },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`模型请求失败（HTTP ${res.status}），请检查 Base URL、API Key 或模型名称。`);
  }
  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
    }>;
  };
  const argsText = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (argsText) {
    return parseModelBlueprintResponse(JSON.parse(argsText));
  }
  const fallbackContent = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = fallbackContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return parseModelBlueprintResponse(JSON.parse(jsonMatch[0]));
  }
  throw new Error("模型响应未包含可解析的排版蓝图 JSON。");
}

function readCurrentLocalDiceMaterial(): Partial<DiceMaterialConfig> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem("hp-dice-presentation") ?? "{}") as {
      skin?: string;
      material?: Partial<DiceMaterialConfig>;
    };
    if (raw.material && typeof raw.material === "object") return raw.material;
    if (raw.skin) return { presetId: raw.skin };
    return null;
  } catch {
    return null;
  }
}

async function requestSingleModelTurn(input: {
  campaignId: string;
  prompt: string;
  board: CampaignBoard;
  config: HarnessApiConfig;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  contextOptions?: CaptureBoardContextOptions;
}): Promise<{ blueprint: BoardHarnessBlueprint; source: "llm" | "offline" }> {
  const { campaignId, prompt, board, config, history, contextOptions } = input;
  if (config.mode === "offline") {
    return {
      blueprint: synthesizeOfflineBlueprint(prompt, board, {
        accountAssets: contextOptions?.accountAssets,
      }),
      source: "offline",
    };
  }

  if (backend === "local") {
    if (!config.apiKey.trim()) {
      return {
        blueprint: synthesizeOfflineBlueprint(prompt, board, {
          accountAssets: contextOptions?.accountAssets,
        }),
        source: "offline",
      };
    }
    return {
      blueprint: await callDirectByokInLocalMode(
        prompt,
        board,
        config,
        history,
        contextOptions,
      ),
      source: "llm",
    };
  }

  const { data, error, response } = await requireSupabase().functions.invoke(
    "board-harness",
    {
      body: {
        campaignId,
        prompt: prompt.trim().slice(0, 4000),
        boardContext: captureBoardContext(board, contextOptions),
        history: history.slice(-6),
        byok: config.apiKey.trim()
          ? {
              provider: config.provider,
              baseUrl: config.baseUrl.trim(),
              apiKey: config.apiKey.trim(),
              model: config.model.trim(),
            }
          : null,
      },
    },
  );

  if (error) {
    const http =
      response ?? (error.context instanceof Response ? error.context : undefined);
    const errBody = http
      ? ((await http.clone().json().catch(() => ({}))) as { error?: string })
      : {};
    const errCode = errBody.error || error.message;
    if (errCode === "HARNESS_KEY_REQUIRED") {
      throw new Error(
        "当前站点未配置托管模型密钥。请在「API 配置」填入你的 API Key，或切换为「内置离线蓝图引擎」。",
      );
    }
    throw new Error(errCode || "AI 编排网关调用失败，请稍后重试。");
  }
  const payload = (data ?? {}) as { blueprint?: unknown; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }
  return {
    blueprint: parseModelBlueprintResponse(payload.blueprint),
    source: "llm",
  };
}

/**
 * 发起一次公告板 Harness 编排请求（含确定性 L2 校验与有上限 1 轮自动自纠环）：
 * - 离线模式（或本地演示且未填 Key）：运行内置零延迟智能蓝图引擎
 * - 云端/BYOK LLM 模式：执行首轮生成 → L2 校验门禁（GLSL 安全、TRPG 意图、积木合法性）→ 若有硬性错误则自动回喂诊断自纠 1 次
 */
export async function requestHarnessBlueprint(input: {
  campaignId: string;
  prompt: string;
  board: CampaignBoard;
  config: HarnessApiConfig;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  accountAssets?: readonly AccountDesignAsset[];
}): Promise<{
  blueprint: BoardHarnessBlueprint;
  compiled: CompiledBoardBlueprint;
  source: "llm" | "offline";
}> {
  const { campaignId, prompt, board, config, history, accountAssets } = input;
  if (!prompt.trim()) throw new Error("请输入你想要的排版或风格描述。");

  const contextOptions: CaptureBoardContextOptions = {
    accountAssets: accountAssets?.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      source: a.source,
      favorite: a.favorite,
      previewColors: a.previewColors,
    })),
    currentDiceMaterial: readCurrentLocalDiceMaterial(),
  };

  let turn = await requestSingleModelTurn({
    campaignId,
    prompt,
    board,
    config,
    history,
    contextOptions,
  });
  let compiled = compileHarnessBlueprint(board, turn.blueprint, prompt, {
    accountAssets,
  });
  let repairRounds = 0;

  // L2 Bounded Self-Correction Gate (at most 1 automatic repair round on LLM errors)
  const blockingIssues = (compiled.verificationIssues ?? []).filter(
    (issue) => issue.severity === "error",
  );
  if (turn.source === "llm" && blockingIssues.length > 0) {
    const diagnosticText = blockingIssues
      .map((item, idx) => `${idx + 1}. [${item.gate}] ${item.message}`)
      .join("\n");
    const repairPrompt = [
      `原始 GM 需求：${prompt.trim()}`,
      "",
      "你上一轮生成的蓝图未通过 L2 确定性校验门禁，请按以下精确报错修正并重新调用 compose_board_blueprint 输出完整合法蓝图：",
      diagnosticText,
    ].join("\n");
    try {
      const repairedTurn = await requestSingleModelTurn({
        campaignId,
        prompt: repairPrompt,
        board,
        config,
        history: [
          ...history.slice(-4),
          { role: "user", content: prompt.trim() },
          { role: "assistant", content: turn.blueprint.summary },
        ],
        contextOptions,
      });
      const repairedCompiled = compileHarnessBlueprint(
        board,
        repairedTurn.blueprint,
        prompt,
        { accountAssets },
      );
      const repairedErrors = (repairedCompiled.verificationIssues ?? []).filter(
        (issue) => issue.severity === "error",
      );
      if (repairedErrors.length <= blockingIssues.length) {
        turn = repairedTurn;
        compiled = repairedCompiled;
        repairRounds = 1;
      }
    } catch {
      // Keep first-pass compiled draft if repair network call fails.
    }
  }

  return {
    blueprint: turn.blueprint,
    compiled: { ...compiled, repairRounds },
    source: turn.source,
  };
}
