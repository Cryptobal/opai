/**
 * Serialización segura para `finance.finance_factoring_operations.cession_rpetc_raw`
 * (audit trail: respuestas proveedor Octava/SimpleAPI, XML envío/recepción SII SOAP, etc.).
 */

import type { Prisma } from "@prisma/client";
import type { DteCedeResponse } from "../shared/adapters/dte-provider.adapter";

const MAX_JSON_STRING_CHARS = 150_000;

/** Referencia de AEC que no es TrackId RPETC numérico (p. ej. URL S3 de Octava). */
export function isProviderAecReferenceUrl(trackId: string): boolean {
  return /^\s*https?:\/\//i.test(trackId.trim());
}

function jsonSafeUnknown(v: unknown): unknown {
  if (v === null || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (typeof v === "string") {
    if (v.length <= MAX_JSON_STRING_CHARS) return v;
    return {
      _truncated: true,
      length: v.length,
      head: v.slice(0, MAX_JSON_STRING_CHARS),
    };
  }
  if (typeof v === "bigint") {
    return v.toString();
  }
  try {
    const s = JSON.stringify(v);
    if (s.length <= MAX_JSON_STRING_CHARS * 2) {
      return JSON.parse(s) as unknown;
    }
    return {
      _truncated: true,
      jsonPreview: s.slice(0, MAX_JSON_STRING_CHARS),
    };
  } catch {
    return {
      _unserializable: true,
      preview: String(v).slice(0, 8000),
    };
  }
}

/**
 * Estado terminal de aceptación ya conocido al enviar (Octava tras polling devuelve EOK).
 * El cron SOAP usa trackId numérico; las URLs del proveedor se excluyen de esa consulta.
 */
export function isTerminalRpetcAcceptedCode(status: string | undefined): boolean {
  const u = (status ?? "").trim().toUpperCase();
  return u === "EOK" || u === "EPR";
}

/** Snapshot inicial al crear la operación (antes del primer poll SOAP, si aplica). */
export function buildInitialCessionRpetcSnapshot(
  cedeResult: DteCedeResponse,
): Prisma.InputJsonValue {
  const submittedAt = new Date().toISOString();
  const base: Record<string, unknown> = {
    submittedAt,
    providerStatusAtSubmit: cedeResult.status ?? null,
  };
  if (cedeResult.trackId) {
    base.trackIdOrProviderRef = cedeResult.trackId;
  }
  if (cedeResult.rawResponse !== undefined) {
    base.providerResponse = jsonSafeUnknown(cedeResult.rawResponse);
  }
  return base as Prisma.InputJsonValue;
}

export function mergeCessionRpetcRaw(
  prior: Prisma.JsonValue | null | undefined,
  soapUpdate: Record<string, unknown>,
): Prisma.InputJsonValue {
  if (prior !== null && prior !== undefined && typeof prior === "object" && !Array.isArray(prior)) {
    return {
      ...(prior as Record<string, unknown>),
      ...soapUpdate,
    } as Prisma.InputJsonValue;
  }
  return {
    priorUnknown: prior ?? null,
    ...soapUpdate,
  } as Prisma.InputJsonValue;
}
