import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess } from "@/lib/permissions";
import { getConfigCategory } from "@/lib/nav/registry";
import { ConfigCategoryClient } from "@/components/configuracion/ConfigCategoryClient";

/**
 * Nivel 2 de Configuración: `/opai/configuracion/[categoria]`.
 *
 * Segmento dinámico hermano de los estáticos de las hojas. Next.js prioriza las
 * rutas estáticas, así que `/opai/configuracion/empresa` sigue resolviendo a
 * `empresa/page.tsx`; este handler solo atiende los slugs de categoría
 * (general/permisos/comunicacion/plantillas/modulos/ia). Repite el gate de
 * módulo en servidor (no confía solo en el layout) y devuelve `notFound()`
 * para slugs que no existen en CONFIG_CATEGORIES.
 */
export default async function ConfigCategoryPage({
  params,
}: {
  params: Promise<{ categoria: string }>;
}) {
  const { categoria } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/opai/configuracion/${categoria}`);
  }

  const role = session.user.role;
  const perms = await resolvePermissions({ role, roleTemplateId: session.user.roleTemplateId });
  if (!hasModuleAccess(perms, "config")) redirect("/hub");

  if (!getConfigCategory(categoria)) notFound();

  return <ConfigCategoryClient slug={categoria} />;
}
