import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";

export default async function FlujoCajaLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  return <div className="space-y-4 min-w-0">{children}</div>;
}
