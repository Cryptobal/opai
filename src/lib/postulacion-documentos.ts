/**
 * Configuración de documentos requeridos en el formulario de postulación de guardias.
 * Se guarda en Setting con key ops_postulacion_documentos (global) o por tenant.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_POSTULACION_DOCUMENTS } from "@/lib/personas";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";

export type PostulacionDocumentItem = {
  code: string;
  label: string;
  required: boolean;
};

const SETTING_KEY = "ops_postulacion_documentos";

function isPostulacionItem(item: unknown): item is PostulacionDocumentItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as PostulacionDocumentItem).code === "string" &&
    typeof (item as PostulacionDocumentItem).label === "string" &&
    typeof (item as PostulacionDocumentItem).required === "boolean"
  );
}

/** Solo lo guardado en BD (sin rellenar defaults). Vacío si no hay valor o JSON inválido. */
export function parseStoredPostulacionDocumentsArray(value: string | null): PostulacionDocumentItem[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPostulacionItem);
  } catch {
    return [];
  }
}

/**
 * Añade al final los tipos default que falten (p. ej. historial_penal tras ampliar el catálogo).
 */
export function mergeMissingDefaultPostulacionDocuments(items: PostulacionDocumentItem[]): PostulacionDocumentItem[] {
  const codes = new Set(items.map((i) => i.code));
  const extra = DEFAULT_POSTULACION_DOCUMENTS.filter((d) => !codes.has(d.code)).map((d) => ({ ...d }));
  return [...items, ...extra];
}

/** Lista efectiva igual que ve el usuario en GET: defaults completos si nunca guardó; si no, merge de faltantes. */
export function getEffectivePostulacionDocuments(stored: PostulacionDocumentItem[]): PostulacionDocumentItem[] {
  if (stored.length === 0) return [...DEFAULT_POSTULACION_DOCUMENTS];
  return mergeMissingDefaultPostulacionDocuments(stored);
}

/**
 * Obtiene la lista de documentos de postulación configurados.
 * Si no hay config guardada, devuelve el default. Si hay lista parcial, completa tipos default faltantes.
 */
export async function getPostulacionDocumentTypes(tenantId?: string | null): Promise<PostulacionDocumentItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  const stored = parseStoredPostulacionDocumentsArray(setting?.value ?? null);
  return getEffectivePostulacionDocuments(stored);
}

/** Lista persistida sin merge (para validar eliminaciones respecto al catálogo efectivo previo). */
export async function getStoredPostulacionDocumentTypesRaw(
  tenantId?: string | null
): Promise<PostulacionDocumentItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findUnique({ where: { key } });
  return parseStoredPostulacionDocumentsArray(setting?.value ?? null);
}

export async function validatePostulacionDocumentRemoval(
  tenantId: string,
  previousEffective: PostulacionDocumentItem[],
  nextItems: PostulacionDocumentItem[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nextCodes = new Set(nextItems.map((i) => i.code));
  for (const prev of previousEffective) {
    if (nextCodes.has(prev.code)) continue;
    const n = await prisma.opsDocumentoPersona.count({
      where: { tenantId, type: prev.code },
    });
    if (n > 0) {
      return {
        ok: false,
        error: `No se puede quitar «${prev.label}» (${prev.code}): hay ${n} documento(s) asociado(s) en fichas de guardias.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Documentos de postulación que pueden ver/completar los guardias en el formulario público.
 * Respeta `visibleInGuardForm` en la configuración de ficha (default visible).
 */
export async function getPostulacionDocumentTypesVisibleOnGuardForm(
  tenantId?: string | null
): Promise<PostulacionDocumentItem[]> {
  const [docs, cfg] = await Promise.all([
    getPostulacionDocumentTypes(tenantId),
    getGuardiaDocumentosConfig(tenantId),
  ]);
  const vis = new Map(cfg.map((c) => [c.code, c.visibleInGuardForm !== false]));
  return docs.filter((d) => vis.get(d.code) !== false);
}

/**
 * Guarda la lista de documentos de postulación.
 */
export async function setPostulacionDocumentTypes(
  items: PostulacionDocumentItem[],
  tenantId?: string | null
): Promise<PostulacionDocumentItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const value = JSON.stringify(items);
  await prisma.setting.upsert({
    where: { key },
    create: {
      key,
      value,
      type: "json",
      category: "ops",
      tenantId: tenantId ?? null,
    },
    update: { value },
  });
  return items;
}
