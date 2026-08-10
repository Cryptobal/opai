/**
 * Flags comunes para llamadas Drive que deben funcionar en Mi unidad
 * y en Unidades Compartidas. Nunca usar corpora: "allDrives".
 */
export function sharedDriveParams(driveId: string | null | undefined): {
  supportsAllDrives: true;
  includeItemsFromAllDrives?: true;
  corpora?: "drive";
  driveId?: string;
} {
  if (driveId) {
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId,
    };
  }
  return { supportsAllDrives: true };
}

/** Flags mínimos para create/get/update/delete (sin corpora). */
export function supportsAllDrivesFlag(): { supportsAllDrives: true } {
  return { supportsAllDrives: true };
}
