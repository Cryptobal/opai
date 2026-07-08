/**
 * Alerta de marca fuera de rango → canal Slack de la instalación (control de
 * asistencia). Se dispara EN PARALELO al correo existente (no lo reemplaza),
 * fire-and-forget desde los endpoints de marcación.
 *
 * Usa `notify({type:'marcacion_fuera_rango'})` con blocks enriquecidos vía
 * `data.__customBlocks` (hook de `dispatch.ts`): la tarjeta trae foto embebida
 * y campos propios en lugar del render genérico.
 */

import { notify } from "@/lib/notifications/notify";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { buildMarcacionFueraRangoBlocks } from "@/lib/integrations/slack/marcacion-alerta-blocks";

export interface NotifyMarcacionFueraRangoParams {
  tenantId: string;
  installationId: string;
  installationName: string;
  guardiaName: string;
  guardiaRut: string;
  /** "entrada" | "salida" (o el `tipo` crudo del endpoint). */
  tipo: string;
  timestamp: Date;
  geoDistanciaM: number | null;
  geoRadiusM: number;
  lat: number | null;
  lng: number | null;
  fotoEvidenciaUrl?: string | null;
  deviceDisplay?: string | null;
}

export async function notifyMarcacionFueraRango(
  params: NotifyMarcacionFueraRangoParams,
): Promise<void> {
  // Ruta a la vista de marcaciones (no existe detalle por-id: /ops/marcaciones).
  const detailUrl = `${getCanonicalSiteUrl()}/ops/marcaciones`;

  const { text, blocks } = buildMarcacionFueraRangoBlocks({
    guardiaName: params.guardiaName,
    guardiaRut: params.guardiaRut,
    tipo: params.tipo,
    installationName: params.installationName,
    timestamp: params.timestamp,
    geoDistanciaM: params.geoDistanciaM,
    geoRadiusM: params.geoRadiusM,
    lat: params.lat,
    lng: params.lng,
    fotoEvidenciaUrl: params.fotoEvidenciaUrl ?? null,
    detailUrl,
    deviceDisplay: params.deviceDisplay ?? null,
  });

  const distancia = params.geoDistanciaM != null ? `${params.geoDistanciaM} m` : "sin dato";

  await notify({
    tenantId: params.tenantId,
    type: "marcacion_fuera_rango",
    title: `Marca fuera de rango · ${params.guardiaName}`,
    body: `${params.guardiaName} marcó ${params.tipo} a ${distancia} (radio ${params.geoRadiusM} m) en ${params.installationName}.`,
    link: "/ops/marcaciones",
    data: {
      installationId: params.installationId,
      __customBlocks: blocks,
      __customText: text,
      guardia: params.guardiaName,
      instalacion: params.installationName,
    },
    forceChannels: { slack: true },
  });
}
