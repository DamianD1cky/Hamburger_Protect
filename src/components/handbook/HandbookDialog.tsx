import {
  BookOpen,
  ChefHat,
  ClipboardCheck,
  Radio,
  ShieldAlert,
  Store,
  X,
} from "lucide-react";

interface HandbookDialogProps {
  open: boolean;
  onClose: () => void;
}

const handbookRules = [
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

export function HandbookDialog({ open, onClose }: HandbookDialogProps) {
  if (!open) return null;
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
            <h2 id="handbook-title">危机营业速查手册</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭员工手册" title="关闭">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="handbook-motto">
          <BookOpen aria-hidden="true" />
          <p>优秀员工不会因为困难放弃工作；卓越员工甚至不会因为世界末日放弃工作。</p>
        </div>
        <div className="handbook-rules">
          {handbookRules.map((rule) => (
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
          <strong>公司不会要求员工为了完成一份汉堡订单而主动放弃生命。</strong>
          <span>当然，也请不要在订单即将完成时轻易放弃工作。</span>
        </footer>
      </section>
    </div>
  );
}
