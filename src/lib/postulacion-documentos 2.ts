/**
 * Configuración de documentos requeridos en el formulario de postulación de guardias.
 * Se guarda en Setting con key ops_postulacion_documentos (global) o por tenant.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_POSTULACION_DOCUMENTS } from "@/lib/personas";

export type PostulacionDocumentItem = {
  code: string;
  label: string;
  required: boolean;
};

const SETTING_KEY = "ops_postulacion_documentos";

function parseDocuments(value: string | null): PostulacionDocumentItem[] {
  if (!value?.trim()) return [...DEFAULT_POSTULACION_DOCUMENTS];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_POSTULACION_DOCUMENTS];
    return parsed.filter(
      (item): item is PostulacionDocumentItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PostulacionDocumentItem).code === "string" &&
        typeof (item as PostulacionDocumentItem).label === "string" &&
        typeof (item as PostulacionDocumentItem).required === "boolean"
    );
  } catch {
    return [...DEFAULT_POSTULACION_DOCUMENTS];
  }
}

/**
 * Obtiene la lista de documentos de postulación configurados.
 * Si no hay config guardada, devuelve el default (incluye los 9 tipos actuales).
 */
export async function getPostulacionDocumentTypes(tenantId?: string | null): Promise<PostulacionDocumentItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  return parseDocuments(setting?.value ?? null);
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
