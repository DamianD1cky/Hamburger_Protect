export type ArchiveCategory = "clue" | "evidence" | "character" | "news";
export type ArchiveVisibility = "public" | "gm_only";

export interface ArchiveEntry {
  id: string;
  category: ArchiveCategory;
  title: string;
  subtitle: string;
  dateLabel: string;
  summary: string;
  body: string;
  tags: string[];
  imageUrl?: string | null;
  fontSize: number;
  visibility: ArchiveVisibility;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ARCHIVE_ENTRY_LIMIT = 60;

export const ARCHIVE_CATEGORY_META: Record<
  ArchiveCategory,
  {
    label: string;
    shortLabel: string;
    subtitlePlaceholder: string;
    stamp: string;
    accent: string;
  }
> = {
  clue: {
    label: "线索档案",
    shortLabel: "线索",
    subtitlePlaceholder: "发现地点 / 调查员笔录编号",
    stamp: "CLUE · 线索",
    accent: "#d97706",
  },
  evidence: {
    label: "物证档案",
    shortLabel: "档案",
    subtitlePlaceholder: "证物编号 / 检验状态（如：已封存）",
    stamp: "EXHIBIT · 物证",
    accent: "#b91c1c",
  },
  character: {
    label: "人物档案",
    shortLabel: "人物",
    subtitlePlaceholder: "身份 / 职业 / 阵营归属",
    stamp: "DOSSIER · 人物",
    accent: "#1d4ed8",
  },
  news: {
    label: "报纸新闻",
    shortLabel: "新闻",
    subtitlePlaceholder: "报刊名称 / 版面（如：灰雾港晚报 · 头版）",
    stamp: "PRESS · 剪报",
    accent: "#475569",
  },
};

export const ARCHIVE_FIELD_LABELS: Record<ArchiveCategory, { title: string; subtitle: string; body: string }> = {
  clue: { title: "线索标题", subtitle: "发现地点 / 笔录编号", body: "调查笔录" },
  evidence: { title: "档案名称", subtitle: "证物编号 / 状态", body: "检验与调查记录" },
  character: { title: "姓名", subtitle: "职业 / 身份", body: "详细信息" },
  news: { title: "新闻标题", subtitle: "报刊 / 版面", body: "新闻正文" },
};

const VALID_CATEGORIES = new Set<ArchiveCategory>([
  "clue",
  "evidence",
  "character",
  "news",
]);

export function clampArchiveFontSize(value: unknown, fallback = 15): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(12, Math.min(26, Math.round(num)));
}

export function normalizeArchiveEntry(
  raw: Partial<ArchiveEntry> | null | undefined,
  index = 0,
): ArchiveEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const now = new Date().toISOString();
  const category = VALID_CATEGORIES.has(raw.category as ArchiveCategory)
    ? (raw.category as ArchiveCategory)
    : "clue";
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((t) => (typeof t === "string" ? t.trim().slice(0, 20) : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const imageUrl =
    typeof raw.imageUrl === "string" &&
    raw.imageUrl.trim() &&
    /^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,|\/(?!\/)|[0-9a-f-]{36}\/note-)/i.test(raw.imageUrl.trim())
      ? raw.imageUrl.trim().slice(0, raw.imageUrl.startsWith("data:") ? 7_000_000 : 2000)
      : null;

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 64)
        : `archive-${Date.now()}-${index}`,
    category,
    title,
    subtitle:
      typeof raw.subtitle === "string" ? raw.subtitle.trim().slice(0, 80) : "",
    dateLabel:
      typeof raw.dateLabel === "string" ? raw.dateLabel.trim().slice(0, 40) : "",
    summary:
      typeof raw.summary === "string" ? raw.summary.trim().slice(0, 200) : "",
    body: typeof raw.body === "string" ? raw.body.trim().slice(0, 6000) : "",
    tags,
    imageUrl,
    fontSize: clampArchiveFontSize(raw.fontSize, 15),
    visibility: raw.visibility === "gm_only" ? "gm_only" : "public",
    pinned: Boolean(raw.pinned),
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : now,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : now,
  };
}

export function normalizeArchiveEntries(raw: unknown): ArchiveEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: ArchiveEntry[] = [];
  for (let i = 0; i < raw.length && result.length < ARCHIVE_ENTRY_LIMIT; i += 1) {
    const normalized = normalizeArchiveEntry(raw[i] as Partial<ArchiveEntry>, i);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push(normalized);
  }
  return result;
}

