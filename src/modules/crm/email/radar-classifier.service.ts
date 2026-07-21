import { prisma } from "@/lib/prisma";
import { isRadarComercialEnabled } from "@/lib/crm/radar-settings";
import { classifyThread, generateDraftReply } from "./radar-classify-ai";
import { generateThreadRadarItems, type CreatedRadarItem } from "./radar-items";
import { stripHtml, hoyISO } from "./radar-util";
import { dispatchRadarAlert } from "@/lib/crm/radar-alerts";

/** Máx. de hilos a clasificar por corrida (cola FIFO por fecha). */
const MAX_PER_RUN = 20;

type Msg = {
  direction: string;
  fromEmail: string;
  textBody: string | null;
  htmlBody: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
};

function firstInbound(msgs: Msg[]): Date | null {
  const m = msgs.find((x) => x.direction === "in");
  return m?.receivedAt ?? m?.sentAt ?? null;
}

function firstReply(msgs: Msg[], inboundAt: Date | null): Date | null {
  if (!inboundAt) return null;
  const m = msgs.find((x) => x.direction === "out" && x.sentAt && x.sentAt > inboundAt);
  return m?.sentAt ?? null;
}

/**
 * Pre-marcado barato (sin IA): saca del backlog los hilos históricos del
 * backfill (>14 días sin clasificar) para que la cola de candidatos no se
 * queme con hilos viejos.
 */
async function preMarkStaleThreads(tenantId: string, emailAccountId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  await prisma.crmEmailThread.updateMany({
    where: {
      tenantId,
      emailAccountId,
      aiClassifiedAt: null,
      lastMessageAt: { lt: cutoff },
    },
    data: { aiClassifiedAt: new Date() },
  });
}

/**
 * Selecciona hilos de la casilla con inbound nuevo (aiClassifiedAt < último
 * mensaje), ventana de 14 días y lo más nuevo primero.
 */
async function pickCandidateThreads(tenantId: string, emailAccountId: string) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "crm"."email_threads"
    WHERE "tenant_id" = ${tenantId} AND "email_account_id" = ${emailAccountId}::uuid
      AND "last_message_at" IS NOT NULL
      AND "last_message_at" >= now() - interval '14 days'
      AND ("ai_classified_at" IS NULL OR "ai_classified_at" < "last_message_at")
    ORDER BY "last_message_at" DESC
    LIMIT ${MAX_PER_RUN}`;
}

async function classifyOne(
  tenantId: string,
  userId: string,
  threadId: string,
): Promise<CreatedRadarItem[]> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      id: true, subject: true, leadId: true, dealId: true, accountId: true, aiClassifiedAt: true,
      messages: {
        orderBy: { sentAt: "asc" },
        select: { direction: true, fromEmail: true, textBody: true, htmlBody: true, sentAt: true, receivedAt: true },
      },
    },
  });
  if (!thread) return [];
  const msgs = thread.messages as Msg[];
  const inboundAt = firstInbound(msgs);
  const replyAt = firstReply(msgs, inboundAt);
  const lastInbound = [...msgs].reverse().find((m) => m.direction === "in");
  const now = new Date();

  const base = { firstInboundAt: inboundAt, firstReplyAt: replyAt };
  // Sin inbound, o inbound ya clasificado (el último mensaje fue nuestra respuesta):
  // marca procesado sin gastar IA.
  const inboundTs = lastInbound?.receivedAt ?? lastInbound?.sentAt ?? null;
  if (!lastInbound || (thread.aiClassifiedAt && inboundTs && inboundTs <= thread.aiClassifiedAt)) {
    await prisma.crmEmailThread.update({ where: { id: thread.id }, data: { ...base, aiClassifiedAt: now } });
    return [];
  }

  const body = (lastInbound.textBody || stripHtml(lastInbound.htmlBody)).trim();
  const classification = await classifyThread({
    tenantId, subject: thread.subject, fromEmail: lastInbound.fromEmail, body, hoyISO: hoyISO(now),
  });
  if (!classification) {
    await prisma.crmEmailThread.update({ where: { id: thread.id }, data: { ...base, aiClassifiedAt: now } });
    return [];
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      ...base,
      aiCategory: classification.categoria,
      aiIntent: classification.intencion,
      aiSummary: classification.resumen,
      aiClassifiedAt: now,
    },
  });

  let draftReply: string | null = null;
  if (classification.intencion === "alta" && !thread.leadId && !thread.dealId) {
    draftReply = await generateDraftReply({
      tenantId, subject: thread.subject, fromEmail: lastInbound.fromEmail, body, resumen: classification.resumen,
    });
  }

  const created = await generateThreadRadarItems({
    tenantId, userId, threadId: thread.id, fromEmail: lastInbound.fromEmail,
    leadId: thread.leadId, dealId: thread.dealId, accountId: thread.accountId,
    classification, draftReply,
  });

  // Alertas Slack DM + in-app para lead nuevo / señal de compra (B3).
  // Los compromisos alertan al vencer (B7), no aquí.
  for (const it of created) {
    if (it.kind === "nuevo_lead" || it.kind === "senal_compra") {
      await dispatchRadarAlert(it.id);
    }
  }
  return created;
}

/**
 * Clasifica los hilos con inbound nuevo de una casilla y genera RadarItems.
 * Presupuesto: máx. 20 hilos por corrida (FIFO); el resto queda para la
 * siguiente. Respeta el kill-switch por tenant y el `deadlineMs` del cron.
 * Nunca lanza: la clasificación es best-effort.
 */
export async function classifyAccountThreads(params: {
  tenantId: string;
  emailAccountId: string;
  userId: string;
  deadlineMs?: number;
}): Promise<{ classified: number; items: CreatedRadarItem[] }> {
  const items: CreatedRadarItem[] = [];
  try {
    if (!(await isRadarComercialEnabled(params.tenantId))) return { classified: 0, items };
    const deadline = params.deadlineMs ?? Date.now() + 20_000;
    await preMarkStaleThreads(params.tenantId, params.emailAccountId);
    const candidates = await pickCandidateThreads(params.tenantId, params.emailAccountId);
    let classified = 0;
    for (const t of candidates) {
      if (Date.now() >= deadline) break;
      const created = await classifyOne(params.tenantId, params.userId, t.id);
      items.push(...created);
      classified++;
    }
    console.warn("[radar] corrida", {
      emailAccountId: params.emailAccountId,
      classified,
      items: items.length,
      msLeft: deadline - Date.now(),
    });
    return { classified, items };
  } catch (err) {
    console.warn("[radar] clasificación falló", params.emailAccountId, err);
    return { classified: 0, items };
  }
}
