import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";

export default async function EmployeeLayout({
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

  const navItems = [
    { href: "/employee", label: "Dashboard" },
    { href: "/employee/leads", label: "My Allotted Leads" },
    { href: "/employee/follow-ups", label: "Follow-ups" },
    { href: "/employee/dead-leads", label: "Dead Leads" },
    { href: "/employee/clients", label: "My Clients" },
  ];

  // The business name entered when the company was onboarded.
  const displayTitle = company?.name?.trim() || "Allota AI";

  const isKesrox = Boolean(
    activeCompanyId === "cmubi8zf6000004l8y45hhuds" ||
    company?.slug?.toLowerCase().includes("kesrox") ||
    company?.name?.toLowerCase().includes("kesrox")
  );

  const employee = session?.employeeId
    ? await prisma.employee.findUnique({
        where: { id: session.employeeId },
        select: { phoneNumber: true },
      })
    : null;

  return (
    <div className="min-h-screen">
      <AppShell
        title={displayTitle}
        portalType="Employee"
        navItems={navItems}
        showWhatsAppConnector={isKesrox}
        employeePhone={employee?.phoneNumber || undefined}
      >
        {children}
      </AppShell>
    </div>
  );
}
