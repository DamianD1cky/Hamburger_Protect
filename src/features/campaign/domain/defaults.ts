import type { CampaignBoard, ResourceItem } from "./types";

const resourceGroups: Array<Array<Omit<ResourceItem, "group" | "status">>> = [
  [
    { id: "buns", name: "面包胚", quantity: "300 个" },
    { id: "beef", name: "牛肉饼", quantity: "200 片" },
    { id: "cheese", name: "芝士片", quantity: "150 片" },
    { id: "lettuce", name: "生菜", quantity: "20 斤" },
    { id: "other-a", name: "其他", quantity: "待填写" },
  ],
  [
    { id: "fries", name: "薯条", quantity: "20 斤" },
    { id: "chicken", name: "炸鸡排", quantity: "80 片" },
    { id: "wings", name: "鸡翅", quantity: "50 对" },
    { id: "onion", name: "洋葱", quantity: "10 斤" },
    { id: "pickles", name: "酸黄瓜", quantity: "5 斤" },
  ],
  [
    { id: "tomato-sauce", name: "番茄酱", quantity: "10 瓶" },
    { id: "salad-sauce", name: "沙拉酱", quantity: "8 瓶" },
    { id: "mustard", name: "黄芥末", quantity: "5 瓶" },
    { id: "pepper", name: "辣椒", quantity: "2 斤" },
    { id: "other-b", name: "其他", quantity: "待填写" },
  ],
];

const checklistLabels = [
  "穿戴整洁，工服干净",
  "头发整洁，戴帽/发网",
  "指甲干净，不戴首饰",
  "班前检查，设备卫生",
  "生熟分开，避免交叉",
  "变质食材，及时处理",
  "关闭火源，下班考核",
  "食材温度，符合标准",
  "酱料密封，存放合规",
  "生菜保鲜，今日更换",
  "餐具消毒，今日完成",
];

export const defaultBoard: CampaignBoard = {
  campaign: {
    id: "demo-campaign",
    name: "保卫老杰汉堡店",
    joinCode: "BURGER",
    status: "active",
  },
  viewer: {
    id: "demo-gm",
    displayName: "店长",
    role: "gm",
  },
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
    completed: true,
  })),
  quests: [
    {
      id: "task-backdoor",
      title: "加固后门",
      body: "用货架和木板封住员工通道",
      assigneeName: "张三",
      due: "23:30",
      status: "pending_review",
      createdBy: "demo-gm",
    },
    {
      id: "task-freezer",
      title: "转移冷库物资",
      body: "把关键食材转移到地下储藏间",
      assigneeName: "李四",
      due: "23:10",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-alarm",
      title: "布置警报线",
      body: "在西侧卷帘门设置罐头警报",
      assigneeName: "待认领",
      due: "23:20",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-generator",
      title: "检查发电机",
      body: "确认燃料和备用线路可用",
      assigneeName: "赵六",
      due: "22:50",
      status: "in_progress",
      createdBy: "demo-gm",
    },
    {
      id: "task-first-aid",
      title: "清点急救包",
      body: "补齐绷带、消毒液和止痛药",
      assigneeName: "周八",
      due: "23:00",
      status: "open",
      createdBy: "demo-gm",
    },
    {
      id: "task-vent",
      title: "封住通风口",
      body: "厨房北侧通风口已固定",
      assigneeName: "孙七",
      due: "22:20",
      status: "completed",
      createdBy: "demo-gm",
    },
    {
      id: "task-radio",
      title: "调试对讲机",
      body: "六部设备均已配对",
      assigneeName: "李四",
      due: "22:30",
      status: "completed",
      createdBy: "demo-gm",
    },
    {
      id: "task-water",
      title: "储备饮用水",
      body: "后厨已封存八箱饮用水",
      assigneeName: "赵六",
      due: "22:35",
      status: "completed",
      createdBy: "demo-gm",
    },
    {
      id: "task-lights",
      title: "遮蔽店外灯牌",
      body: "夜间不再暴露店铺位置",
      assigneeName: "周八",
      due: "22:40",
      status: "completed",
      createdBy: "demo-gm",
    },
  ],
  notes: [
    {
      id: "note-meal",
      title: "15:30 员工餐",
      body: "值班同事先吃，晚班留两份。",
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
