export const GM_USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_BYTES = 72;
// Kept as an alias for the existing access form imports.
export const GM_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;

export function validateNewPassword(password: string, confirmation: string) {
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  if ([...password].length < PASSWORD_MIN_LENGTH)
    throw new Error("PASSWORD_TOO_SHORT");
  // Supabase uses bcrypt. Reject overlong UTF-8 input instead of silently
  // accepting different passwords which hash to the same 72-byte prefix.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES)
    throw new Error("PASSWORD_TOO_LONG");
}

export function validateDisplayName(displayName: string) {
  const name = displayName.trim();
  if ([...name].length < 1 || [...name].length > 32)
    throw new Error("INVALID_DISPLAY_NAME");
  return name;
}
export function normalizeGmUsername(username: string) {
  return username.trim().toLowerCase();
}

export function usernameToEmail(username: string) {
  const normalized = normalizeGmUsername(username);
  if (!GM_USERNAME_PATTERN.test(normalized)) throw new Error("INVALID_USERNAME");
  return (
    normalized +
    "@" +
    (import.meta.env?.VITE_GM_ACCOUNT_DOMAIN?.trim() || "gm.local")
  );
}

// Stable Auth codes and RPC messages are mapped without exposing raw errors.
function describeError(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  else {
    const message = (error as { message?: unknown } | null)?.message;
    if (typeof message === "string") parts.push(message);
  }
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
  [["invalid_username"], "账号名需要 3–20 位小写字母、数字、下划线或短横线。"],
  [["invalid_display_name"], "昵称需要 1–32 个字符，不能只填空格。"],
  [["password_mismatch"], "两次输入的密码不一致。"],
  [["password_too_short"], "新密码至少需要 15 个字符。"],
  [["password_too_long"], "密码不能超过 72 个 UTF-8 字节；中文通常每字占 3 个字节。"],
  [["same_password"], "新密码不能与当前密码相同。"],
  [["reauthentication_needed", "reauthentication_not_valid"], "需要重新验证身份，请重新登录后再修改密码。"],
  [["current_password", "invalid_current_password"], "当前密码不正确。"],
  [["session_changed"], "登录账号已改变，请重新打开账号设置。"],
  [["anonymous_identity_disabled"], "旧匿名身份已停用，请注册账号后重新加入。"],
  [["auth_unavailable", "failed to fetch", "network"], "暂时无法连接登录服务，请检查网络后重试。"],
  [["email_not_confirmed"], "账号尚未激活，请联系站长。"],
  [["signup_disabled", "email_provider_disabled"], "暂时未开放注册，请联系站长。"],
  [["user_banned"], "账号已停用，请联系站长。"],
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
    "密码未满足服务端安全要求，请使用更长且未重复使用的密码。",
  ],
  [["disabled-endpoint", "signup-disabled"], "该入口已被总部关闭。"],
  [["unverified-user", "unverified"], "账号尚未激活，请联系总部处理。"],
  [["role-not-allowed", "disabled-user"], "该账号没有值班权限。"],
  [["gm_approval_required"], "GM 权限尚未获批，请联系站长申请。"],
  [["gm_account_required"], "只有店长账号可以创建战役。"],
  [["gm_job_title_required", "invalid_job_title"], "岗位不符合员工手册规定。"],
  [["auth_required"], "会话已失效，请重新签到。"],
  [["rate_limit", "too many requests", "429"], "请求过于频繁，请稍后再试。"],
];

export function getAccessErrorMessage(error: unknown) {
  const normalized = describeError(error);
  const matched = accessErrorMessages.find(([needles]) =>
    needles.some((needle) => normalized.includes(needle)),
  );
  return matched ? matched[1] : "操作未完成。请检查账号信息或网络后重试。";
}
