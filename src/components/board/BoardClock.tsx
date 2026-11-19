import { Settings } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { BoardAppearance } from "../../features/campaign/domain/boardAppearance";
import type { BoardStyleTokens } from "../../features/campaign/domain/boardStyleTokens";
import {
  campaignClockValue,
  campaignClockYear,
  formatClockDuration,
  type CampaignClockConfig,
} from "../../features/campaign/domain/campaignClock";
import {
  clockVisualCssVars,
  resolveClockVisual,
  type BoardClockAppearance,
  type ClockThemeVisual,
} from "../../features/campaign/domain/clockAppearance";
import {
  blitPalaceQuartzToCanvas,
  subscribeCardShaderClock,
} from "../../features/shaders/cardShaderEngine";
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

/**
 * 古代宫廷鎏金珐琅石英表盘（WebGL2 Shader 实时渲染）：
 * 24 瓣巴洛克莲纹金框、36 颗珍珠镶边、景泰蓝十二芒星天文内芯、
 * 象牙玑镂太阳纹刻度环、红宝石四向时标、宝玑镂空金针与弧面表镜高光。
 */
function QuartzDial({
  value,
  mode,
  visual,
  running,
  preview,
}: {
  value: number;
  mode: CampaignClockConfig["mode"];
  visual: ClockThemeVisual;
  running: boolean;
  preview: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);
  const anglesRef = useRef({ hourRad: 0, minuteRad: 0, secondRad: 0 });

  const date = new Date(value);
  const seconds =
    mode === "clock" ? date.getSeconds() : date.getUTCSeconds();
  const minutes =
    (mode === "clock" ? date.getMinutes() : date.getUTCMinutes()) +
    seconds / 60;
  const hours =
    ((mode === "clock" ? date.getHours() : date.getUTCHours()) % 12) +
    minutes / 60;

  const degToRad = Math.PI / 180;
  anglesRef.current = {
    hourRad: hours * 30 * degToRad,
    minuteRad: minutes * 6 * degToRad,
    secondRad: seconds * 6 * degToRad,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = preview ? 160 : 144;
    const draw = (t: number) => {
      if (!canvasRef.current) return;
      blitPalaceQuartzToCanvas(
        canvasRef.current,
        {
          size,
          hourRad: anglesRef.current.hourRad,
          minuteRad: anglesRef.current.minuteRad,
          secondRad: anglesRef.current.secondRad,
          surfaceColorHex: visual.surfaceColor,
          borderColorHex: visual.borderColor,
          accentColorHex: visual.accentColor,
          running,
        },
        t,
      );
    };

    draw(performance.now() * 0.001);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          visibleRef.current = entries.some((entry) => entry.isIntersecting);
        },
        { threshold: 0.01 },
      );
      observer.observe(canvas);
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return () => observer?.disconnect();
    }

    const unsub = subscribeCardShaderClock((elapsed) => {
      if (visibleRef.current) draw(elapsed);
    });
    return () => {
      unsub();
      observer?.disconnect();
    };
  }, [
    preview,
    running,
    visual.surfaceColor,
    visual.borderColor,
    visual.accentColor,
  ]);

  // Also redraw immediately on each 1-second tick even when global shader mode is "eco"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    blitPalaceQuartzToCanvas(
      canvas,
      {
        size: preview ? 160 : 144,
        hourRad: anglesRef.current.hourRad,
        minuteRad: anglesRef.current.minuteRad,
        secondRad: anglesRef.current.secondRad,
        surfaceColorHex: visual.surfaceColor,
        borderColorHex: visual.borderColor,
        accentColorHex: visual.accentColor,
        running,
      },
      performance.now() * 0.001,
    );
  }, [
    value,
    mode,
    preview,
    running,
    visual.surfaceColor,
    visual.borderColor,
    visual.accentColor,
  ]);

  return (
    <span className="quartz-dial is-palace-shader" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="quartz-dial-canvas"
        width={preview ? 160 : 144}
        height={preview ? 160 : 144}
      />
    </span>
  );
}

export function BoardClock({
  config,
  clockAppearance,
  boardAppearance,
  styleTokens,
  canManage = false,
  preview = false,
  onOpenSettings,
}: {
  config: CampaignClockConfig;
  clockAppearance?: BoardClockAppearance | null;
  boardAppearance?: BoardAppearance | null;
  styleTokens?: BoardStyleTokens | null;
  canManage?: boolean;
  preview?: boolean;
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
  const ended = config.mode === "countdown" && display.value === 0;
  const running = config.running && !ended;
  const era = `${config.era}.${String(campaignClockYear(config, now)).padStart(4, "0")}`;
  const ariaLabel = [
    era,
    config.mode === "clock"
      ? `时间 ${display.text}`
      : `${display.calendar} ${display.text}`,
    running ? "运行中" : ended ? "已结束" : "已暂停",
  ].join("，");

  const visual = resolveClockVisual(
    clockAppearance ?? styleTokens?.clockAppearance,
    boardAppearance,
    {
      cardStyle: styleTokens?.cardStyle,
      surfaceShader: styleTokens?.surfaceShader?.shader,
    },
  );

  return (
    <section
      className={preview ? "board-clock is-preview" : "board-clock"}
      data-clock-style={config.style}
      data-clock-theme={visual.id}
      data-clock-frame={visual.frameStyle}
      data-clock-scanlines={visual.scanlines ? "true" : undefined}
      data-clock-mode={config.mode}
      data-clock-running={running ? "true" : "false"}
      style={clockVisualCssVars(visual)}
      aria-label={ariaLabel}
    >
      <div className="clock-primary">
        <span className="clock-status" aria-hidden="true" />
        {config.style === "quartz" && (
          <QuartzDial
            value={display.value}
            mode={config.mode}
            visual={visual}
            running={running}
            preview={preview}
          />
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
      </div>
      <span className="clock-divider" aria-hidden="true" />
      <div className="clock-meta">
        <span className="clock-zone">{era}</span>
        <span className="clock-calendar">{display.calendar}</span>
      </div>
      {!preview && canManage && onOpenSettings && (
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
