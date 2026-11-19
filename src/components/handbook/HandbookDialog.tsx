import {
  BookOpen,
  ChefHat,
  ClipboardCheck,
  Clock,
  Dices,
  LayoutGrid,
  Radio,
  ShieldAlert,
  Store,
  Waypoints,
} from "lucide-react";
import { useState } from "react";
import { PaperDialog } from "../composer/PaperDialog";

interface HandbookDialogProps {
  open: boolean;
  defaultCrisisDiner?: boolean;
  onClose: () => void;
}

const veilBoardRules = [
  {
    icon: LayoutGrid,
    number: "01",
    accent: "#0071e3",
    title: "原子化板块与自由编排",
    body: "成员名册、事件钟、工作记录及所有展示板块均由 12 类原子积木拼装，按住标题栏可拖拽排布、拖拽右下角缩放，点编辑图标统一调整积木与着色器。",
  },
  {
    icon: ClipboardCheck,
    number: "02",
    accent: "#34c759",
    title: "直接操作与协同流转",
    body: "物资增减、委托认领、检查勾选与分段状态均可直接在公告板上点击操作，并实时同步给房间内的全部成员。",
  },
  {
    icon: Waypoints,
    number: "03",
    accent: "#ff9500",
    title: "便签、着色器与红绳连线",
    body: "点击任意便签即可在统一编辑页中修改羊皮纸/全息投影/烧焦 Shader、RGB 颜色、图钉色与旋转角度；点击顶部图钉拉出红绳梳理关系网。",
  },
  {
    icon: Clock,
    number: "04",
    accent: "#ff3b30",
    title: "战役时钟与事件钟",
    body: "右上角记录战役历法与计时器；事件钟积木追踪调查进展与倒计时后果，满格时高亮提醒全桌。",
  },
  {
    icon: Dices,
    number: "05",
    accent: "#af52de",
    title: "3D 骰盘与全员检定",
    body: "投掷前可切换公开、我和 GM、暗骰或私骰权限；支持多选拖掷与公式检定。",
  },
];

const crisisDinerRules = [
  {
    icon: Store,
    number: "1.1",
    accent: "#ff9500",
    title: "保持岗位意识",
    body: "厨师、维修师、服务员、店长和顾客，都应根据能力维持餐厅运营。",
  },
  {
    icon: ShieldAlert,
    number: "1.2",
    accent: "#ff3b30",
    title: "请勿擅自离岗",
    body: "如管理层全部失联，请继续履行岗位职责，直至收到进一步通知。",
  },
  {
    icon: ChefHat,
    number: "3.0",
    accent: "#34c759",
    title: "汉堡与员工士气",
    body: "没有明确工作、感到焦虑或完成任务后，均可考虑制作一个汉堡。",
  },
  {
    icon: Radio,
    number: "6.0",
    accent: "#0071e3",
    title: "确认指示来源",
    body: "通信冲突时先核实来源；现场与指示明显矛盾时，记录并自行判断。",
  },
  {
    icon: ClipboardCheck,
    number: "7.0",
    accent: "#af52de",
    title: "留下工作记录",
    body: "记录行动、成果、问题、物资消耗，以及值得向其他员工通报的信息。",
  },
];

/**
 * Apple HIG 桌面协作速查手册（统一接入 PaperDialog 毛玻璃弹窗体系）。
 */
export function HandbookDialog({
  open,
  defaultCrisisDiner = false,
  onClose,
}: HandbookDialogProps) {
  const [tab, setTab] = useState<"veil" | "crisis_diner">(
    defaultCrisisDiner ? "crisis_diner" : "veil",
  );
  if (!open) return null;
  const rules = tab === "crisis_diner" ? crisisDinerRules : veilBoardRules;

  return (
    <PaperDialog
      title={tab === "crisis_diner" ? "危机营业速查附册" : "帷幕桌面协作速查"}
      className="hig-handbook-sheet hig-inspector-sheet"
      onClose={onClose}
    >
      <div
        className="hig-inspector-segmented"
        role="tablist"
        aria-label="手册章节"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "veil"}
          className={tab === "veil" ? "is-active" : ""}
          onClick={() => setTab("veil")}
        >
          桌面协作速查
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "crisis_diner"}
          className={tab === "crisis_diner" ? "is-active" : ""}
          onClick={() => setTab("crisis_diner")}
        >
          主题附册：危机营业
        </button>
      </div>

      <div className="hig-callout-banner">
        <BookOpen aria-hidden="true" />
        <p>
          {tab === "crisis_diner"
            ? "优秀员工不会因为困难放弃工作；卓越员工甚至不会因为世界末日放弃工作。"
            : "帷幕之后由主持人自由编排秩序，桌面之上由全队共同拼出真相与战果。"}
        </p>
      </div>

      <div className="hig-grouped-list hig-handbook-list">
        {rules.map((rule) => (
          <article key={rule.number} className="hig-handbook-row">
            <span
              className="hig-handbook-icon"
              style={{ background: rule.accent }}
              aria-hidden="true"
            >
              <rule.icon />
            </span>
            <div className="hig-handbook-copy">
              <div className="hig-handbook-row-head">
                <h3>{rule.title}</h3>
                <span className="hig-rule-badge">{rule.number}</span>
              </div>
              <p>{rule.body}</p>
            </div>
          </article>
        ))}
      </div>

      <footer className="hig-handbook-footnote">
        {tab === "crisis_diner" ? (
          <>
            <strong>公司不会要求员工为了完成一份汉堡订单而主动放弃生命。</strong>
            <span>当然，也请不要在订单即将完成时轻易放弃工作。</span>
          </>
        ) : (
          <>
            <strong>公告板适配任意跑团规则系统，具体检定与裁定以本场主持人为准。</strong>
            <span>点击顶栏右侧问号可随时搜索完整功能使用指南。</span>
          </>
        )}
      </footer>
    </PaperDialog>
  );
}
