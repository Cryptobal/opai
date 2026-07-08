/**
 * Flags por tenant para apagar correos de cierre una vez validado su equivalente
 * en Slack. Default `true` (ausencia del Setting = habilitado): NO cambia el
 * comportamiento hasta que un humano lo apague por tenant (Setting.value="false").
 *
 * Claves: `reporteTurnoEmailEnabled`, `controlNocturnoEmailEnabled`.
 */

import { prisma } from "@/lib/prisma";

export type TenantEmailFlag = "reporteTurnoEmailEnabled" | "controlNocturnoEmailEnabled";

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
