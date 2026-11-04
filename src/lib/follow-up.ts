/**
 * Single definition of follow-up timing, used by the notification API, the
 * employee leads page and the follow-up picker so "overdue" / "due today"
 * mean the same thing everywhere.
 *
 *  - overdue : scheduled for an earlier calendar day
 *  - today   : scheduled for today (it is "due now" once its time has passed)
 *  - upcoming: any later day
 * Leads that are dead or converted never generate reminders.
 */
export type FollowUpState = "overdue" | "today" | "upcoming";

export const CLOSED_LEAD_STATUSES = ["NOT_INTERESTED", "CONVERTED"] as const;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(startOfDay(d).getTime() + 86400000);
}

export function getFollowUpState(followUpAt: Date, now = new Date()): FollowUpState {
  if (followUpAt < startOfDay(now)) return "overdue";
  if (followUpAt < endOfDay(now)) return "today";
  return "upcoming";
}

/**
 * Global default follow-up: 2 upcoming days ahead at 10:00 AM IST.
 * Ensures leads never remain unset/lost if an employee doesn't explicitly schedule one.
 */
export function getDefaultFollowUpDate(fromDate = new Date()): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 2);
  d.setHours(10, 0, 0, 0);
  return d;
}
