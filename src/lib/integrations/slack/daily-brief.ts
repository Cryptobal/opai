/**
 * Brief matinal del agente: prompt canónico, opt-in por tenant (Setting) y helpers.
 */

import { prisma } from "@/lib/prisma";

export const BRIEF_PROMPT =
  "Genera mi brief ejecutivo del día: tickets abiertos y con SLA vencido míos, aprobaciones pendientes, cotizaciones por vencer esta semana y titular de caja del mes. Máximo 10 líneas, sin saludos, con cifras reales de las tools.";

type BriefOptInValue = { adminIds: string[] };

function settingKey(tenantId: string): string {
  return `ai_daily_brief:${tenantId}`;
}

function parseOptIn(raw: string | null | undefined): BriefOptInValue {
  if (!raw) return { adminIds: [] };
  try {
    const obj = JSON.parse(raw) as { adminIds?: unknown };
    if (!Array.isArray(obj.adminIds)) return { adminIds: [] };
    const ids = [...new Set(obj.adminIds.filter((x): x is string => typeof x === "string" && !!x.trim()))];
    return { adminIds: ids };
  } catch {
    return { adminIds: [] };
  }
}

async function readOptIn(tenantId: string): Promise<{ id?: string; value: BriefOptInValue }> {
  const row = await prisma.setting.findFirst({
    where: { key: settingKey(tenantId) },
    select: { id: true, value: true },
  });
  return { id: row?.id, value: parseOptIn(row?.value) };
}

async function writeOptIn(tenantId: string, value: BriefOptInValue, existingId?: string): Promise<void> {
  const payload = JSON.stringify(value);
  if (existingId) {
    await prisma.setting.update({
      where: { id: existingId },
      data: { value: payload, type: "json", category: "ai_daily_brief" },
    });
    return;
  }
  await prisma.setting.create({
    data: {
      key: settingKey(tenantId),
      value: payload,
      type: "json",
      category: "ai_daily_brief",
      tenantId,
    },
  });
}

export async function getDailyBriefOptIns(tenantId: string): Promise<string[]> {
  const { value } = await readOptIn(tenantId);
  return value.adminIds;
}

export async function isDailyBriefOptIn(tenantId: string, adminId: string): Promise<boolean> {
  const ids = await getDailyBriefOptIns(tenantId);
  return ids.includes(adminId);
}

/** Toggle opt-in; devuelve true si quedó activado. */
export async function toggleDailyBriefOptIn(tenantId: string, adminId: string): Promise<boolean> {
  const { id, value } = await readOptIn(tenantId);
  const set = new Set(value.adminIds);
  let enabled: boolean;
  if (set.has(adminId)) {
    set.delete(adminId);
    enabled = false;
  } else {
    set.add(adminId);
    enabled = true;
  }
  await writeOptIn(tenantId, { adminIds: [...set] }, id);
  return enabled;
}

export async function listTenantsWithDailyBriefOptIns(): Promise<Array<{ tenantId: string; adminIds: string[] }>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "ai_daily_brief:" } },
    select: { tenantId: true, value: true },
  });
  const out: Array<{ tenantId: string; adminIds: string[] }> = [];
  for (const row of rows) {
    const { adminIds } = parseOptIn(row.value);
    if (adminIds.length > 0 && row.tenantId) out.push({ tenantId: row.tenantId, adminIds });
  }
  return out;
}
