export type HarnessRole = "gm" | "player" | "observer";
export interface Block {
  id: string;
  kind: "note" | "counter" | "clock";
  title: string;
  visibility: "members" | "gm";
  editable: "gm" | "players";
  max: number;
  value: number;
  text: string;
}
export interface HarnessBoard {
  schema: 1;
  revision: number;
  blocks: Block[];
}
export type Operation =
  | { type: "create"; block: Block }
  | { type: "configure"; id: string; title: string; max: number; visibility: Block["visibility"]; editable: Block["editable"] }
  | { type: "adjust"; id: string; delta: number }
  | { type: "write"; id: string; text: string }
  | { type: "remove"; id: string };
export interface Command {
  id: string;
  revision: number;
  operations: Operation[];
}
export const emptyBoard = (): HarnessBoard => ({ schema: 1, revision: 0, blocks: [] });
export const canEdit = (role: HarnessRole, block: Block) =>
  role === "gm" || (role === "player" && block.editable === "players" && block.visibility === "members");
export const visibleBoard = (board: HarnessBoard, role: HarnessRole): HarnessBoard => ({
  ...board, blocks: board.blocks.filter(b => role === "gm" || b.visibility === "members"),
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validBlock(b: Block) {
  return b && uuid.test(b.id) && ["note", "counter", "clock"].includes(b.kind)
    && typeof b.title === "string" && b.title.trim().length > 0 && b.title.length <= 80
    && ["members", "gm"].includes(b.visibility) && ["gm", "players"].includes(b.editable)
    && Number.isInteger(b.max) && b.max >= 1 && b.max <= 1000000
    && Number.isInteger(b.value) && b.value >= 0 && b.value <= b.max
    && typeof b.text === "string" && b.text.length <= 8000
    && Object.keys(b).every(key => ["id", "kind", "title", "visibility", "editable", "max", "value", "text"].includes(key));
}
/** Shared by UI previews, the demo repository and the model adapter. SQL is authoritative. */
export function applyOperations(board: HarnessBoard, operations: Operation[], role: HarnessRole): HarnessBoard {
  if (board.schema !== 1) throw new Error("请更新客户端后再编辑此房间。");
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 20)
    throw new Error("一次操作需要包含 1–20 项修改。");
  const next = structuredClone(board);
  for (const op of operations) {
    if (!op || typeof op !== "object") throw new Error("无效的组件操作。");
    if (op.type === "create") {
      if (role !== "gm") throw new Error("只有 GM 可以添加组件。");
      if (!validBlock(op.block) || next.blocks.some(b => b.id === op.block.id))
        throw new Error("组件格式不正确，或组件 ID 已存在。");
      next.blocks.push(structuredClone(op.block));
    } else {
      const b = next.blocks.find(b => b.id === op.id);
      if (!b || !canEdit(role, b)) throw new Error("组件不存在或你没有操作权限。");
      switch (op.type) {
        case "configure":
          if (role !== "gm") throw new Error("只有 GM 可以配置组件。");
          Object.assign(b, { title: op.title, max: op.max, visibility: op.visibility, editable: op.editable });
          break;
        case "adjust":
          if (b.kind === "note" || !Number.isInteger(op.delta) || Math.abs(op.delta) > 1000000)
            throw new Error("计数操作无效。");
          b.value += op.delta;
          break;
        case "write":
          if (b.kind !== "note") throw new Error("只有说明组件支持文本修改。");
          b.text = op.text;
          break;
        case "remove":
          if (role !== "gm") throw new Error("只有 GM 可以移除组件。");
          next.blocks = next.blocks.filter(item => item.id !== b.id);
          break;
        default: throw new Error("客户端不支持此操作。");
      }
      if (op.type !== "remove" && !validBlock(b))
        throw new Error("修改超出组件范围；调整上限时需保留现有数值。");
    }
  }
  if (next.blocks.length > 100) throw new Error("每个房间最多添加 100 个组件。");
  next.revision++;
  return next;
}
export function newBlock(kind: Block["kind"], title: string): Block {
  return { id: crypto.randomUUID(), kind, title, visibility: "members", editable: "gm",
    max: kind === "clock" ? 6 : 10, value: 0, text: "" };
}
export function templateOperations(theme: "调查" | "潜入" | "汉堡店"): Operation[] {
  const titles = theme === "调查" ? ["案件说明", "调查进度", "调查经费"]
    : theme === "潜入" ? ["行动计划", "警戒程度", "装备补给"]
    : ["营业说明", "危机进度", "汉堡库存"];
  return (["note", "clock", "counter"] as const).map((kind, i) => ({
    type: "create", block: { ...newBlock(kind, titles[i]),
      text: kind === "note" ? "由 GM 填写本场景的规则与目标。" : "",
      editable: kind === "counter" ? "players" : "gm",
      value: kind === "counter" ? 10 : 0 },
  }));
}
export function describeOperation(op: Operation, board: HarnessBoard) {
  if (op.type === "create") return `添加「${op.block.title}」`;
  const title = board.blocks.find(b => b.id === op.id)?.title ?? op.id;
  if (op.type === "adjust") return `「${title}」${op.delta >= 0 ? "+" : ""}${op.delta}`;
  if (op.type === "write") return `更新「${title}」的内容`;
  if (op.type === "configure") return `配置「${title}」`;
  return `移除「${title}」`;
}
