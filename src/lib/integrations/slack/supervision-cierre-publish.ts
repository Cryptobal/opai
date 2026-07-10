/**
 * Publicador de la tarjeta "Cierre de supervisión" al canal del módulo ops.
 * Best-effort: nunca lanza. Reutiliza `publishOpsCierreCard` (que ya gatea por
 * workspace Slack ACTIVE + rutea al canal ops). Sobre eso, un flag por tenant
 * `reporteSupervisionSlackEnabled` (tabla Setting, sin migración) permite
 * apagar la tarjeta sin desconectar Slack. Solo "false" explícito la apaga.
 */

import { prisma } from "@/lib/prisma";
import { publishOpsCierreCard } from "./cierre-publish";

/** Flag por tenant (tabla Setting). Solo "false" explícito apaga. Fail-open. */
async function isSupervisionSlackEnabled(tenantId: string): Promise<boolean> {
  try {
    const s = await prisma.setting.findFirst({
      where: { key: "reporteSupervisionSlackEnabled", tenantId },
      select: { value: true },
    });
    return s?.value !== "false";
  } catch {
    return true;
  }
}

/** Publica la tarjeta de cierre de supervisión al canal ops. Best-effort, nunca lanza. */
export async function publishSupervisionCierreCard(
  tenantId: string,
  card: { text: string; blocks: unknown[] },
): Promise<void> {
  try {
    const enabled = await isSupervisionSlackEnabled(tenantId);
    if (!enabled) return;
    await publishOpsCierreCard(tenantId, card); // ya gatea por workspace ACTIVE + rutea canal ops
  } catch (err) {
    console.error("[slack] publishSupervisionCierreCard falló:", err);
  }
}
