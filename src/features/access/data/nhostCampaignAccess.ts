import { nhost } from "../../../lib/nhost/client";
import type {
  CampaignRole,
  EmployeePosition,
} from "../../campaign/domain/types";

/**
 * Nhost 的邮箱密码认证需要一个邮箱作为账号标识，但店长不需要看到这一层。
 * 账号名统一映射到合成地址，密码哈希、会话签发与刷新仍由 Nhost 托管。
 */
const GM_ACCOUNT_DOMAIN = "gm.local";

export const GM_USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const GM_PASSWORD_MIN_LENGTH = 8;

export interface GmAccess {
  userId: string;
  accountName: string;
  displayName: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
}

export interface CampaignJoinRequest {
  id: string;
  campaignId: string;
  userId: string;
  campaignName: string;
  characterName: string;
  jobTitle: string;
  profileText: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
}

interface RemoteJoinRequest {
  id: string;
  campaign_id: string;
  user_id: string;
  campaign_name: string;
  character_name: string;
  job_title: CampaignJoinRequest["jobTitle"];
  status: CampaignJoinRequest["status"];
  requested_at: string;
  reviewed_at: string | null;
  review_note: string;
}

const JOIN_REQUEST_FIELDS = `id campaign_id user_id campaign_name character_name job_title
  status requested_at reviewed_at review_note`;

function toJoinRequest(row: RemoteJoinRequest): CampaignJoinRequest {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    campaignName: row.campaign_name,
    characterName: row.character_name,
    jobTitle: row.job_title,
    profileText: "",
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

export interface ActiveCampaignAccess {
  campaignId: string;
  name: string;
  joinCode: string;
  status: "active" | "archived";
  role: CampaignRole;
  characterName: string;
  jobTitle: EmployeePosition;
}

interface ActiveCampaignResponse {
  campaign_members: Array<{
    campaign_id: string;
    role: CampaignRole;
    character_name: string;
    job_title: EmployeePosition;
    campaign: {
      name: string;
      join_code: string;
      status: "active" | "archived";
    };
  }>;
}

function requireClient() {
  if (!nhost) throw new Error("Nhost 尚未配置");
  return nhost;
}

/**
 * Hasura 会把函数里 raise exception 的文案藏在 extensions 中，只把
 * 「database query error」当作 errors[].message 返回，这里把两层都取出，
 * 交给 getAccessErrorMessage 做中文映射。
 */
function graphqlErrorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const { message, extensions } = error as {
    message?: string;
    extensions?: unknown;
  };
  return [message ?? "", extensions ? JSON.stringify(extensions) : ""]
    .filter(Boolean)
    .join(" ");
}

async function request<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await requireClient().graphql.request<T>({
    query,
    variables,
  });
  if (response.body.errors?.length) {
    throw new Error(response.body.errors.map(graphqlErrorText).join("; "));
  }
  if (!response.body.data) throw new Error("云端没有返回数据");
  return response.body.data;
}

export function normalizeGmUsername(username: string) {
  return username.trim().toLowerCase();
}

function usernameToEmail(username: string) {
  return normalizeGmUsername(username) + "@" + GM_ACCOUNT_DOMAIN;
}

/**
 * Nhost 同时给出人类可读消息和连字符错误码，两者都参与匹配，
 * 避免只依赖某一种文案格式而失效。
 */
function describeError(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  else parts.push(String(error));
  const body = (error as { body?: unknown } | null)?.body;
  if (body && typeof body === "object") {
    parts.push(JSON.stringify(body));
  } else if (typeof body === "string") {
    parts.push(body);
  }
  return parts.join(" ").toLowerCase();
}

