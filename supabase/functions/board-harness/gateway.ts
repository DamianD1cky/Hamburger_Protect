export interface HarnessProviderCredentials {
  provider: "openai_compat" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/i,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * 严格校验模型网关地址，防止利用 BYOK baseUrl 发起内网 SSRF 探测。
 * 只允许公网 HTTPS 端点且禁止携带用户名密码。
 */
export function validateModelBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("INVALID_MODEL_BASE_URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("MODEL_HTTPS_REQUIRED");
  }
  if (parsed.username || parsed.password) {
    throw new Error("INVALID_MODEL_BASE_URL");
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error("PRIVATE_MODEL_HOST_FORBIDDEN");
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

export function resolveHarnessCredentials(
  byok: Partial<HarnessProviderCredentials> | null | undefined,
  managedEnv: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    provider?: string;
  },
): HarnessProviderCredentials {
  if (byok && typeof byok.apiKey === "string" && byok.apiKey.trim()) {
    const apiKey = byok.apiKey.trim();
    if (apiKey.length > 512) throw new Error("INVALID_API_KEY");
    const provider =
      byok.provider === "anthropic" ? "anthropic" : "openai_compat";
    const defaultBase =
      provider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : "https://api.openai.com/v1";
    const baseUrl = validateModelBaseUrl(byok.baseUrl || defaultBase);
    const model = (byok.model?.trim() || "gpt-4o-mini").slice(0, 120);
    return { provider, baseUrl, apiKey, model };
  }

  if (managedEnv.apiKey?.trim()) {
    const provider =
      managedEnv.provider === "anthropic" ? "anthropic" : "openai_compat";
    const defaultBase =
      provider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : "https://api.openai.com/v1";
    const baseUrl = validateModelBaseUrl(managedEnv.baseUrl || defaultBase);
    const model = (managedEnv.model?.trim() || "gpt-4o-mini").slice(0, 120);
    return { provider, baseUrl, apiKey: managedEnv.apiKey.trim(), model };
  }

  throw new Error("HARNESS_KEY_REQUIRED");
}

export function extractBlueprintFromModelJson(
  provider: "openai_compat" | "anthropic",
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error("EMPTY_MODEL_RESPONSE");
  }
  if (provider === "anthropic") {
    const content = (payload as { content?: Array<{ type?: string; input?: unknown }> })
      .content;
    const toolUse = content?.find((item) => item.type === "tool_use");
    if (!toolUse?.input || typeof toolUse.input !== "object") {
      throw new Error("MISSING_TOOL_CALL");
    }
    return toolUse.input as Record<string, unknown>;
  }

  const choices = (
    payload as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ function?: { arguments?: string } }>;
        };
      }>;
    }
  ).choices;
  const firstMsg = choices?.[0]?.message;
  const argsText = firstMsg?.tool_calls?.[0]?.function?.arguments;
  if (argsText) {
    return JSON.parse(argsText) as Record<string, unknown>;
  }
  const contentText = firstMsg?.content ?? "";
  const match = contentText.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
  throw new Error("MISSING_TOOL_CALL");
}
