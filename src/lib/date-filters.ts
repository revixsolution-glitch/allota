export type DashboardDatePreset =
  | "all_time"
  | "today"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "this_month"
  | "custom";

export interface DateRangeResult {
  preset: DashboardDatePreset;
  start: Date | null;
  end: Date | null;
  label: string;
  customFrom?: string;
  customTo?: string;
}

/**
 * Calculates start and end Date objects for a given dashboard preset.
 * Works seamlessly across UTC/IST boundaries.
 */
export function parseDashboardDateFilter(
  rangeParam?: string,
  fromParam?: string,
  toParam?: string
): DateRangeResult {
  const now = new Date();
  const rawPreset = (rangeParam || "all_time").toLowerCase();

  if (rawPreset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "today", start, end, label: "Today" };
  }

  if (rawPreset === "yesterday") {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { preset: "yesterday", start, end, label: "Yesterday" };
  }

  if (rawPreset === "last_week" || rawPreset === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "last_week", start, end, label: "Last Week" };
  }

  if (rawPreset === "last_month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "last_month", start, end, label: "Last Month" };
  }

  if (rawPreset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "this_month", start, end, label: "This Month" };
  }

  if (rawPreset === "custom") {
    const start = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(0);
    const end = toParam ? new Date(`${toParam}T23:59:59.999`) : new Date();
    const formattedFrom = fromParam || "Start";
    const formattedTo = toParam || "Today";
    return {
      preset: "custom",
      start,
      end,
      label: `Custom (${formattedFrom} to ${formattedTo})`,
      customFrom: fromParam,
      customTo: toParam,
    };
  }

  return {
    preset: "all_time",
    start: null,
    end: null,
    label: "All Time",
  };
}
