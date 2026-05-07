import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function ReportesDtLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/reportes/dt");
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "reportes_dt")) redirect("/hub");
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="reportes_dt" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
