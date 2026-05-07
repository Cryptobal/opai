import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function PayrollLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "payroll")) redirect("/hub");
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="payroll" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
