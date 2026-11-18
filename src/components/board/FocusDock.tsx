import {
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  PackageOpen,
  PanelTop,
  ShieldCheck,
  Users,
  Clock,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { CampaignSectionKey } from "../../features/campaign/domain/types";
import type { FocusZone } from "../../hooks/useBoardViewport";
import type { EventClock } from "../../features/campaign/domain/eventClock";

const baseItems: Array<{
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
    label: "任务委托",
    title: "任务",
    icon: ClipboardList,
  },
  {
    id: "shifts",
    section: "shifts",
    label: "成员名册",
    title: "成员",
    icon: Users,
  },
  {
    id: "safety",
    section: "safety",
    label: "检查清单",
    title: "检查",
    icon: ShieldCheck,
  },
  {
    id: "notes",
    section: "activity",
    label: "行动记录",
    title: "记录",
    icon: MessageSquare,
  },
];

interface FocusDockProps {
  active: FocusZone;
  onChange: (zone: FocusZone) => void;
  hiddenSections: CampaignSectionKey[];
  eventClocks?: EventClock[];
  sectionTitles?: Partial<Record<CampaignSectionKey, string>>;
  hasCustomPanels?: boolean;
}

export function FocusDock({
  active,
  onChange,
  hiddenSections,
  eventClocks = [],
  sectionTitles,
  hasCustomPanels = false,
}: FocusDockProps) {
  const allItems = hasCustomPanels
    ? [
        ...baseItems,
        {
          id: "panels" as const,
          label: "自由展板",
          title: "展板",
          icon: PanelTop,
        },
      ]
    : baseItems;
  const visibleItems = allItems.filter(
    (item) => !item.section || !hiddenSections.includes(item.section),
  );
  const focusedClock = eventClocks.find((clock) => `event:${clock.id}` === active) ?? eventClocks[0];
  if (!hiddenSections.includes("index") && focusedClock) {
    const shiftsIdx = visibleItems.findIndex((item) => item.id === "shifts");
    const insertAt = shiftsIdx >= 0 ? shiftsIdx + 1 : visibleItems.length;
    visibleItems.splice(insertAt, 0, {
      id: `event:${focusedClock.id}`, section: "index", label: "事件钟", title: "事件", icon: Clock,
    });
  }
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
      {active.startsWith("event:") && eventClocks.length > 1 && <select className="focus-clock-picker"
        aria-label="聚焦事件钟" value={focusedClock?.id}
        onChange={(event) => onChange(`event:${event.target.value}`)}>
        {eventClocks.map((clock) => <option key={clock.id} value={clock.id}>{clock.name}</option>)}
      </select>}
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const customName = item.section
          ? sectionTitles?.[item.section]?.trim()
          : undefined;
        const displayTitle = customName
          ? customName.slice(0, 4)
          : item.title;
        return (
          <button
            className={active === item.id ? "is-active" : ""}
            type="button"
            key={item.id}
            aria-label={item.label}
            aria-current={active === item.id ? "location" : undefined}
            title={customName || item.title}
            onClick={() => onChange(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{displayTitle}</span>
          </button>
        );
      })}
    </nav>
  );
}