export function visibleArchiveEntriesForRole(
  entries: readonly ArchiveEntry[],
  isGm: boolean,
): ArchiveEntry[] {
  const list = isGm
    ? [...entries]
    : entries.filter((item) => item.visibility === "public");
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function createStarterArchiveEntries(): ArchiveEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: "starter-clue-1",
      category: "clue",
      title: "北栈桥地下暗门灼痕笔录",
      subtitle: "线索编号 #C-04 · 灰雾港北栈桥",
      dateLabel: "1926年11月14日",
      summary: "铁门内侧留有高频高温熔蚀痕迹，封蜡纹章与旧灯塔档案一致。",
      body: "凌晨 02:15 于北栈桥三号仓地下室发现隐藏铜门。\n\n门锁周边并非普通撬痕，而是呈现出约 4 厘米宽的焦黑灼烧环。守夜人声称当晚听到类似低压变压器嗡鸣的持续震动，持续约七分钟后骤然停止。\n\n建议比对旧灯塔值班名册中「1919 年冬季停机检修」一栏的签名笔迹。",
      tags: ["北栈桥", "灼痕", "旧灯塔"],
      imageUrl: null,
      fontSize: 15,
      visibility: "public",
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "starter-evidence-1",
      category: "evidence",
      title: "残缺铜制怀表与焦边清单",
      subtitle: "证物编号 #E-12 · 化验室已封存",
      dateLabel: "1926年11月15日",
      summary: "表针永远停在 03:40，表盖内刻有「V.H.」缩写，纸页残留硫磺粉。",
      body: "【物证清单】\n1. 黄铜怀表一只：玻璃表镜碎裂，机芯在强磁场影响下完全磁化，指针定格于 03:40。\n2. 残缺货运单半页：右下角已被明火焚毁，仅存「……十二箱秘银线圈，收货人：港口冷库 4 号……」字样。\n\n【初步检验】\n焦灰中检出微量硫磺与海水盐霜，说明焚毁地点距离海面极近。",
      tags: ["物证", "怀表", "03:40"],
      imageUrl: null,
      fontSize: 15,
      visibility: "public",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "starter-character-1",
      category: "character",
      title: "维克多·哈洛（Victor Harlow）",
      subtitle: "前港务局首席钟表师 · 失踪人士",
      dateLabel: "最后目击：11月10日",
      summary: "精通天文历法与精密机械，曾负责维护灰雾港总钟楼与旧灯塔。",
      body: "【基本资料】\n年龄：54 岁\n特征：左手无名指戴一枚暗银六角戒，随身携带牛皮工具卷。\n\n【已知关系】\n- 与港务档案管理员关系密切，失踪前曾连续三晚借阅 1898 年潮汐水文图。\n- 邻居反映其书房在失踪前一周彻夜亮着蓝绿色冷光。\n\n【调查提示】\n若在酒馆或码头询问「老哈洛」，老水手通常知道他常去的旧钟表铺。",
      tags: ["NPC", "钟表师", "关键人物"],
      imageUrl: `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${encodeURIComponent("Authentic 1920s black and white studio portrait photograph of a 54 year old European clockmaker, salt and pepper hair, round wire rim spectacles, serious thoughtful expression, worn wool waistcoat, plain dark studio backdrop, silver gelatin photograph, subtle film grain, realistic historical photography, no text, no border")}&image_size=portrait_4_3`,
      fontSize: 15,
      visibility: "public",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "starter-news-1",
      category: "news",
      title: "灰雾港钟楼午夜异响，港务局称系例行齿轮检修",
      subtitle: "《灰雾港晨报》 · 第 4 版社会简讯",
      dateLabel: "1926年11月12日",
      summary: "多名码头居民目击钟楼顶层闪现异常青光，官方迅速封锁塔楼楼梯。",
      body: "本报讯——昨日午夜时分，居住在老码头区的十余位市民向警署反映，灰雾港百年钟楼在未到整点之际连续鸣响七声，随后顶层百叶窗透出刺眼青色弧光。\n\n港务局发言人今日上午回应称，该现象系「新型高压照明线路调试所致」，并宣布钟楼即日起封闭维护两周。然而本报记者注意到，参与封锁的人员并非港务局常驻技工，而是佩戴无编号黑徽的陌生护卫。",
      tags: ["报纸剪报", "钟楼", "青光"],
      imageUrl: null,
      fontSize: 15,
      visibility: "public",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
