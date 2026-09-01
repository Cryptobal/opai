/**
 * Flags por tenant para apagar correos de cierre una vez validado su equivalente
 * en Slack. Default `true` (ausencia del Setting = habilitado): NO cambia el
 * comportamiento hasta que un humano lo apague por tenant (Setting.value="false").
 *
 * Claves: `reporteTurnoEmailEnabled`, `controlNocturnoEmailEnabled`.
 *
 * La UI de Configuración → Correos automáticos usa `TenantTransactionalEmailConfig`
 * (`rondas_monitor`, `cobertura_alert`, `control_nocturno_report`). Ambos
 * mecanismos se combinan con AND: si cualquiera está en false, no se envía.
 */

import { prisma } from "@/lib/prisma";
import { isTransactionalKindEnabled } from "@/lib/email/is-kind-enabled";

export type TenantEmailFlag = "reporteTurnoEmailEnabled" | "controlNocturnoEmailEnabled";

/** Kinds del catálogo transaccional que corresponden a los reportes de monitoreo. */
export const OPS_REPORT_EMAIL_KIND = {
  coberturaSnapshot: "cobertura_alert",
  reporteTurno: "rondas_monitor",
  controlNocturno: "control_nocturno_report",
} as const;

export type OpsReportEmailFlags = {
  coberturaSnapshot: boolean;
  reporteTurno: boolean;
  controlNocturno: boolean;
};

export async function isTenantEmailEnabled(tenantId: string, key: TenantEmailFlag): Promise<boolean> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key, tenantId },
      select: { value: true },
    });
    // Solo "false" explícito apaga; cualquier otro valor (o ausencia) = habilitado.
    return setting?.value !== "false";
  } catch {
    return true; // fail-open: ante error, el correo sigue enviándose
  }
}

/**
 * Estado efectivo de los reportes de monitoreo para un tenant.
 * Combina Correos automáticos (catálogo) + kill-switch Setting (BLOQUE 9).
 */
export async function getOpsReportEmailFlags(tenantId: string): Promise<OpsReportEmailFlags> {
  const [
    coberturaSnapshot,
    reporteTurnoKind,
    controlNocturnoKind,
    reporteTurnoSetting,
    controlNocturnoSetting,
  ] = await Promise.all([
    isTransactionalKindEnabled(tenantId, OPS_REPORT_EMAIL_KIND.coberturaSnapshot),
    isTransactionalKindEnabled(tenantId, OPS_REPORT_EMAIL_KIND.reporteTurno),
    isTransactionalKindEnabled(tenantId, OPS_REPORT_EMAIL_KIND.controlNocturno),
    isTenantEmailEnabled(tenantId, "reporteTurnoEmailEnabled"),
    isTenantEmailEnabled(tenantId, "controlNocturnoEmailEnabled"),
  ]);

  return {
    coberturaSnapshot,
    reporteTurno: reporteTurnoKind && reporteTurnoSetting,
    controlNocturno: controlNocturnoKind && controlNocturnoSetting,
  };
}
