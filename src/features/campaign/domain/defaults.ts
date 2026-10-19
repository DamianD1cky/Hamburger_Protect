import type { CampaignBoard, ResourceItem } from "./types";

const resourceGroups: Array<Array<Omit<ResourceItem, "group" | "status">>> = [
  [
    { id: "buns", name: "面包胚", quantity: "300 个" },
    { id: "beef", name: "牛肉饼", quantity: "200 片" },
    { id: "cheese", name: "芝士片", quantity: "150 片" },
    { id: "water", name: "饮用水", quantity: "8 箱" },
    { id: "first-aid", name: "急救用品", quantity: "1 套" },
  ],
  [
    { id: "barricade", name: "桌椅路障", quantity: "12 组" },
    { id: "lumber", name: "木板与钉子", quantity: "24 件" },
    { id: "tools", name: "维修工具", quantity: "2 箱" },
    { id: "fuel", name: "备用燃料", quantity: "1 桶" },
    { id: "lights", name: "应急照明", quantity: "6 盏" },
  ],
  [
    { id: "radios", name: "对讲机", quantity: "6 部" },
    { id: "batteries", name: "备用电池", quantity: "18 节" },
    { id: "cleaning", name: "清洁用品", quantity: "1 车" },
    { id: "extinguishers", name: "灭火器", quantity: "4 具" },
    { id: "staff-burger", name: "员工汉堡", quantity: "按需制作" },
  ],
];

const checklistLabels = [
  "入口、窗户和员工通道已加固",
  "冷藏柜、炉具及燃气状态已检查",
  "应急电源与备用照明可用",
  "仓库工具和可替代物资已盘点",
  "通信设备保持监听",
  "异常顾客已识别并隔离",
  "员工饮水、进食与短休已安排",
  "危险行动已进行后果评估",
  "物资消耗已写入工作记录",
  "最新公司指示来源已确认",
  "无明确行动人员正在制作汉堡",
];

export const defaultBoard: CampaignBoard = {
  campaign: {
    id: "demo-campaign",
    name: "汉○王夜班危机营业",
    joinCode: "BURGER",
    burgerIndex: 5,
    status: "active",
  },
  viewer: {
    id: "demo-gm",
    displayName: "倒霉店长老周",
    role: "gm",
    jobTitle: "店长",
  },
  members: [
    {
      userId: "demo-gm",
      role: "gm",
      characterName: "倒霉店长老周",
      jobTitle: "店长",
      active: true,
      joinedAt: "2026-10-15T21:00:00.000Z",
    },
    {
      userId: "demo-chef",
      role: "player",
      characterName: "阿强",
      jobTitle: "厨师",
      active: true,
      joinedAt: "2026-10-15T21:07:00.000Z",
    },
    {
      userId: "demo-repair",
      role: "player",
      characterName: "小梅",
      jobTitle: "维修师",
      active: true,
      joinedAt: "2026-10-15T21:12:00.000Z",
    },
  ],
  resources: resourceGroups.flatMap((group, groupIndex) =>
    group.map((item) => ({
      ...item,
      group: groupIndex,
      status: "ok" as const,
    })),
  ),
  checklist: checklistLabels.map((label, index) => ({
    id: "check-" + (index + 1),
    label,
    completed: index < 4,
  })),
  quests: [
    {
      id: "task-front",
      title: "用桌椅加固前厅入口",
      body: "检查入口与窗户，使用家具建立不影响撤离路线的临时防线。",
      assigneeName: "阿强",
      due: "23:30",
      status: "pending_review",
      createdBy: "demo-gm",
    },
    {
      id: "task-power",
      title: "恢复应急电源",
      body: "检查电路、备用燃料和照明，记录最后一桶燃料的使用情况。",
      assigneeName: "小梅",
      due: "23:10",
      status: "in_progress",
      createdBy: "demo-gm",
    },
    {
      id: "task-stock",
      title: "盘点仓库可替代物资",
      body: "标签用途仅供参考；列出工具、清洁用品与可用于防御的物品。",
      assigneeName: "待认领",
      due: "23:20",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-radio",
      title: "监听并核实公司广播",
      body: "记录来源明确的指示；相互矛盾时结合现场情况判断。",
      assigneeName: "待认领",
      due: "23:40",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-customer",
      title: "识别异常顾客",
      body: "明显非人类特征者不得办理会员注册，优先保障现场人员安全。",
      assigneeName: "倒霉店长老周",
      due: "持续",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-burger",
      title: "制作员工芝士汉堡",
      body: "为疲惫同事补充食物。公司不承诺心理疗效，但汉堡通常很好吃。",
      assigneeName: "阿强",
      due: "22:40",
      status: "completed",
      createdBy: "demo-gm",
    },
  ],
  notes: [
    {
      id: "note-report",
      title: "工作报告 · 22:30",
      body: "应急电源已恢复。后门附近仍有异常声响。最后一桶备用燃料已使用。汉堡很好吃。",
      color: "yellow",
      x: 1132,
      y: 620,
      rotation: -2.2,
      createdAt: "今日",
      authorId: "demo-gm",
    },
  ],
};

export function cloneDefaultBoard(): CampaignBoard {
  return structuredClone(defaultBoard);
}
