export function formatNoteTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value || "时间未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
