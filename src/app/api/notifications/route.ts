import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface CrmNotification {
  id: string;
  type: "CALL" | "LEAD" | "REORDER" | "CREDIT";
  title: string;
  description: string;
  timestamp: string;
  href: string;
  badge: string;
  isUnread: boolean;
}

export async function GET() {
  try {
    const session = await getSession();
    const activeCompanyId = getActiveCompanyId(session);
    const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

    const now = new Date();
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
          ...(activeCompanyId ? { client: { companyId: activeCompanyId } } : {}),
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
      notifications.push({
        id: `call-${c.id}`,
        type: "CALL",
        title: `Missed Call: ${callerName}`,
        description: `${c.lead?.phoneNumber || c.client?.phoneNumber || "Phone call"} missed • WhatsApp recovery ready`,
        timestamp: formatRelativeTime(c.occurredAt),
        href: "/admin/calls",
        badge: "Missed Call",
        isUnread: !c.whatsappSent,
      });
    }

    // Map new/hot leads
    for (const l of newLeads) {
      notifications.push({
        id: `lead-${l.id}`,
        type: "LEAD",
        title: l.status === "INTERESTED" ? `🔥 Hot Lead: ${l.name}` : `New Lead: ${l.name}`,
        description: `${l.source || "Meta"} • ${l.city || l.state || "PCD Inquiry"}`,
        timestamp: formatRelativeTime(l.createdAt),
        href: "/admin/leads",
        badge: l.status === "INTERESTED" ? "Hot Lead" : "New Lead",
        isUnread: true,
      });
    }

    // Map overdue credits
    for (const cr of overdueCredits) {
      const amt = Number(cr.balanceAmount || 0);
      notifications.push({
        id: `credit-${cr.id}`,
        type: "CREDIT",
        title: `Payment Overdue: ${cr.client?.name || "Distributor"}`,
        description: `₹${amt.toLocaleString("en-IN")} overdue • Due on ${new Date(cr.dueDate).toLocaleDateString("en-IN")}`,
        timestamp: formatRelativeTime(cr.createdAt),
        href: "/admin/credits",
        badge: "Overdue",
        isUnread: true,
      });
    }

    const unreadCount = notifications.filter((n) => n.isUnread).length;

    return NextResponse.json({
      notifications,
      unreadCount,
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
