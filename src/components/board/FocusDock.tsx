import {
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  PackageOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { CampaignSectionKey } from "../../features/campaign/domain/types";
import type { FocusZone } from "../../hooks/useBoardViewport";

const items: Array<{
  id: FocusZone;
  section?: CampaignSectionKey;
  label: string;
  title: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "公告板全览", title: "全览", icon: LayoutDashboard },
  {
    id: "inventory",
    section: "inventory",
    label: "物资清单",
    title: "物资",
    icon: PackageOpen,
  },
  {
    id: "tasks",
    section: "tasks",
    label: "工作指示",
    title: "指示",
    icon: ClipboardList,
  },
  {
    id: "shifts",
    section: "shifts",
    label: "队员排班",
    title: "排班",
    icon: Users,
  },
  {
    id: "safety",
    section: "safety",
    label: "防御检查",
    title: "防御",
    icon: ShieldCheck,
  },
  {
    id: "notes",
    section: "activity",
    label: "工作记录",
    title: "记录",
    icon: MessageSquare,
  },
];

interface FocusDockProps {
  active: FocusZone;
  onChange: (zone: FocusZone) => void;
  hiddenSections: CampaignSectionKey[];
}

export function FocusDock({
  active,
  onChange,
  hiddenSections,
}: FocusDockProps) {
  const visibleItems = items.filter(
    (item) => !item.section || !hiddenSections.includes(item.section),
  );
  const activeIndex = Math.max(
    0,
    visibleItems.findIndex((item) => item.id === active),
  );
  const style = {
    "--focus-index": activeIndex,
    "--focus-count": visibleItems.length,
    "--focus-width": `calc(${100 / visibleItems.length}% - ${10 / visibleItems.length}px)`,
  } as CSSProperties;
  return (
    <nav className="focus-dock" aria-label="公告板区域" style={style}>
      <span className="focus-dock-indicator" aria-hidden="true" />
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={active === item.id ? "is-active" : ""}
            type="button"
            key={item.id}
            aria-label={item.label}
            aria-current={active === item.id ? "location" : undefined}
            title={item.title}
            onClick={() => onChange(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{item.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
