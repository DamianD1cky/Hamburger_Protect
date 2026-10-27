import { burgerIndexInfo } from "./burgerIndex";
import { resourceGroups, resourceLabels } from "./resources";
import type { BoardActivity, CampaignBoard, QuestStatus } from "./types";

const questLabels: Record<QuestStatus, string> = {
  open: "可领取",
  claimed: "已领取",
  in_progress: "进行中",
  pending_review: "待审核",
  completed: "已完成",
  failed: "需重试",
};
const entityLabels: Record<string, string> = {
  note: "便签",
  quest: "工作指示",
  resource: "物资与设施",
  checklist: "检查项",
  campaign: "班次",
  member: "成员",
  settings: "房间配置",
};
const fieldLabels: Record<string, string> = {
  title: "标题",
  body: "内容",
  name: "名称",
  label: "检查内容",
  quantity: "数量",
  status: "状态",
  completed: "检查状态",
  assignee_label: "负责人",
  due_at: "截止时间",
  color: "便签颜色",
  burger_index: "汉堡屋指数",
  group_index: "物资分类",
  x: "横向位置",
  y: "纵向位置",
  rotation: "角度",
  sort_order: "顺序",
  category_id: "检查分类",
  pinned: "置顶状态",
  section_titles: "区块标题",
  hidden_sections: "隐藏区块",
  background_path: "场景背景",
  note_texture_path: "便签纸张",
};
const colorLabels: Record<string, string> = {
  yellow: "黄色",
  pink: "粉色",
  blue: "蓝色",
  green: "绿色",
};

export function activityActor(
  event: BoardActivity,
  members: CampaignBoard["members"],
) {
  return (
    event.actorName ??
    members.find((m) => m.userId === event.actorId)?.characterName ??
    "系统"
  );
}

export function activitySummary(event: BoardActivity) {
  const target = event.payload.after ?? event.payload.before ?? {};
  const title = String(target.title ?? target.name ?? target.label ?? "");
  const subject = title ? `「${title}」` : "";
  const label = entityLabels[event.entityType] ?? "公告板";
  switch (event.eventType) {
    case "join_requested":
      return `申请加入班次 · ${event.payload.job_title ?? ""}`;
    case "join_approved":
      return `批准了「${event.payload.character_name ?? "玩家"}」的入店申请`;
    case "join_rejected":
      return `拒绝了「${event.payload.character_name ?? "玩家"}」的入店申请`;
    case "join_cancelled":
      return "撤回了入店申请";
    case "campaign_created":
      return "创建了班次";
    case "member_joined":
      return `加入了班次${event.payload.job_title ? ` · ${event.payload.job_title}` : ""}`;
    case "member_removed":
      return `将「${event.payload.character_name ?? "玩家"}」移出房间`;
    case "member_profile_updated":
      return "更新了角色名字或称呼";
    case "note_pinned":
      return `置顶了便签${subject}`;
    case "note_unpinned":
      return `取消置顶便签${subject}`;
    case "settings_updated":
      return "更新了房间配置";
    case "campaign_archived":
      return "归档了班次";
    case "burger_index_changed":
      return "调整了汉堡屋指数";
    case "note_moved":
      return `移动了便签${subject}`;
    case "checklist_status_changed":
      return `${target.completed ? "完成" : "取消完成"}了检查项${subject}`;
    case "quest_status_changed":
      return `将工作指示${subject}更新为${questLabels[target.status as QuestStatus] ?? String(target.status)}`;
    default: {
      const action = event.eventType.endsWith("_created")
        ? "新增"
        : event.eventType.endsWith("_deleted")
          ? "删除"
          : "更新";
      return `${action}了${label}${subject}`;
    }
  }
}

function displayValue(
  event: BoardActivity,
  field: string,
  value: unknown,
): string {
  if (value == null || value === "") return "未填写";
  if (field === "completed") return value ? "已完成" : "未完成";
  if (field === "pinned") return value ? "已置顶" : "未置顶";
  if (field === "burger_index") return burgerIndexInfo(Number(value)).label;
  if (field === "color") return colorLabels[String(value)] ?? String(value);
  if (field === "group_index")
    return (
      resourceGroups.find((group) => group.id === Number(value))?.title ??
      String(value)
    );
  if (field === "status") {
    if (event.entityType === "quest")
      return questLabels[value as QuestStatus] ?? String(value);
    if (event.entityType === "resource")
      return (
        resourceLabels[value as keyof typeof resourceLabels] ?? String(value)
      );
    return value === "active"
      ? "进行中"
      : value === "archived"
        ? "已归档"
        : String(value);
  }
  if (field === "due_at") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.valueOf()))
      return date.toLocaleString("zh-CN", { hour12: false });
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function activityDetails(event: BoardActivity) {
  const { before, after } = event.payload;
  const fields = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ];
  return fields
    .filter(
      (field) =>
        JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]),
    )
    .map((field) => ({
      field,
      label: fieldLabels[field] ?? field,
      before: before ? displayValue(event, field, before[field]) : null,
      after: after ? displayValue(event, field, after[field]) : null,
    }));
}
