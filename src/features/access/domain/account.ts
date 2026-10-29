export const GM_USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const GM_PASSWORD_MIN_LENGTH = 8;
export function normalizeGmUsername(username: string) {
  return username.trim().toLowerCase();
}

export function usernameToEmail(username: string) {
  return (
    normalizeGmUsername(username) +
    "@" +
    (import.meta.env.VITE_GM_ACCOUNT_DOMAIN?.trim() || "gm.local")
  );
}

/**
 * Nhost 同时给出人类可读消息和连字符错误码，两者都参与匹配，
 * 避免只依赖某一种文案格式而失效。
 */
function describeError(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  else parts.push(String(error));
  // Supabase Auth errors carry the stable machine code separately from the
  // human message (e.g. code "user_already_exists" vs "User already
  // registered"); both must participate or most mappings silently miss.
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") parts.push(code);
  const body = (error as { body?: unknown } | null)?.body;
  if (body && typeof body === "object") {
    parts.push(JSON.stringify(body));
  } else if (typeof body === "string") {
    parts.push(body);
  }
  return parts.join(" ").toLowerCase();
}

const accessErrorMessages: Array<[string[], string]> = [
  [["maintenance"], "正在迁移或维护，请稍后再试。"],
  [
    ["identity_required", "account_disabled"],
    "身份未关联或已停用，请联系站长。",
  ],
  [["campaign_role_required"], "你没有本房间的操作权限。"],
  [["campaign_not_active"], "本次战役已结束，不能继续修改。"],
  [
    ["one_active_campaign_per_player"],
    "你已经参加了一个仍在营业的战役，不能重复入店。",
  ],
  [
    ["already_campaign_member", "campaign_role_conflict"],
    "你已经在这个战役中担任其他角色，不能再次申请加入。",
  ],
  [
    ["join_request_pending"],
    "你已有待审批的入店申请，请先等待结果或撤回申请。",
  ],
  [["join_request_already_reviewed"], "申请状态已变更，请刷新后查看结果。"],
  [["campaign_not_found"], "班次码无效，或该战役已经打烊。"],
  [
    [
      "user-already-exists",
      "user_already_exists",
      "already exists",
      "already registered",
      "uniqueness",
    ],
    "该账号名已被占用，请换一个或直接登录。",
  ],
  [
    [
      "invalid-email-password",
      "invalid_credentials",
      "invalid email or password",
      "invalid login credentials",
      "incorrect password",
    ],
    "账号或密码不正确。",
  ],
  [
    ["password-too-short", "weak_password"],
    "密码至少需要 " + GM_PASSWORD_MIN_LENGTH + " 位。",
  ],
  [["disabled-endpoint", "signup-disabled"], "该入口已被总部关闭。"],
  [["unverified-user", "unverified"], "账号尚未激活，请联系总部处理。"],
  [["role-not-allowed", "disabled-user"], "该账号没有值班权限。"],
  [["gm_approval_required"], "GM 权限尚未获批，请联系站长申请。"],
  [["gm_account_required"], "只有店长账号可以创建战役。"],
  [["gm_job_title_required", "invalid_job_title"], "岗位不符合员工手册规定。"],
  [["auth_required"], "会话已失效，请重新签到。"],
  [["rate", "429"], "请求过于频繁，请稍后再试。"],
];

export function getAccessErrorMessage(error: unknown) {
  const normalized = describeError(error);
  const matched = accessErrorMessages.find(([needles]) =>
    needles.some((needle) => normalized.includes(needle)),
  );
  return matched ? matched[1] : "操作未完成。请检查账号信息或网络后重试。";
}
