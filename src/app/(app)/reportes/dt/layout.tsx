import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function ReportesDtLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/reportes/dt");
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "reportes_dt")) redirect("/hub");
  return <>{children}</>;
}
