export type PublicReportMetadata = {
  category: string;
  reporterName?: string;
  reporterContact?: string;
  gps: {
    lat: number;
    lng: number;
    accuracy: number | null;
    distanceM: number;
  };
  userAgent?: string;
  ip?: string;
  dedupHash?: string;
};

export type ValidationMetadata = {
  validatedBy?: string;
  validatedByName?: string;
  validatedAt: string;
  auto?: boolean;
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/** Merge superficial por clave de primer nivel; objetos anidados se fusionan. */
export function mergeTicketMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = asRecord(existing);
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const prev = base[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      result[key] = { ...(prev as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function readPublicReport(metadata: unknown): PublicReportMetadata | null {
  const rec = asRecord(asRecord(metadata).publicReport);
  if (!rec.category || typeof rec.category !== "string") return null;
  const gps = asRecord(rec.gps);
  return {
    category: rec.category,
    reporterName: typeof rec.reporterName === "string" ? rec.reporterName : undefined,
    reporterContact: typeof rec.reporterContact === "string" ? rec.reporterContact : undefined,
    gps: {
      lat: Number(gps.lat) || 0,
      lng: Number(gps.lng) || 0,
      accuracy: gps.accuracy == null ? null : Number(gps.accuracy),
      distanceM: Number(gps.distanceM) || 0,
    },
    userAgent: typeof rec.userAgent === "string" ? rec.userAgent : undefined,
    ip: typeof rec.ip === "string" ? rec.ip : undefined,
    dedupHash: typeof rec.dedupHash === "string" ? rec.dedupHash : undefined,
  };
}

export function readValidation(metadata: unknown): ValidationMetadata | null {
  const rec = asRecord(asRecord(metadata).validation);
  if (typeof rec.validatedAt !== "string") return null;
  return {
    validatedBy: typeof rec.validatedBy === "string" ? rec.validatedBy : undefined,
    validatedByName: typeof rec.validatedByName === "string" ? rec.validatedByName : undefined,
    validatedAt: rec.validatedAt,
    auto: rec.auto === true,
  };
}
