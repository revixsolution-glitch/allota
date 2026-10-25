import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany, scopeViaRelation } from "@/lib/auth";
import { CLOSED_LEAD_STATUSES, endOfDay, getFollowUpState } from "@/lib/follow-up";

export const dynamic = "force-dynamic";

export interface CrmNotification {
  id: string;
  type: "CALL" | "LEAD" | "REORDER" | "CREDIT" | "FOLLOWUP";
  title: string;
  description: string;
  timestamp: string;
  href: string;
  badge: string;
  isUnread: boolean;
  /** ISO time a follow-up reminder became due (drives the live pop-up). */
  dueAt?: string;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ notifications: [], unreadCount: 0, home: "/login" });
    }
    const isEmployee = session.role === "EMPLOYEE";
    const activeCompanyId = getActiveCompanyId(session);
    // A Super Admin who hasn't entered a company has no company's notifications to show.
    if (!isEmployee && !activeCompanyId) {
      return NextResponse.json({ notifications: [], unreadCount: 0, home: "/super-admin" });
    }
    const companyScope = scopeToCompany(activeCompanyId);

    const now = new Date();

    if (isEmployee) {
      return NextResponse.json(await buildEmployeeNotifications(session.employeeId, now));
    }

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [missedCalls, newLeads, overdueCredits] = await Promise.all([
      // 1. Unaddressed Missed Calls in last 7 days
      prisma.call.findMany({
        where: {
          missed: true,
          occurredAt: { gte: sevenDaysAgo },
          ...(activeCompanyId
            ? {
                OR: [
                  { employee: { companyId: activeCompanyId } },
                  { lead: { companyId: activeCompanyId } },
                  { client: { companyId: activeCompanyId } },
                ],
              }
            : {}),
        },
        take: 4,
        orderBy: { occurredAt: "desc" },
        include: {
          lead: true,
          client: true,
          employee: true,
        },
      }).catch(() => []),

      // 2. High-Intent / New Leads in last 7 days
      prisma.lead.findMany({
        where: {
          ...companyScope,
          createdAt: { gte: sevenDaysAgo },
          status: { in: ["INTERESTED", "NEW"] },
        },
        take: 4,
        orderBy: { createdAt: "desc" },
      }).catch(() => []),

      // 3. Overdue Credits needing recovery
      prisma.creditRecord.findMany({
        where: {
          ...scopeViaRelation(activeCompanyId, "client"),
          status: "OVERDUE",
        },
        take: 3,
        orderBy: { dueDate: "asc" },
        include: { client: true },
      }).catch(() => []),
    ]);

    const notifications: CrmNotification[] = [];

    // Map missed calls
    for (const c of missedCalls) {
      const callerName = c.client?.name || c.lead?.name || "Caller";
      const callerPhone = c.lead?.phoneNumber || c.client?.phoneNumber || "";
      const searchParam = encodeURIComponent(callerPhone || callerName);

      notifications.push({
        id: `call-${c.id}`,
        type: "CALL",
        title: `Missed Call: ${callerName}`,
        description: `${callerPhone || "Phone call"} missed • WhatsApp recovery ready`,
        timestamp: formatRelativeTime(c.occurredAt),
        href: `/admin/calls?search=${searchParam}`,
        badge: "Missed Call",
        isUnread: !c.whatsappSent,
      });
    }

    // Map new/hot leads
    for (const l of newLeads) {
      const searchParam = encodeURIComponent(l.phoneNumber || l.name || "");

      notifications.push({
        id: `lead-${l.id}`,
        type: "LEAD",
        title: l.status === "INTERESTED" ? `🔥 Hot Lead: ${l.name}` : `New Lead: ${l.name}`,
        description: `${l.source || "Meta"} • ${l.city || l.state || "PCD Inquiry"}`,
        timestamp: formatRelativeTime(l.createdAt),
        href: `/admin/leads?search=${searchParam}`,
        badge: l.status === "INTERESTED" ? "Hot Lead" : "New Lead",
        isUnread: true,
      });
    }

    // Map overdue credits
    for (const cr of overdueCredits) {
      const amt = Number(cr.balanceAmount || 0);
      const searchParam = encodeURIComponent(cr.client?.name || "");

      notifications.push({
        id: `credit-${cr.id}`,
        type: "CREDIT",
        title: `Payment Overdue: ${cr.client?.name || "Distributor"}`,
        description: `₹${amt.toLocaleString("en-IN")} overdue • Due on ${new Date(cr.dueDate).toLocaleDateString("en-IN")}`,
        timestamp: formatRelativeTime(cr.createdAt),
        href: `/admin/credits?search=${searchParam}`,
        badge: "Overdue",
        isUnread: true,
      });
    }

    // Team follow-up reminders: one line per rep that has overdue / due-today follow-ups.
    const dueLeads = await prisma.lead
      .findMany({
        where: {
          ...companyScope,
          assignedEmployeeId: { not: null },
          followUpAt: { not: null, lt: endOfDay(now) },
          status: { notIn: [...CLOSED_LEAD_STATUSES] },
        },
        select: { id: true, followUpAt: true, assignedEmployee: { select: { id: true, name: true } } },
      })
      .catch(() => []);

    const byRep = new Map<string, { name: string; overdue: number; today: number; latest: number }>();
    for (const l of dueLeads) {
      if (!l.assignedEmployee || !l.followUpAt) continue;
      const row = byRep.get(l.assignedEmployee.id) ?? { name: l.assignedEmployee.name, overdue: 0, today: 0, latest: 0 };
      if (getFollowUpState(l.followUpAt, now) === "overdue") row.overdue++;
      else row.today++;
      row.latest = Math.max(row.latest, l.followUpAt.getTime());
      byRep.set(l.assignedEmployee.id, row);
    }
    const followUpNotes: CrmNotification[] = [...byRep.entries()]
      .sort((a, b) => b[1].overdue - a[1].overdue || b[1].today - a[1].today)
      .slice(0, 5)
      .map(([repId, r]) => ({
        id: `fu-rep-${repId}-${r.overdue}-${r.today}`,
        type: "FOLLOWUP" as const,
        title: `${r.name}: ${r.overdue > 0 ? `${r.overdue} overdue` : `${r.today} due today`} follow-up${(r.overdue || r.today) === 1 ? "" : "s"}`,
        description: [r.overdue ? `${r.overdue} overdue` : "", r.today ? `${r.today} due today` : ""].filter(Boolean).join(" • "),
        timestamp: formatRelativeTime(new Date(r.latest)),
        href: `/admin/follow-ups?employeeId=${repId}`,
        badge: r.overdue > 0 ? "Overdue" : "Due today",
        isUnread: true,
      }));
    notifications.unshift(...followUpNotes);

    const unreadCount = notifications.filter((n) => n.isUnread).length;

    return NextResponse.json({
      notifications,
      unreadCount,
      home: "/admin/calls",
      homeLabel: "View Telephony & CRM Alerts →",
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

/** A rep only sees their own reminders and newly allotted leads. */
async function buildEmployeeNotifications(employeeId: string | null, now: Date) {
  const home = "/employee/leads?followUp=due";
  if (!employeeId) return { notifications: [], unreadCount: 0, home, homeLabel: "Open my leads →" };

  const [dueLeads, newLeads] = await Promise.all([
    prisma.lead
      .findMany({
        where: {
          assignedEmployeeId: employeeId,
          followUpAt: { not: null, lt: endOfDay(now) },
          status: { notIn: [...CLOSED_LEAD_STATUSES] },
        },
        orderBy: { followUpAt: "asc" },
        take: 15,
        select: { id: true, name: true, phoneNumber: true, followUpAt: true },
      })
      .catch(() => []),
    prisma.lead
      .findMany({
        where: {
          assignedEmployeeId: employeeId,
          status: "ASSIGNED",
          updatedAt: { gte: new Date(now.getTime() - 3 * 86400000) },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, name: true, city: true, state: true, updatedAt: true },
      })
      .catch(() => []),
  ]);

  const notifications: CrmNotification[] = [];

  for (const l of dueLeads) {
    if (!l.followUpAt) continue;
    const state = getFollowUpState(l.followUpAt, now);
    const time = l.followUpAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const dateLabel = l.followUpAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const isDueNow = l.followUpAt <= now;
    notifications.push({
      // Includes the scheduled time, so rescheduling a lead raises a fresh reminder.
      id: `fu-${l.id}-${l.followUpAt.getTime()}`,
      type: "FOLLOWUP",
      title:
        state === "overdue"
          ? `Follow-up overdue: ${l.name ?? "Lead"}`
          : isDueNow
          ? `Follow-up due now: ${l.name ?? "Lead"}`
          : `Follow-up today: ${l.name ?? "Lead"}`,
      description: `${l.phoneNumber ?? "No phone"} • ${state === "overdue" ? `was due ${dateLabel}` : `due ${time}`}`,
      timestamp: formatRelativeTime(l.followUpAt),
      href: "/employee/leads?followUp=due",
      badge: state === "overdue" ? "Overdue" : "Due today",
      isUnread: true,
      dueAt: isDueNow ? l.followUpAt.toISOString() : undefined,
    });
  }

  for (const l of newLeads) {
    notifications.push({
      id: `assigned-${l.id}-${l.updatedAt.getTime()}`,
      type: "LEAD",
      title: `New lead allotted: ${l.name ?? "Lead"}`,
      description: [l.city, l.state].filter(Boolean).join(", ") || "PCD inquiry",
      timestamp: formatRelativeTime(l.updatedAt),
      href: "/employee/leads",
      badge: "New Lead",
      isUnread: true,
    });
  }

  return {
    notifications,
    unreadCount: notifications.length,
    home,
    homeLabel: "Open my follow-ups →",
  };
}