const accessErrorMessages: Array<[string[], string]> = [
  [
    ["one_active_campaign_per_player"],
    "你已经参加了一个仍在营业的战役，不能重复入店。",
  ],
  [
    ["join_request_pending"],
    "你已有待审批的入店申请，请先等待结果或撤回申请。",
  ],
  [["join_request_already_reviewed"], "申请状态已变更，请刷新后查看结果。"],
  [
    ["player_account_required"],
    "玩家入店申请需要匿名员工身份，请先退出店长账号。",
  ],
  [["campaign_not_found"], "班次码无效，或该战役已经打烊。"],
  [
    ["user-already-exists", "already exists", "uniqueness"],
    "该账号名已被占用，请换一个或直接登录。",
  ],
  [
    [
      "invalid-email-password",
      "invalid email or password",
      "incorrect password",
    ],
    "账号或密码不正确。",
  ],
  [["password-too-short"], "密码至少需要 " + GM_PASSWORD_MIN_LENGTH + " 位。"],
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

export async function getActiveCampaign(): Promise<ActiveCampaignAccess | null> {
  const session = requireClient().getUserSession();
  if (!session?.user) return null;
  const data = await request<ActiveCampaignResponse>(
    `query ActiveCampaignAccess($userId: uuid!) {
      campaign_members(
        where: { user_id: { _eq: $userId }, active: { _eq: true } }
        limit: 1
      ) {
        campaign_id role character_name job_title
        campaign { name join_code status }
      }
    }`,
    { userId: session.user.id },
  );
  const membership = data.campaign_members[0];
  if (!membership) return null;
  return {
    campaignId: membership.campaign_id,
    name: membership.campaign.name,
    joinCode: membership.campaign.join_code,
    status: membership.campaign.status,
    role: membership.role,
    characterName: membership.character_name,
    jobTitle: membership.job_title,
  };
}

export async function getGmAccess(): Promise<GmAccess> {
  const session = requireClient().getUserSession();
  if (!session?.user || session.user.isAnonymous)
    throw new Error("GM_ACCOUNT_REQUIRED");
  const query = `query GmAccess($userId: uuid!) {
    gm_access(where: {user_id: {_eq: $userId}}, limit: 1) {
      user_id account_name display_name status requested_at reviewed_at review_note
    }
  }`;
  type RemoteAccess = {
    user_id: string;
    account_name: string;
    display_name: string;
    status: GmAccess["status"];
    requested_at: string;
    reviewed_at: string | null;
    review_note: string;
  };
  const read = () =>
    request<{ gm_access: RemoteAccess[] }>(query, { userId: session.user!.id });
  let result = await read();
  if (!result.gm_access.length) {
    // The trusted session determines the applicant; an existing decision cannot be reset.
    await request(`mutation RequestGmAccess {
      request_gm_access { user_id }
    }`);
    result = await read();
  }
  const row = result.gm_access[0];
  if (!row) throw new Error("GM 审批状态读取失败，请重试。");
  return {
    userId: row.user_id,
    accountName: row.account_name,
    displayName: row.display_name,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

export async function registerGm(input: {
  username: string;
  password: string;
  displayName: string;
}) {
  const client = requireClient();
  const response = await client.auth.signUpEmailPassword({
    email: usernameToEmail(input.username),
    password: input.password,
    options: {
      displayName: input.displayName.trim() || "值班店长",
      locale: "zh",
      defaultRole: "user",
      allowedRoles: ["user"],
      metadata: { gmUsername: normalizeGmUsername(input.username) },
    },
  });
  if (!response.body.session) throw new Error("注册未返回会话");
  return response.body.session;
}

export async function signInGm(input: { username: string; password: string }) {
  const client = requireClient();
  const response = await client.auth.signInEmailPassword({
    email: usernameToEmail(input.username),
    password: input.password,
  });
  if (!response.body.session) throw new Error("登录未返回会话");
  return response.body.session;
}

/**
 * 与仓储层的 callFunction 保持一致：只确认函数成功执行，不读取返回行。
 * 本实例下返回复合类型的函数调用固定回传 null，真正的结果状态由调用方的
 * 战役查询负责确认。
 */
export async function createCampaign(input: {
  name: string;
  characterName: string;
}) {
  await request(
    `mutation CreateCampaign($args: create_campaign_args!) {
      create_campaign(args: $args) { id }
    }`,
    {
      args: {
        p_name: input.name.trim(),
        p_character_name: input.characterName.trim(),
        p_job_title: "店长",
      },
    },
  );
}

export async function registerEmployee(displayName: string) {
  const client = requireClient();
  const existing = client.getUserSession();
  if (!existing?.user) {
    const response = await client.auth.signInAnonymous({
      displayName: displayName.trim(),
      locale: "zh",
    });
    if (!response.body.session) throw new Error("匿名员工签到失败");
  } else if (!existing.user.isAnonymous) {
    throw new Error("玩家入口需要匿名员工会话，请先退出店长账号。");
  }
}
export async function joinCampaign(input: {
  joinCode: string;
  characterName: string;
  jobTitle: string;
  profileText: string;
}) {
  const client = requireClient();
  let session = client.getUserSession();
  if (!session?.user) {
    const response = await client.auth.signInAnonymous({
      displayName: input.characterName.trim(),
      locale: "zh",
      metadata: { employeePosition: input.jobTitle },
    });
    if (!response.body.session) throw new Error("匿名员工签到失败");
    session = client.getUserSession();
  }
  if (!session?.user?.isAnonymous) {
    throw new Error("玩家入口需要匿名员工会话，请先退出店长账号。");
  }
  // 玩家一次只能参加一个仍在营业的战役。先自查一次，避免把 Hasura 折叠后的
  // 错误笼统显示成班次码问题。
  if (await getActiveCampaign()) {
    throw new Error("ONE_ACTIVE_CAMPAIGN_PER_PLAYER");
  }
  await request(
    `mutation RequestCampaignJoin($args: request_campaign_join_args!) {
      request_campaign_join(args: $args) { id }
    }`,
    {
      args: {
        p_join_code: input.joinCode.trim().toUpperCase(),
        p_character_name: input.characterName.trim(),
        p_job_title: input.jobTitle,
      },
    },
  );
}

export async function getOwnJoinRequest(): Promise<CampaignJoinRequest | null> {
  const session = requireClient().getUserSession();
  if (!session?.user?.isAnonymous) return null;
  const data = await request<{ campaign_join_requests: RemoteJoinRequest[] }>(
    `query OwnJoinRequest($userId: uuid!) {
      campaign_join_requests(where: {user_id: {_eq: $userId}, status: {_neq: "cancelled"}},
        order_by: [{requested_at: desc}, {id: desc}], limit: 1) { ${JOIN_REQUEST_FIELDS} }
    }`,
    { userId: session.user.id },
  );
  return data.campaign_join_requests[0]
    ? toJoinRequest(data.campaign_join_requests[0])
    : null;
}

export async function getCampaignJoinInbox(campaignId: string) {
  const data = await request<{
    campaign_join_requests: RemoteJoinRequest[];
    campaign_join_requests_aggregate: { aggregate: { count: number } };
  }>(
    `query CampaignJoinInbox($campaignId: uuid!) {
    campaign_join_requests(where: {campaign_id: {_eq: $campaignId}, status: {_eq: "pending"}},
      order_by: [{requested_at: asc}, {id: asc}], limit: 30) { ${JOIN_REQUEST_FIELDS} }
    campaign_join_requests_aggregate(where: {campaign_id: {_eq: $campaignId}, status: {_eq: "pending"}}) {
      aggregate { count }
    }
  }`,
    { campaignId },
  );
  return {
    requests: data.campaign_join_requests.map(toJoinRequest),
    total: data.campaign_join_requests_aggregate.aggregate.count,
  };
}

export async function reviewCampaignJoin(
  id: string,
  approved: boolean,
  note: string,
) {
  await request(
    `mutation ReviewCampaignJoin($args: review_campaign_join_args!) {
    review_campaign_join(args: $args) { id }
  }`,
    { args: { p_request_id: id, p_approved: approved, p_note: note.trim() } },
  );
  const data = await request<{
    campaign_join_requests_by_pk: { status: string } | null;
  }>(
    `query ReviewedJoinRequest($id: uuid!) { campaign_join_requests_by_pk(id: $id) { status } }`,
    { id },
  );
  if (
    data.campaign_join_requests_by_pk?.status !==
    (approved ? "approved" : "rejected")
  ) {
    throw new Error("审批未完成，请检查权限并刷新申请。");
  }
}

export async function cancelCampaignJoin(id: string) {
  await request(
    `mutation CancelCampaignJoin($args: cancel_campaign_join_args!) {
    cancel_campaign_join(args: $args) { id }
  }`,
    { args: { p_request_id: id } },
  );
}

export async function signOut() {
  const client = requireClient();
  const session = client.getUserSession();
  if (!session) return;
  try {
    await client.auth.signOut({ refreshToken: session.refreshToken });
  } finally {
    client.clearSession();
  }
}
