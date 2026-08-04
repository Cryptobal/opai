/**
 * CRM — Papelera de cotizaciones (CPQ)
 *
 * Vista de cotizaciones eliminadas (soft-delete restaurable). Gateada por
 * permiso de eliminación (mismo criterio que las acciones del listado).
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canDelete } from "@/lib/permissions-server";
import { CrmQuotesTrashClient } from "@/components/crm/CrmQuotesTrashClient";

export default async function CrmQuotesTrashPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/cotizaciones/papelera");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "quotes")) redirect("/crm");
  const allowed = canDelete(perms, "cpq") || canDelete(perms, "crm", "quotes");
  if (!allowed) redirect("/crm/cotizaciones");

  return (
    <div className="min-w-0">
      <CrmQuotesTrashClient />
    </div>
  );
}
