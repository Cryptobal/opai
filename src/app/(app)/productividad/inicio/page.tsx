import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAppRequestContext } from "@/lib/app-request-context";
import { canEdit, canView } from "@/lib/permissions";
import {
  ProductividadHomeView,
} from "./_components/ProductividadHomeView";
import ProductividadInicioLoading from "./loading";

export const dynamic = "force-dynamic";

export default async function ProductividadInicioPage() {
  const ctx = await getAppRequestContext();
  if (!ctx?.session?.user) {
    redirect("/opai/login?callbackUrl=/productividad/inicio");
  }

  const { permissions, tenantModules, session } = ctx;
  const crmEnabled = tenantModules.includes("crm");

  const hasAgenda = canView(permissions, "productividad", "agenda");
  const hasCorreos =
    canView(permissions, "productividad", "correos") && crmEnabled;
  const hasTareas = canView(permissions, "productividad", "tareas");
  const canEditTareas =
    canEdit(permissions, "productividad", "tareas") ||
    canEdit(permissions, "crm", "deals");

  if (!hasAgenda && !hasCorreos && !hasTareas) {
    redirect("/hub");
  }

  return (
    <Suspense fallback={<ProductividadInicioLoading />}>
      <ProductividadHomeView
        currentUserId={session.user.id}
        perms={{ hasAgenda, hasCorreos, hasTareas, canEditTareas }}
      />
    </Suspense>
  );
}
