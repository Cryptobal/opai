/**
 * Despacho del comprobante de marcación (Art. 12-13).
 * El envío al trabajador es obligatorio; la copia al empleador depende de
 * `emailComprobanteDigitalEnabled`.
 */

import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { parseMarcacionConfigValue } from "@/lib/ops-marcacion-config";
import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import {
  sendAlertaGuardiaSinCorreoPersonal,
  sendMarcacionComprobante,
} from "@/lib/marcacion-email";
import type { MarcacionRes38Snapshot } from "@/lib/marcacion-res38-snapshot";

export interface DispatchComprobanteInput {
  tenantId: string;
  installationId: string;
  installationName: string;
  guardiaName: string;
  guardiaRut: string;
  guardiaEmail?: string | null;
  tipo: "entrada" | "salida";
  timestamp: Date;
  deviceTimestamp?: Date | null;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps";
  hashIntegridad: string;
  lat: number | null;
  lng: number | null;
  snapshot: MarcacionRes38Snapshot;
}

export async function dispatchMarcacionComprobante(
  input: DispatchComprobanteInput,
): Promise<void> {
  const [marcacionConfigSetting, tenantCfg] = await Promise.all([
    prisma.setting.findFirst({
      where: { key: `marcacion_config:${input.tenantId}` },
      select: { value: true },
    }),
    getTenantCompanyConfig(input.tenantId),
  ]);
  const marcacionConfig = parseMarcacionConfigValue(marcacionConfigSetting?.value);

  const verifyUrl = `${getCanonicalSiteUrl()}/verificar/${input.hashIntegridad}`;
  const employerEmails = [tenantCfg.emailOps, tenantCfg.email, tenantCfg.emailContact]
    .map((e) => (e ?? "").trim())
    .filter(Boolean);

  if (!input.guardiaEmail) {
    console.warn(
      `[marcacion] Guardia ${input.guardiaName} sin email personal — comprobante no enviado; alerta al empleador`,
    );
    await sendAlertaGuardiaSinCorreoPersonal({
      tenantId: input.tenantId,
      installationId: input.installationId,
      installationName: input.installationName,
      guardiaName: input.guardiaName,
      guardiaRut: input.guardiaRut,
      tipo: input.tipo,
      timestamp: input.timestamp,
      hashIntegridad: input.hashIntegridad,
      employerEmails,
    });
    return;
  }

  const ccEmails = marcacionConfig.emailComprobanteDigitalEnabled ? employerEmails : [];

  await sendMarcacionComprobante({
    guardiaName: input.guardiaName,
    guardiaEmail: input.guardiaEmail,
    guardiaRut: input.guardiaRut,
    installationName: input.installationName,
    tipo: input.tipo,
    timestamp: input.timestamp,
    deviceTimestamp: input.deviceTimestamp ?? null,
    receivedAt: input.deviceTimestamp ? new Date() : null,
    geoValidada: input.geoValidada,
    geoDistanciaM: input.geoDistanciaM,
    gpsStatus: input.gpsStatus,
    hashIntegridad: input.hashIntegridad,
    lat: input.lat,
    lng: input.lng,
    employerName: input.snapshot.employerName ?? tenantCfg.razonSocial,
    employerRut: input.snapshot.employerRut ?? tenantCfg.rut,
    establishmentAddress: input.snapshot.establishmentAddress,
    dtResolutionNumber: input.snapshot.dtResolutionNumber,
    dtResolutionDate: input.snapshot.dtResolutionDate,
    mandanteName: input.snapshot.mandanteName,
    mandanteRut: input.snapshot.mandanteRut,
    verifyUrl,
    ccEmails,
  });
}
