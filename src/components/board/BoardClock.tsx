import { useEffect, useState } from "react";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const zoneFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZoneName: "short",
});

function zoneName(date: Date) {
  return (
    zoneFormatter
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "本地时间"
  );
}

export function BoardClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout = 0;
    const tick = () => {
      const next = new Date();
      setNow(next);
      timeout = window.setTimeout(tick, 1000 - (next.getTime() % 1000));
    };
    timeout = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section
      className="board-clock"
      aria-label={`当地时间 ${now.toLocaleString()}`}
    >
      <span className="clock-status" aria-hidden="true" />
      <time className="clock-time" dateTime={now.toISOString()}>
        {timeFormatter.format(now)}
      </time>
      <span className="clock-divider" aria-hidden="true" />
      <span className="clock-calendar">{dateFormatter.format(now)}</span>
      <span className="clock-zone">{zoneName(now)}</span>
    </section>
  );
}
