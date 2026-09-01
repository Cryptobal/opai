import { prisma } from "@/lib/prisma";
import { getTransactionalKind } from "@/lib/email/transactional-catalog";

/**
 * ¿El tenant tiene habilitado este kind en Correos automáticos?
 *
 * - Kind desconocido (no está en el catálogo): se considera habilitado.
 * - Kind `required`: siempre habilitado (el toggle de UI no aplica).
 * - Sin fila en `TenantTransactionalEmailConfig`: habilitado (default).
 * - Fila con `enabled: false`: deshabilitado.
 * Fail-open: si la consulta falla, el correo se sigue enviando.
 */
export async function isTransactionalKindEnabled(
  tenantId: string,
  kind: string,
): Promise<boolean> {
  const kindDef = getTransactionalKind(kind);
  if (!kindDef || kindDef.required) return true;

  try {
    const toggle = await prisma.tenantTransactionalEmailConfig.findUnique({
      where: { tenantId_kind: { tenantId, kind } },
      select: { enabled: true },
    });
    return toggle?.enabled !== false;
  } catch (err) {
    console.error(
      `[isTransactionalKindEnabled] tenant=${tenantId} kind=${kind} lookup failed:`,
      err,
    );
    return true;
  }
}
