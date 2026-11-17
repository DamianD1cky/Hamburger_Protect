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
  X,
} from "lucide-react";
import { useState } from "react";

interface HandbookDialogProps {
  open: boolean;
  defaultCrisisDiner?: boolean;
  onClose: () => void;
}

const veilBoardRules = [
  {
    icon: LayoutGrid,
    number: "01",
    title: "帷幕编排与区块分工",
    body: "GM 可按住任意模块标题栏自由拖放排版、修改标题与底色，或隐藏本团暂不需要的区块。",
  },
  {
    icon: ClipboardCheck,
    number: "02",
    title: "任务委托与审核流转",
    body: "公开张贴的任务由在场成员认领推进，行动完成后提交审核，由 GM 确认结案或退回补充。",
  },
  {
    icon: Waypoints,
    number: "03",
    title: "便签、照片与红绳连线",
    body: "关键线索、证物照片和行动经过可钉在板面任意位置；点击便签顶端图钉拉出红绳，梳理人物与事件关系。",
  },
  {
    icon: Clock,
    number: "04",
    title: "战役时钟与事态事件钟",
    body: "右上角记录战役历法或倒计时；事件钟追踪调查进展、警戒、追捕等累积后果，填满时高亮提醒全桌。",
  },
  {
    icon: Dices,
    number: "05",
    title: "骰盘可见性与全员检定",
    body: "投掷前先确认可见范围（公开、我和 GM、暗骰或仅自己）；需要集体响应时由 GM 发起全员检定。",
  },
];

const crisisDinerRules = [
  {
    icon: Store,
    number: "1.1",
    title: "保持岗位意识",
    body: "厨师、维修师、服务员、店长和顾客，都应根据能力维持餐厅运营。",
  },
  {
    icon: ShieldAlert,
    number: "1.2",
    title: "请勿擅自离岗",
    body: "如管理层全部失联，请继续履行岗位职责，直至收到进一步通知。",
  },
  {
    icon: ChefHat,
    number: "3.0",
    title: "汉堡与员工士气",
    body: "没有明确工作、感到焦虑或完成任务后，均可考虑制作一个汉堡。",
  },
  {
    icon: Radio,
    number: "6.0",
    title: "确认指示来源",
    body: "通信冲突时先核实来源；现场与指示明显矛盾时，记录并自行判断。",
  },
  {
    icon: ClipboardCheck,
    number: "7.0",
    title: "留下工作记录",
    body: "记录行动、成果、问题、物资消耗，以及值得向其他员工通报的信息。",
  },
];

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
    <div className="handbook-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="handbook-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="handbook-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="handbook-title">
              {tab === "crisis_diner" ? "危机营业速查附册" : "帷幕桌面协作速查"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭桌面手册" title="关闭">
            <X aria-hidden="true" />
          </button>
        </header>
        <div
          className="access-tabs"
          role="tablist"
          aria-label="手册章节"
          style={{ margin: "16px 26px 0" }}
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
        <div className="handbook-motto">
          <BookOpen aria-hidden="true" />
          <p>
            {tab === "crisis_diner"
              ? "优秀员工不会因为困难放弃工作；卓越员工甚至不会因为世界末日放弃工作。"
              : "帷幕之后由 GM 自由编排秩序，桌面之上由全队共同拼出真相与战果。"}
          </p>
        </div>
        <div className="handbook-rules">
          {rules.map((rule) => (
            <article key={rule.number}>
              <span className="rule-number">{rule.number}</span>
              <rule.icon aria-hidden="true" />
              <div>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </div>
            </article>
          ))}
        </div>
        <footer>
          {tab === "crisis_diner" ? (
            <>
              <strong>公司不会要求员工为了完成一份汉堡订单而主动放弃生命。</strong>
              <span>当然，也请不要在订单即将完成时轻易放弃工作。</span>
            </>
          ) : (
            <>
              <strong>公告板适配任意跑团规则系统，具体检定与裁定以本场 GM 为准。</strong>
              <span>点击顶栏问号可随时查阅完整功能说明与搜索操作步骤。</span>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
