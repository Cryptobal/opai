/**
 * Tipos de documento de instalación (checklist en visitas / config OPS).
 * Persistencia: Setting `ops_instalacion_documentos:{tenantId}`.
 */

import { prisma } from "@/lib/prisma";

export type InstalacionDocumentItem = {
  code: string;
  label: string;
  required: boolean;
};

const SETTING_PREFIX = "ops_instalacion_documentos";

export const DEFAULT_INSTALACION_DOCUMENTS: InstalacionDocumentItem[] = [
  { code: "contrato_servicio", label: "Contrato de servicio", required: false },
  { code: "plan_contingencia", label: "Plan de contingencia", required: false },
  { code: "libro_rondas", label: "Libro de rondas / bitácora", required: false },
  { code: "certificaciones", label: "Certificaciones y permisos", required: false },
];

function keyForTenant(tenantId: string): string {
  return `${SETTING_PREFIX}:${tenantId}`;
}

function isItem(item: unknown): item is InstalacionDocumentItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as InstalacionDocumentItem).code === "string" &&
    typeof (item as InstalacionDocumentItem).label === "string" &&
    typeof (item as InstalacionDocumentItem).required === "boolean"
  );
}

function parseStored(value: string | null): InstalacionDocumentItem[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isItem);
  } catch {
    return [];
  }
}

function effectiveList(stored: InstalacionDocumentItem[]): InstalacionDocumentItem[] {
  if (stored.length === 0) return [...DEFAULT_INSTALACION_DOCUMENTS];
  return stored;
}

export async function getInstalacionDocumentTypes(tenantId: string): Promise<InstalacionDocumentItem[]> {
  const key = keyForTenant(tenantId);
  const setting = await prisma.setting.findFirst({
    where: { key, tenantId },
  });
  const stored = parseStored(setting?.value ?? null);
  return effectiveList(stored);
}

export async function setInstalacionDocumentTypes(
  items: InstalacionDocumentItem[],
  tenantId: string,
): Promise<InstalacionDocumentItem[]> {
  const key = keyForTenant(tenantId);
  const value = JSON.stringify(items);
  const existing = await prisma.setting.findFirst({
    where: { key, tenantId },
    select: { id: true },
  });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "ops", tenantId },
    });
  }
  return items;
}
