/**
 * Formats a Date or timestamp string into Indian Standard Time (IST, Asia/Kolkata).
 * Ensures consistency across server-side rendering (UTC environments) and client.
 */
export function formatLeadDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const dateStr = d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timeStr = d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr} • ${timeStr.toLowerCase()}`;
}

export function formatLeadDateParts(date: Date | string | number | null | undefined): { dateStr: string; timeStr: string } {
  if (!date) return { dateStr: "", timeStr: "" };
  const d = new Date(date);
  if (isNaN(d.getTime())) return { dateStr: "", timeStr: "" };

  const dateStr = d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timeStr = d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();

  return { dateStr, timeStr };
}
