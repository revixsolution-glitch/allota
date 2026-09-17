import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

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
  ];

  if (settings?.enableClientsManagement) {
    navItems.push({ href: "/employee/clients", label: "My Clients" });
  }

  return (
    <AppShell
      title={company?.name ? company.name : "Pharma CRM"}
      portalType="Employee"
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
