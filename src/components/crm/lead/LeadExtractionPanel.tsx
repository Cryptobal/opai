"use client";

import { Sparkles } from "lucide-react";
import { DetailField, DetailFieldGrid } from "../DetailField";

/**
 * LeadExtractionPanel — "Copiloto · Extracción IA".
 *
 * Muestra los campos que la IA extrajo del correo/cotizador y que hoy solo
 * alimentan silenciosamente el formulario de aprobación
 * (metadata.extracted | metadata.extraction). Solo lectura; no toca la
 * lógica de aprobación.
 */

type ExtractedFields = {
  rut?: string;
  legalName?: string;
  contactRole?: string;
  address?: string;
  city?: string;
  commune?: string;
  website?: string;
  industry?: string;
};

function readString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = source[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseExtraction(metadata: unknown): ExtractedFields | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  const raw =
    meta.extracted && typeof meta.extracted === "object" && !Array.isArray(meta.extracted)
      ? (meta.extracted as Record<string, unknown>)
      : meta.extraction && typeof meta.extraction === "object" && !Array.isArray(meta.extraction)
        ? (meta.extraction as Record<string, unknown>)
        : null;
  if (!raw) return null;
  const contacto =
    raw.contacto && typeof raw.contacto === "object" && !Array.isArray(raw.contacto)
      ? (raw.contacto as Record<string, unknown>)
      : {};
  const fields: ExtractedFields = {
    rut: readString(raw, "rut"),
    legalName: readString(raw, "legalName", "razonSocial"),
    contactRole: readString(contacto, "cargo") || readString(raw, "contactRole"),
    address: readString(raw, "direccion", "address"),
    city: readString(raw, "ciudad", "city"),
    commune: readString(raw, "instalacionComuna", "commune", "comuna"),
    website: readString(raw, "website", "sitioWeb"),
    industry: readString(raw, "industry", "industria"),
  };
  return Object.values(fields).some(Boolean) ? fields : null;
}

export function LeadExtractionPanel({ metadata }: { metadata: unknown }) {
  const fields = parseExtraction(metadata);
  if (!fields) return null;

  return (
    <div className="space-y-3 rounded-lg border border-status-info-border bg-status-info-soft p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-info-fg">
        <Sparkles className="h-4 w-4" aria-hidden />
        Copiloto · Extracción IA
      </h4>
      <DetailFieldGrid columns={3}>
        {fields.rut && <DetailField label="RUT" value={fields.rut} />}
        {fields.legalName && <DetailField label="Razón social" value={fields.legalName} />}
        {fields.contactRole && <DetailField label="Cargo del contacto" value={fields.contactRole} />}
        {fields.address && <DetailField label="Dirección" value={fields.address} />}
        {fields.commune && <DetailField label="Comuna" value={fields.commune} />}
        {fields.city && <DetailField label="Ciudad" value={fields.city} />}
        {fields.website && <DetailField label="Sitio web" value={fields.website} />}
        {fields.industry && <DetailField label="Industria" value={fields.industry} />}
      </DetailFieldGrid>
      <p className="text-[11px] text-ds-text-3">
        Estos datos precargan el formulario de aprobación. Verifícalos antes de convertir.
      </p>
    </div>
  );
}
