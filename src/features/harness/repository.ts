import { backend } from "../../lib/backend";
import { requireSupabase, rpc } from "../../lib/supabase/client";
import { applyOperations, emptyBoard, visibleBoard, type Command, type HarnessBoard, type HarnessRole, type Operation } from "./model";

type LocalRecord = { board: HarnessBoard; commands: Record<string, string> };
const key = (campaignId: string) => `harness-v1:${campaignId}`;
function readLocal(campaignId: string): LocalRecord {
  const stored = localStorage.getItem(key(campaignId));
  return stored ? JSON.parse(stored) : { board: emptyBoard(), commands: {} };
}
export async function getHarness(campaignId: string, role: HarnessRole): Promise<HarnessBoard> {
  if (backend === "supabase") return rpc("get_harness_board", { p_campaign_id: campaignId });
  return visibleBoard(readLocal(campaignId).board, role);
}
export async function commitHarness(campaignId: string, role: HarnessRole, command: Command): Promise<HarnessBoard> {
  if (backend === "supabase") return rpc("apply_harness_command", {
    p_campaign_id: campaignId, p_command_id: command.id,
    p_revision: command.revision, p_operations: command.operations,
  });
  // Web Locks serializes demo writes between tabs. No local demo data is sent to the cloud.
  if (!navigator.locks) throw new Error("本地演示需要支持 Web Locks 的浏览器。");
  return navigator.locks.request(key(campaignId), () => {
    const stored = readLocal(campaignId);
    const signature = JSON.stringify({ role, revision: command.revision, operations: command.operations });
    if (stored.commands[command.id]) {
      if (stored.commands[command.id] !== signature) throw new Error("COMMAND_ID_REUSED");
      return visibleBoard(stored.board, role);
    }
    if (stored.board.revision !== command.revision) throw new Error("HARNESS_CONFLICT");
    stored.board = applyOperations(stored.board, command.operations, role);
    stored.commands[command.id] = signature;
    localStorage.setItem(key(campaignId), JSON.stringify(stored));
    return visibleBoard(stored.board, role);
  });
}
export async function proposeWithAgent(campaignId: string, prompt: string): Promise<{ summary: string; operations: Operation[]; revision: number }> {
  if (backend === "local") throw new Error("本地演示尚未连接 AI。可使用下方模板或直接添加组件。");
  const { data, error } = await requireSupabase().functions.invoke("board-agent", {
    body: { campaignId, prompt },
  });
  if (error) throw new Error("助手暂不可用，请检查 board-agent 部署和模型配置。");
  if (data?.error) throw new Error(data.error);
  return data;
}
export function harnessError(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败，请重试。";
  if (message.includes("HARNESS_CONFLICT")) return "房间已有新修改。已刷新公告板，请重新预览后提交。";
  if (message.includes("HARNESS") || message.includes("CAMPAIGN_ROLE") || message.includes("IDENTITY"))
    return "操作未通过房间校验，请检查当前权限和组件范围。";
  if (message.includes("get_harness_board") || message.includes("schema cache"))
    return "当前服务尚未安装跑团工作台迁移，请先在测试环境部署。";
  return message;
}
