import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";
import { ConfigShell } from "@/components/opai-ds";

export default async function ConfiguracionLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "config")) redirect("/hub");
  return <ConfigShell>{children}</ConfigShell>;
}
