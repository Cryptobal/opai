import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { isRadarComercialEnabled } from "@/lib/crm/radar-settings";
import { scopeName, scopeLink } from "@/lib/crm/radar-scope";
import { dispatchPersonalSlackDm } from "@/lib/integrations/slack/personal-dm";
import { generateFollowUp } from "./radar-followup";

type Item = {
  id: string; tenantId: string; userId: string; title: string;
  threadId: string | null; dealId: string | null; accountId: string | null;
  dueAt: Date | null; payload: unknown;
};

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function processOne(item: Item, now: Date): Promise<boolean> {
  if (!item.dueAt) return false;
  const payload = (item.payload as Record<string, unknown> | null) ?? {};
  const cmp = (payload.compromiso as Record<string, unknown> | undefined) ?? {};
  const quien = cmp.quien === "nosotros" ? "nosotros" : "cliente";
  const que = typeof cmp.que === "string" ? cmp.que : item.title;
  const fecha = typeof cmp.fechaISO === "string" ? cmp.fechaISO : "";
  const nombre = await scopeName(item.tenantId, item.dealId, item.accountId);

  // quien = nosotros → recordatorio el mismo día del compromiso (una sola vez).
  if (quien === "nosotros") {
    if (!sameUtcDay(item.dueAt, now) || payload.reminderAlertedAt) return false;
    await dispatchPersonalSlackDm({
      tenantId: item.tenantId, adminId: item.userId, typeKey: "radar_comercial",
      title: "⏰ Compromiso de hoy", body: `Hoy te comprometiste a ${que} con ${nombre}.`,
      category: "Radar Comercial",
      actions: [{ label: "Ver negocio", url: scopeLink(item.dealId, item.accountId), style: "primary" }],
    });
    await prisma.crmRadarItem.update({
      where: { id: item.id },
      data: { payload: { ...payload, reminderAlertedAt: now.toISOString() } as Prisma.InputJsonValue },
    });
    return true;
  }

  // quien = cliente → seguimiento solo si el compromiso ya venció (día anterior).
  if (item.dueAt >= startOfUtcDay(now)) return false;

  if (item.threadId) {
    // Respondió = inbound en/después del día del compromiso (evita falso nag si
    // el cliente contesta el mismo día antes del mediodía UTC).
    const inbound = await prisma.crmEmailMessage.findFirst({
      where: {
        tenantId: item.tenantId, threadId: item.threadId, direction: "in",
        sentAt: { gte: startOfUtcDay(item.dueAt) },
      },
      select: { id: true },
    });
    if (inbound) {
      await prisma.crmRadarItem.update({ where: { id: item.id }, data: { status: "DONE" } });
      return true; // respondió → DONE silencioso
    }
  }

  if (payload.followUpAlertedAt) return false; // ya se alertó una vez
  const draftFollowUp = await generateFollowUp(item.tenantId, { que, accountName: nombre });
  await prisma.crmRadarItem.update({
    where: { id: item.id },
    data: { payload: { ...payload, draftFollowUp, followUpAlertedAt: now.toISOString() } as Prisma.InputJsonValue },
  });
  const link = item.threadId ? `/crm/correos?thread=${item.threadId}` : scopeLink(item.dealId, item.accountId);
  await dispatchPersonalSlackDm({
    tenantId: item.tenantId, adminId: item.userId, typeKey: "radar_comercial",
    title: `⏰ ${nombre} quedó de ${que} el ${fecha} y no ha respondido`,
    body: draftFollowUp ?? "Prepará un seguimiento cordial.", category: "Radar Comercial",
    actions: [{ label: "Ver follow-up", url: link, style: "primary" }],
  });
  return true;
}

/** Procesa los compromisos PENDING vencidos / del día. Respeta el kill-switch. */
export async function processAllCompromisos(deadlineMs: number): Promise<number> {
  const items = await prisma.crmRadarItem.findMany({
    where: { kind: "compromiso", status: "PENDING" },
    orderBy: { dueAt: "asc" },
    take: 500,
    select: {
      id: true, tenantId: true, userId: true, title: true,
      threadId: true, dealId: true, accountId: true, dueAt: true, payload: true,
    },
  });
  const now = new Date();
  const enabledCache = new Map<string, boolean>();
  let processed = 0;
  for (const item of items) {
    if (Date.now() >= deadlineMs) break;
    let en = enabledCache.get(item.tenantId);
    if (en === undefined) {
      en = await isRadarComercialEnabled(item.tenantId);
      enabledCache.set(item.tenantId, en);
    }
    if (!en) continue;
    try {
      if (await processOne(item, now)) processed++;
    } catch (err) {
      console.warn("[radar-compromisos] item falló", item.id, err);
    }
  }
  return processed;
}
