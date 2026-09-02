/**
 * Aviso al empleador cuando un guardia marca sin correo personal.
 * El comprobante Art. 13 queda en el portal; esta alerta es interna (opt-in
 * por correo) y se emite una vez por guardia y día Chile.
 */

import { startOfDayChile } from "@/lib/dates-cl";
import { sendAlertaGuardiaSinCorreoPersonal } from "@/lib/marcacion-email";
import { notify } from "@/lib/notifications/notify";
import type { MarcacionConfig } from "@/lib/ops-marcacion-config";
import { prisma } from "@/lib/prisma";

export interface NotifyMarcacionSinCorreoPersonalParams {
  tenantId: string;
  guardiaId: string;
  installationId: string;
  installationName: string;
  guardiaName: string;
  guardiaRut: string;
  tipo: "entrada" | "salida";
  timestamp: Date;
  hashIntegridad: string;
  marcacionConfig: MarcacionConfig;
}

export async function notifyMarcacionSinCorreoPersonal(
  params: NotifyMarcacionSinCorreoPersonalParams,
): Promise<void> {
  try {
    const count = await prisma.opsMarcacion.count({
      where: {
        tenantId: params.tenantId,
        guardiaId: params.guardiaId,
        deletedAt: null,
        timestamp: { gte: startOfDayChile(params.timestamp) },
      },
    });
    if (count > 1) return;

    await notify({
      tenantId: params.tenantId,
      type: "marcacion_sin_correo_personal",
      title: `Sin correo personal · ${params.guardiaName}`,
      body: `${params.guardiaName} (${params.guardiaRut}) marcó ${params.tipo} en ${params.installationName}; no tiene correo personal, el comprobante quedó en el portal.`,
      link: "/ops/marcaciones",
      data: {
        guardiaId: params.guardiaId,
        installationId: params.installationId,
        hashIntegridad: params.hashIntegridad,
      },
    });

    if (
      params.marcacionConfig.alertaSinCorreoPersonalEnabled &&
      params.marcacionConfig.alertaSinCorreoPersonalEmployerEmails.length > 0
    ) {
      await sendAlertaGuardiaSinCorreoPersonal({
        tenantId: params.tenantId,
        installationId: params.installationId,
        installationName: params.installationName,
        guardiaName: params.guardiaName,
        guardiaRut: params.guardiaRut,
        tipo: params.tipo,
        timestamp: params.timestamp,
        hashIntegridad: params.hashIntegridad,
        employerEmails: params.marcacionConfig.alertaSinCorreoPersonalEmployerEmails,
      });
    }
  } catch (err) {
    console.error("[marcacion] alerta sin correo", err);
  }
}
