import { requireSupabase, rpc } from "../../../lib/supabase/client";
import type { GmAccess } from "../domain/types";

export interface GmApplication extends GmAccess {
  unavailable: boolean;
  reviewerName: string | null;
}
export interface GmApplicationPage {
  applications: GmApplication[];
  hasMore: boolean;
}
export type GmApplicationView = "pending" | "reviewed";

export async function getSiteAdminAccess(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("get_site_admin_access");
  // Keep the regular lobby usable before this migration is deployed.
  if (error?.code === "PGRST202") return false;
  if (error) throw new Error(error.message);
  return data === true;
}
export async function listGmApplications(
  view: GmApplicationView, before?: { requestedAt: string; userId: string },
): Promise<GmApplicationPage> {
  const result = await rpc<{
    applications: Array<{
      user_id: string; account_name: string; display_name: string; status: GmAccess["status"];
      requested_at: string; reviewed_at: string | null; review_note: string;
      unavailable: boolean; reviewer_name: string | null;
    }>;
    has_more: boolean;
  }>("list_gm_applications", {
    p_view: view, p_before: before?.requestedAt ?? null, p_before_user_id: before?.userId ?? null,
  });
  return {
    applications: result.applications.map((r) => ({
      userId: r.user_id, accountName: r.account_name, displayName: r.display_name,
      status: r.status, requestedAt: r.requested_at, reviewedAt: r.reviewed_at, reviewNote: r.review_note,
      unavailable: r.unavailable, reviewerName: r.reviewer_name,
    })),
    hasMore: result.has_more,
  };
}
export async function reviewGmApplication(application: GmApplication, approved: boolean, note: string) {
  await rpc("review_gm_application", {
    p_user_id: application.userId, p_approved: approved, p_note: note.trim(),
    p_expected_requested_at: application.requestedAt,
  });
}
export function siteAdminError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : "操作未完成，请重试。";
  return ({
    SITE_ADMIN_REQUIRED: "站长权限已失效，请重新登录或联系站长。",
    GM_APPLICATION_ALREADY_REVIEWED: "这项申请已被处理，列表已刷新。",
    GM_APPLICATION_NOT_FOUND: "这项申请已不存在，列表已刷新。",
    GM_APPLICANT_UNAVAILABLE: "此账号已停用或封禁，不能批准。",
    INVALID_GM_REVIEW: "备注不能超过 500 个字符。",
    MAINTENANCE: "系统正在维护，暂时不能审批。",
  } as Record<string, string>)[text] ?? text;
}
