import { Settings } from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import {
  campaignClockValue,
  formatClockDuration,
  type CampaignClockConfig,
} from "../../features/campaign/domain/campaignClock";
import { NixieDisplay } from "./NixieDisplay";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function clockDisplay(config: CampaignClockConfig, now: number) {
  const value = campaignClockValue(config, now);
  if (config.mode !== "clock") {
    return {
      value,
      text: formatClockDuration(value),
      calendar:
        config.mode === "countdown" ? "任务倒计时" : "任务正计时",
      dateTime: undefined,
    };
  }
  const date = new Date(value);
  return {
    value,
    text: timeFormatter.format(date),
    calendar: dateFormatter.format(date),
    dateTime: date.toISOString(),
  };
}

function QuartzDial({
  value,
  mode,
}: {
  value: number;
  mode: CampaignClockConfig["mode"];
}) {
  const date = new Date(value);
  const seconds =
    mode === "clock" ? date.getSeconds() : date.getUTCSeconds();
  const minutes =
    (mode === "clock" ? date.getMinutes() : date.getUTCMinutes()) +
    seconds / 60;
  const hours =
    ((mode === "clock" ? date.getHours() : date.getUTCHours()) % 12) +
    minutes / 60;
  const style = {
    "--clock-hour": `${hours * 30}deg`,
    "--clock-minute": `${minutes * 6}deg`,
    "--clock-second": `${seconds * 6}deg`,
  } as CSSProperties;
  return (
    <span className="quartz-dial" style={style} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <i
          key={index}
          style={{ transform: `rotate(${index * 30}deg)` }}
        />
      ))}
      <b className="quartz-hand is-hour" />
      <b className="quartz-hand is-minute" />
      <b className="quartz-hand is-second" />
      <em />
    </span>
  );
}

export function BoardClock({
  config,
  canManage = false,
  onOpenSettings,
}: {
  config: CampaignClockConfig;
  canManage?: boolean;
  onOpenSettings?: () => void;
}) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timeout = 0;
    const tick = () => {
      const next = Date.now();
      setNow(next);
      timeout = window.setTimeout(tick, 1000 - (next % 1000));
    };
    timeout = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timeout);
  }, []);

  const display = clockDisplay(config, now);
  const ended =
    config.mode === "countdown" &&
    display.value === 0;
  const running = config.running && !ended;
  const era = `${config.era}.${String(config.eraYear).padStart(4, "0")}`;
  const ariaLabel = [
    era,
    config.mode === "clock"
      ? `时间 ${display.text}`
      : `${display.calendar} ${display.text}`,
    running ? "运行中" : ended ? "已结束" : "已暂停",
  ].join("，");

  return (
    <section
      className="board-clock"
      data-clock-style={config.style}
      data-clock-mode={config.mode}
      data-clock-running={running ? "true" : "false"}
      aria-label={ariaLabel}
    >
      <span className="clock-status" aria-hidden="true" />
      {config.style === "quartz" && (
        <QuartzDial value={display.value} mode={config.mode} />
      )}
      <time
        className="clock-time"
        dateTime={display.dateTime}
        aria-label={display.text}
      >
        {config.style === "nixie" ? (
          <NixieDisplay text={display.text} />
        ) : (
          display.text
        )}
      </time>
      <span className="clock-divider" aria-hidden="true" />
      <span className="clock-calendar">{display.calendar}</span>
      <span className="clock-zone">{era}</span>
      {canManage && onOpenSettings && (
        <button
          type="button"
          className="clock-settings-button"
          onClick={onOpenSettings}
          aria-label="设置战役时钟"
          title="设置战役时钟"
        >
          <Settings aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
