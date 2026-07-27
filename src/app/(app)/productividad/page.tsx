import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { getTenantModulesList } from "@/lib/tenant-modules";
import {
  resolveProductividadLanding,
  SURFACE_COOKIE,
  surfaceCookieOptions,
} from "@/lib/surface";

export const dynamic = "force-dynamic";

/**
 * Entrada del portal Productividad.
 * Fija la cookie de superficie y redirige a la primera sub-superficie
 * permitida (Correos → Tareas → Agenda). Sin acceso → /hub.
 */
export default async function ProductividadEntryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/productividad");
  }

  const [permissions, tenantModules] = await Promise.all([
    resolvePermissions({
      role: session.user.role,
      roleTemplateId: session.user.roleTemplateId,
    }),
    session.user.tenantId
      ? getTenantModulesList(session.user.tenantId)
      : Promise.resolve([] as string[]),
  ]);

  const enabled = new Set(tenantModules);
  const isModuleEnabled = (key: string) => enabled.has(key);
  const isAdmin = session.user.role === "owner" || session.user.role === "admin";

  const landing = resolveProductividadLanding(permissions, isModuleEnabled, {
    isAdmin,
  });

  if (!landing) {
    redirect("/hub");
  }

  const cookieStore = await cookies();
  cookieStore.set(SURFACE_COOKIE, "productividad", surfaceCookieOptions());

  redirect(landing);
}
