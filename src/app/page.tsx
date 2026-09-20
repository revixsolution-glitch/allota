import { Role } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role === Role.SUPER_ADMIN) {
    redirect("/super-admin");
  } else if (session.role === Role.ADMIN) {
    redirect("/admin");
  } else {
    redirect("/employee");
  }
}
