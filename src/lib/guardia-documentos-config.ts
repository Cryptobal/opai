/**
 * Configuración de documentos de ficha de guardia.
 * Por tipo: si tiene fecha de vencimiento y días antes de alerta.
 * Se guarda en Setting con key ops_guardia_documentos_config.
 */

import { prisma } from "@/lib/prisma";
import { DOCUMENT_TYPES } from "@/lib/personas";

export type GuardiaDocumentoConfigItem = {
  code: string;
  hasExpiration: boolean;
  alertDaysBefore: number;
};

const SETTING_KEY = "ops_guardia_documentos_config";
const DEFAULT_ALERT_DAYS = 30;

function parseConfig(value: string | null): GuardiaDocumentoConfigItem[] {
  if (!value?.trim()) return getDefaults();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return getDefaults();
    const result: GuardiaDocumentoConfigItem[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as GuardiaDocumentoConfigItem).code === "string"
      ) {
        const c = item as GuardiaDocumentoConfigItem;
        if (!seen.has(c.code)) {
          seen.add(c.code);
          result.push({
            code: c.code,
            hasExpiration: Boolean(c.hasExpiration),
            alertDaysBefore: Math.max(1, Math.min(365, Number(c.alertDaysBefore) || DEFAULT_ALERT_DAYS)),
          });
        }
      }
    }
    return mergeWithDefaults(result);
  } catch {
    return getDefaults();
  }
}

function getDefaults(): GuardiaDocumentoConfigItem[] {
  return DOCUMENT_TYPES.map((code) => ({
    code,
    hasExpiration: false,
    alertDaysBefore: DEFAULT_ALERT_DAYS,
  }));
}

function mergeWithDefaults(partial: GuardiaDocumentoConfigItem[]): GuardiaDocumentoConfigItem[] {
  const byCode = new Map(partial.map((p) => [p.code, p]));
  return DOCUMENT_TYPES.map((code) => {
    const existing = byCode.get(code);
    return (
      existing ?? {
        code,
        hasExpiration: false,
        alertDaysBefore: DEFAULT_ALERT_DAYS,
      }
    );
  });
}

export async function getGuardiaDocumentosConfig(
  tenantId?: string | null
): Promise<GuardiaDocumentoConfigItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  return parseConfig(setting?.value ?? null);
}

export async function setGuardiaDocumentosConfig(
  items: GuardiaDocumentoConfigItem[],
  tenantId?: string | null
): Promise<GuardiaDocumentoConfigItem[]> {
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

export function getAlertDaysForDocType(
  config: GuardiaDocumentoConfigItem[],
  docType: string
): number {
  const item = config.find((c) => c.code === docType);
  if (!item?.hasExpiration) return 0;
  return item.alertDaysBefore;
}
