import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveInstallationWindows, type ServiceWindow } from "./payroll-vigencia";

/**
 * Ventana de servicio por instalación (solo lectura). Fuente primaria: las
 * programaciones recurrentes activas vinculadas a la instalación; fallback:
 * `CrmInstallation.startDate/endDate`. Mover el inicio de la programación
 * recalcula el flujo al instante (derive-on-read, sin escrituras en CRM/Ops).
 */
export async function loadInstallationServiceWindows(
  tenantId: string,
): Promise<Map<string, ServiceWindow>> {
  const [templates, installations] = await Promise.all([
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, installationId: { not: null } },
      select: { installationId: true, startDate: true, endDate: true },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);
  return resolveInstallationWindows(templates, installations);
}

/**
 * Ventana de UNA instalación (misma resolución que el loader del tenant).
 * Retorna ventana abierta si no hay programación ni fechas en la instalación.
 */
export async function loadInstallationServiceWindow(
  tenantId: string,
  installationId: string,
): Promise<ServiceWindow> {
  const [templates, installation] = await Promise.all([
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, installationId },
      select: { installationId: true, startDate: true, endDate: true },
    }),
    prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);
  const windows = resolveInstallationWindows(templates, installation ? [installation] : []);
  return windows.get(installationId) ?? { startYmd: null, endYmd: null, source: "none" };
}
