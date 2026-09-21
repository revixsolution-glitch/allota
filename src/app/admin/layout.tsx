import { AppShell } from "@/components/AppShell";
import { SupportModeBanner } from "@/components/SupportModeBanner";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  await ensureCompanySettingsColumns();

  const company = activeCompanyId
    ? await prisma.company.findUnique({
        where: { id: activeCompanyId },
        include: { settings: true },
      })
    : null;

  const settings = company?.settings?.[0] ?? (await prisma.companySettings.findFirst());

  const isImpersonating = session?.role === "SUPER_ADMIN" && Boolean(session.impersonatedCompanyId);

  // Core Lead Management Suite (Always Active for All Clients - ₹0 Marg Cost)
  const navItems: { href: string; label: string }[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/leads", label: "Lead Center" },
    { href: "/admin/leads-iq", label: "Leads IQ" },
    { href: "/admin/sources", label: "Sources & Excel" },
    { href: "/admin/leads-reassign", label: "Leads Reassign" },
    { href: "/admin/employees", label: "Employees" },
    { href: "/admin/calls", label: "AI Calls Summary" },
  ];

  // Premium Billing ERP Modules (Shown only when client pays for Marg/Busy API)
  if (settings?.enableClientsManagement) {
    navItems.push({ href: "/admin/clients", label: "Clients" });
  }
  if (settings?.enableTerritories) {
    navItems.push({ href: "/admin/territories", label: "Territories" });
  }
  if (settings?.enableStockIq) {
    navItems.push({ href: "/admin/stock-iq", label: "Stock IQ" });
  }
  if (settings?.enableReorders) {
    navItems.push({ href: "/admin/reorders", label: "Reorders" });
  }
  if (settings?.enableCreditManagement) {
    navItems.push({ href: "/admin/credits", label: "Credit Management" });
  }

  // Organization Settings & Integrations
  navItems.push({ href: "/admin/settings", label: "Settings" });

  const displayTitle =
    company?.name && !company.name.includes("Pharma Life") && !company.name.includes("Pharma CRM")
      ? company.name
      : "Allota AI";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {isImpersonating && (
        <SupportModeBanner
          companyName={displayTitle}
          planTier={company?.planTier || "CORE_LEAD_SUITE"}
        />
      )}
      <AppShell
        title={displayTitle}
        portalType="Admin"
        navItems={navItems}
      >
        {children}
      </AppShell>
    </div>
  );
}
