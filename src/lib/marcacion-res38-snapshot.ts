/**
 * Snapshot de datos del empleador / establecimiento / mandante / resolución DT
 * persistido en cada marca (Art. 13).
 */

import {
  formatEstablishmentAddress,
  formatRutComprobante,
} from "@/lib/marcacion-format";

export interface MarcacionRes38SnapshotInput {
  employerRut?: string | null;
  employerName?: string | null;
  installation: {
    address?: string | null;
    commune?: string | null;
    city?: string | null;
    region?: string | null;
    account?: {
      name?: string | null;
      legalName?: string | null;
      rut?: string | null;
    } | null;
  };
  dtResolucionJornada?: string | null;
  dtResolucionVigencia?: Date | null;
}

export interface MarcacionRes38Snapshot {
  employerRut: string | null;
  employerName: string | null;
  establishmentAddress: string | null;
  dtResolutionNumber: string | null;
  dtResolutionDate: Date | null;
  mandanteRut: string | null;
  mandanteName: string | null;
}

export function buildMarcacionRes38Snapshot(
  input: MarcacionRes38SnapshotInput,
): MarcacionRes38Snapshot {
  const address = formatEstablishmentAddress(input.installation);
  const account = input.installation.account;
  const mandanteName = account?.legalName?.trim() || account?.name?.trim() || null;
  const mandanteRut = account?.rut ? formatRutComprobante(account.rut) : null;

  return {
    employerRut: input.employerRut ? formatRutComprobante(input.employerRut) : null,
    employerName: input.employerName?.trim() || null,
    establishmentAddress: address || null,
    dtResolutionNumber: input.dtResolucionJornada?.trim() || null,
    dtResolutionDate: input.dtResolucionVigencia ?? null,
    mandanteRut,
    mandanteName,
  };
}
