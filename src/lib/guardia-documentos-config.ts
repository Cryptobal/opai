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
  /** Si false, el documento no aparece en el formulario público de postulación (sí en ficha admin). Default true. */
  visibleInGuardForm?: boolean;
  /** Si false, el documento no aparece en el formulario público de ingreso Turno Extra. Default false. */
  visibleInTeForm?: boolean;
  /** Si true, el documento debe verificarse físicamente durante visitas de supervisión. */
  obligatorioEnVisita?: boolean;
  /** Fase 18: si true, T-7/T-1 generan tarjeta individual además del digest (ej. OS10). */
  criticoLegal?: boolean;
  /** Fase 18: escalera de hitos custom (días antes de vencer); undefined = default [30,14,7,3,1,0]. */
  milestones?: number[];
};

const SETTING_KEY = "ops_guardia_documentos_config";
const DEFAULT_ALERT_DAYS = 30;

function sanitizeMilestones(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const nums = value
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 365);
  if (nums.length === 0) return undefined;
  return [...new Set(nums)].sort((a, b) => b - a);
}

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
            visibleInGuardForm: c.visibleInGuardForm !== false,
            visibleInTeForm: Boolean(c.visibleInTeForm),
            obligatorioEnVisita: Boolean(c.obligatorioEnVisita),
            criticoLegal: Boolean(c.criticoLegal),
            milestones: sanitizeMilestones(c.milestones),
          });
        }
      }
    }
    // Once the user has saved, their list is the source of truth — don't re-add defaults
    return result;
  } catch {
    return getDefaults();
  }
}

const OS10_CODES = new Set(["certificado_os10", "credencial_os10"]);

function getDefaults(): GuardiaDocumentoConfigItem[] {
  return DOCUMENT_TYPES.map((code) => ({
    code,
    hasExpiration: false,
    alertDaysBefore: DEFAULT_ALERT_DAYS,
    visibleInGuardForm: true,
    visibleInTeForm: false,
    obligatorioEnVisita: OS10_CODES.has(code),
    criticoLegal: OS10_CODES.has(code),
  }));
}

function mergeWithDefaults(partial: GuardiaDocumentoConfigItem[]): GuardiaDocumentoConfigItem[] {
  const byCode = new Map(partial.map((p) => [p.code, p]));
  const base = DOCUMENT_TYPES.map((code) => {
    const existing = byCode.get(code);
    return {
      code,
      hasExpiration: existing?.hasExpiration ?? false,
      alertDaysBefore: Math.max(
        1,
        Math.min(365, Number(existing?.alertDaysBefore) || DEFAULT_ALERT_DAYS)
      ),
      visibleInGuardForm: existing?.visibleInGuardForm !== false,
      visibleInTeForm: Boolean(existing?.visibleInTeForm),
      obligatorioEnVisita: existing !== undefined ? Boolean(existing.obligatorioEnVisita) : OS10_CODES.has(code),
      criticoLegal: existing !== undefined ? Boolean(existing.criticoLegal) : OS10_CODES.has(code),
      milestones: sanitizeMilestones(existing?.milestones),
    };
  });
  const docCodes = new Set(DOCUMENT_TYPES as readonly string[]);
  const extras = partial.filter((p) => !docCodes.has(p.code));
  const seenExtra = new Set<string>();
  const mergedExtras: GuardiaDocumentoConfigItem[] = [];
  for (const p of extras) {
    if (seenExtra.has(p.code)) continue;
    seenExtra.add(p.code);
    mergedExtras.push({
      code: p.code,
      hasExpiration: Boolean(p.hasExpiration),
      alertDaysBefore: Math.max(1, Math.min(365, Number(p.alertDaysBefore) || DEFAULT_ALERT_DAYS)),
      visibleInGuardForm: p.visibleInGuardForm !== false,
      visibleInTeForm: Boolean(p.visibleInTeForm),
      obligatorioEnVisita: Boolean(p.obligatorioEnVisita),
      criticoLegal: Boolean(p.criticoLegal),
      milestones: sanitizeMilestones(p.milestones),
    });
  }
  return [...base, ...mergedExtras];
}

export async function getGuardiaDocumentosConfig(
  tenantId?: string | null
): Promise<GuardiaDocumentoConfigItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const setting = await prisma.setting.findFirst({
    where: { key, tenantId: tenantId ?? null },
  });
  return parseConfig(setting?.value ?? null);
}

export async function setGuardiaDocumentosConfig(
  items: GuardiaDocumentoConfigItem[],
  tenantId?: string | null
): Promise<GuardiaDocumentoConfigItem[]> {
  const key = tenantId ? `${SETTING_KEY}:${tenantId}` : SETTING_KEY;
  const value = JSON.stringify(items);
  const existing = await prisma.setting.findFirst({ where: { key, tenantId: tenantId ?? null }, select: { id: true } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "ops", tenantId: tenantId ?? null },
    });
  }
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
