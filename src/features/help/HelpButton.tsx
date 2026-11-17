import { CircleHelp } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const HelpDialog = lazy(() => import("./HelpDialog").then(module => ({ default: module.HelpDialog })));

export function HelpButton({ label = "帮助", iconOnly = false, onOpen, className = "" }: {
  label?: string;
  iconOnly?: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button className={`help-entry ${className}`.trim()} type="button"
      aria-label={iconOnly ? "搜索帮助与使用指南" : label} title={label}
      aria-haspopup="dialog" onClick={() => { onOpen?.(); setOpen(true); }}>
      <CircleHelp aria-hidden="true" />{!iconOnly && <span>{label}</span>}
    </button>
    {open && <Suspense fallback={<div className="toast is-visible" role="status">正在打开使用指南…</div>}>
      <HelpDialog onClose={() => setOpen(false)} />
    </Suspense>}
  </>;
}
