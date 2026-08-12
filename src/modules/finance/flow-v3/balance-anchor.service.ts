import "server-only";
import { prisma } from "@/lib/prisma";
import { assertV3WeeksWritable } from "./weekly-close.adapter";
import { weekStartYmd } from "./weeks";

/** Setting key: mapa lunes ISO → saldo acumulado forzado (CLP entero). */
export const BALANCE_ANCHOR_SETTING_KEY = "finance.flow_v3.balance_anchors";

type AnchorMap = Record<string, number>;

function parseAnchors(raw: string | null | undefined): AnchorMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: AnchorMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

/** Carga anclas de saldo acumulado del tenant (lunes ISO → CLP). */
export async function loadBalanceAnchors(
  tenantId: string,
): Promise<Map<string, number>> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: BALANCE_ANCHOR_SETTING_KEY } },
    select: { value: true },
  });
  const parsed = parseAnchors(row?.value);
  return new Map(Object.entries(parsed));
}

/**
 * Upsert / clear de un ancla de saldo acumulado histórico.
 * `balanceClp = null` borra el ancla. Semanas cerradas se rechazan.
 * Semana actual/futura no aceptan ancla: el saldo sigue al banco en vivo.
 */
export async function upsertBalanceAnchor(
  tenantId: string,
  weekStart: string,
  balanceClp: number | null,
): Promise<{ weekStart: string; balanceClp: number | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error("weekStart inválido (esperado YYYY-MM-DD lunes ISO)");
  }
  await assertV3WeeksWritable(tenantId, [weekStart]);

  const currentWeek = weekStartYmd(new Date());
  if (balanceClp != null && weekStart >= currentWeek) {
    throw new Error(
      "El saldo de la semana actual y futuras sigue al banco en vivo; no se puede anclar.",
    );
  }

  const existing = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: BALANCE_ANCHOR_SETTING_KEY } },
    select: { id: true, value: true },
  });
  const map = parseAnchors(existing?.value);

  if (balanceClp == null) {
    delete map[weekStart];
  } else {
    if (!Number.isFinite(balanceClp)) {
      throw new Error("balanceClp inválido");
    }
    map[weekStart] = Math.round(balanceClp);
  }

  const value = JSON.stringify(map);
  if (existing) {
    await prisma.setting.update({
      where: { id: existing.id },
      data: { value, type: "json", category: "finance" },
    });
  } else {
    await prisma.setting.create({
      data: {
        tenantId,
        key: BALANCE_ANCHOR_SETTING_KEY,
        value,
        type: "json",
        category: "finance",
      },
    });
  }

  return {
    weekStart,
    balanceClp: balanceClp == null ? null : Math.round(balanceClp),
  };
}
