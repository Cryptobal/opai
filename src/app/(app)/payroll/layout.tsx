import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";

export default async function PayrollLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "payroll")) redirect("/hub");
  // Tabs del módulo en la barra superior (AppShell); layout solo con guard.
  return <div className="min-w-0">{children}</div>;
}
