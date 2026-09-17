import { Role } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(session.role === Role.ADMIN ? "/admin" : "/employee");
}
