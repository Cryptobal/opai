import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess } from "@/lib/permissions";
import { ConfigHomeClient } from "@/components/configuracion/ConfigHomeClient";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion");

  const role = session.user.role;
  const perms = await resolvePermissions({ role, roleTemplateId: session.user.roleTemplateId });
  if (!hasModuleAccess(perms, "config")) redirect("/hub");

  // Toda la taxonomía (secciones + accesos rápidos + búsqueda) se deriva del
  // registry vía useConfigCategories dentro de ConfigHomeClient. El sub-sidebar
  // (ConfigShell) lee de la misma fuente → una sola taxonomía.
  return <ConfigHomeClient />;
}
