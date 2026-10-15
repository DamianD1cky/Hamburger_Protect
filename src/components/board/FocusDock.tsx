import {
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  PackageOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { FocusZone } from "../../hooks/useBoardViewport";

const items = [
  { id: "overview", label: "公告板全览", title: "全览", icon: LayoutDashboard },
  { id: "inventory", label: "物资清单", title: "物资", icon: PackageOpen },
  { id: "tasks", label: "战役任务", title: "任务", icon: ClipboardList },
  { id: "shifts", label: "队员排班", title: "排班", icon: Users },
  { id: "safety", label: "防御检查", title: "防御", icon: ShieldCheck },
  { id: "notes", label: "留言区", title: "留言", icon: MessageSquare },
] as const;

interface FocusDockProps {
  active: FocusZone;
  onChange: (zone: FocusZone) => void;
}

export function FocusDock({ active, onChange }: FocusDockProps) {
  return (
    <nav className="focus-dock" aria-label="公告板区域">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={active === item.id ? "is-active" : ""}
            type="button"
            key={item.id}
            aria-label={item.label}
            title={item.title}
            onClick={() => onChange(item.id)}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
