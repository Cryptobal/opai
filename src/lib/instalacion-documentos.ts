/**
 * Configuración de documentos obligatorios en instalaciones (para visitas de supervisión).
 * Se guarda en Setting con key ops_instalacion_documentos.
 */

import { prisma } from "@/lib/prisma";

export type InstalacionDocumentItem = {
  code: string;
  label: string;
  required: boolean;
};

export const DEFAULT_INSTALACION_DOCUMENTS: InstalacionDocumentItem[] = [
  { code: "directiva_funcionamiento", label: "Directiva de funcionamiento", required: true },
  { code: "contrato_guardias", label: "Contrato de guardias al día", required: true },
  { code: "os10_guardias", label: "OS10 de los guardias", required: true },
];

const SETTING_KEY = "ops_instalacion_documentos";

function parseDocuments(value: string | null): InstalacionDocumentItem[] {
  if (!value?.trim()) return [...DEFAULT_INSTALACION_DOCUMENTS];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_INSTALACION_DOCUMENTS];
    return parsed.filter(
      (item): item is InstalacionDocumentItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as InstalacionDocumentItem).code === "string" &&
        typeof (item as InstalacionDocumentItem).label === "string" &&
        typeof (item as InstalacionDocumentItem).required === "boolean"
    );
  } catch {
    return [...DEFAULT_INSTALACION_DOCUMENTS];
  }
}

export async function getInstalacionDocumentTypes(
  tenantId?: string | null
): Promise<InstalacionDocumentItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  return parseDocuments(setting?.value ?? null);
}

export async function setInstalacionDocumentTypes(
  items: InstalacionDocumentItem[],
  tenantId?: string | null
): Promise<InstalacionDocumentItem[]> {
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
