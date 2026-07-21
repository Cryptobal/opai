import { prisma } from "@/lib/prisma";
import { isRadarComercialEnabled } from "@/lib/crm/radar-settings";
import { classifyThread, generateDraftReply } from "./radar-classify-ai";
import { generateThreadRadarItems, isNewLeadCandidate, type CreatedRadarItem } from "./radar-items";
import type { RadarClassification } from "./radar-types";
import { stripHtml, hoyISO } from "./radar-util";
import { writeSyncState } from "./gmail-sync-state";
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

const COMMERCIAL_CATEGORIES = ["cotizacion", "licitacion", "consulta_comercial"] as const;

/**
 * Reset del backlog quemado (una vez por corrida, barato):
 * 1) `aiCategory NULL` + clasificado en 14d (IA no corrió / falló — ej. bug
 *    de modelo/proveedor que devolvía null en TODAS las corridas)
 * 2) categoría no-comercial + inbound < 3d (clasificación previa errónea)
 * 3) asunto con keywords de cotización + no-comercial + 30d (re-clasificar)
 * Sin este reset nunca re-entrarían al candidato (`aiClassifiedAt < lastMessageAt`).
 */
async function resetBurnedBacklog(tenantId: string, emailAccountId: string): Promise<void> {
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const cutoff3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const res = await prisma.crmEmailThread.updateMany({
    where: {
      tenantId,
      emailAccountId,
      aiClassifiedAt: { not: null },
      leadId: null,
      dealId: null,
      OR: [
        // Solo hilos CON inbound: los solo-salientes se marcan procesados con
        // categoría NULL a propósito — sin este filtro entraban en loop
        // (reset → candidato → marca → reset…) y monopolizaban la cola,
        // dejando sin turno a las cotizaciones reales.
        {
          aiCategory: null,
          lastMessageAt: { gte: cutoff14 },
          messages: { some: { direction: "in" } },
        },
        {
          aiCategory: { notIn: [...COMMERCIAL_CATEGORIES] },
          lastMessageAt: { gte: cutoff3 },
        },
        {
          aiCategory: { notIn: [...COMMERCIAL_CATEGORIES] },
          lastMessageAt: { gte: cutoff30 },
          OR: [
            { subject: { contains: "cotiz", mode: "insensitive" } },
            { subject: { contains: "presupuesto", mode: "insensitive" } },
            { subject: { contains: "propuesta", mode: "insensitive" } },
            { subject: { contains: "licitac", mode: "insensitive" } },
          ],
        },
      ],
    },
    data: { aiClassifiedAt: null },
  });
  console.warn(`[radar] reset ${res.count}`, { emailAccountId });
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
 * mensaje), ventana de 14 días y lo más nuevo primero. Exige al menos un
 * mensaje entrante: los hilos solo-salientes no se pueden clasificar y solo
 * quemaban cupos de la cola (20/corrida).
 */
async function pickCandidateThreads(tenantId: string, emailAccountId: string) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "crm"."email_threads" t
    WHERE t."tenant_id" = ${tenantId} AND t."email_account_id" = ${emailAccountId}::uuid
      AND t."last_message_at" IS NOT NULL
      AND t."last_message_at" >= now() - interval '14 days'
      AND (t."ai_classified_at" IS NULL OR t."ai_classified_at" < t."last_message_at")
      AND EXISTS (
        SELECT 1 FROM "crm"."email_messages" m
        WHERE m."thread_id" = t."id" AND m."direction" = 'in'
      )
    ORDER BY t."last_message_at" DESC
    LIMIT ${MAX_PER_RUN}`;
}

/**
 * Promueve hilos YA clasificados como comerciales (cotización/licitación/
 * consulta) que nunca generaron RadarItem — típico cuando se clasificaron
 * antes de ampliar umbrales, o cuando el sync cortó tras marcar aiCategory
 * sin crear el item. No gasta IA: reusa la clasificación persistida.
 */
async function promoteClassifiedCommercialThreads(params: {
  tenantId: string;
  emailAccountId: string;
  userId: string;
  limit?: number;
}): Promise<CreatedRadarItem[]> {
  const limit = params.limit ?? 15;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      subject: string | null;
      lead_id: string | null;
      deal_id: string | null;
      account_id: string | null;
      ai_category: string;
      ai_intent: string;
      ai_summary: string | null;
    }[]
  >`
    SELECT t.id, t.subject, t.lead_id, t.deal_id, t.account_id,
           t.ai_category, t.ai_intent, t.ai_summary
    FROM crm.email_threads t
    WHERE t.tenant_id = ${params.tenantId}
      AND t.email_account_id = ${params.emailAccountId}::uuid
      AND t.lead_id IS NULL
      AND t.deal_id IS NULL
      AND t.ai_category IN ('cotizacion', 'licitacion', 'consulta_comercial')
      AND t.ai_intent IN ('alta', 'media')
      AND t.last_message_at >= now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM crm.radar_items r
        WHERE r.tenant_id = t.tenant_id
          AND r.dedupe_key = ('thread:' || t.id || ':lead')
      )
      AND EXISTS (
        SELECT 1 FROM crm.email_messages m
        WHERE m.thread_id = t.id AND m.direction = 'in'
      )
    ORDER BY t.last_message_at DESC
    LIMIT ${limit}
  `;

  const created: CreatedRadarItem[] = [];
  for (const row of rows) {
    const classification: RadarClassification = {
      categoria: row.ai_category as RadarClassification["categoria"],
      intencion: row.ai_intent as RadarClassification["intencion"],
      resumen: row.ai_summary ?? "",
      requiereRespuesta: true,
      senalesCompra: [],
      compromisos: [],
    };
    if (!isNewLeadCandidate(classification, row.lead_id, row.deal_id)) continue;

    const lastInbound = await prisma.crmEmailMessage.findFirst({
      where: { threadId: row.id, direction: "in" },
      orderBy: { receivedAt: "desc" },
      select: { fromEmail: true },
    });
    if (!lastInbound?.fromEmail) continue;

    const items = await generateThreadRadarItems({
      tenantId: params.tenantId,
      userId: params.userId,
      threadId: row.id,
      fromEmail: lastInbound.fromEmail,
      leadId: row.lead_id,
      dealId: row.deal_id,
      accountId: row.account_id,
      classification,
      draftReply: null,
    });
    for (const it of items) {
      created.push(it);
      if (it.kind === "nuevo_lead" || it.kind === "senal_compra") {
        await dispatchRadarAlert(it.id);
      }
    }
  }
  return created;
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
  if (isNewLeadCandidate(classification, thread.leadId, thread.dealId)) {
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
    await resetBurnedBacklog(params.tenantId, params.emailAccountId);
    await preMarkStaleThreads(params.tenantId, params.emailAccountId);

    // Primero: promover cotizaciones/consultas ya clasificadas sin RadarItem.
    const promoted = await promoteClassifiedCommercialThreads({
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      userId: params.userId,
    });
    items.push(...promoted);

    const candidates = await pickCandidateThreads(params.tenantId, params.emailAccountId);
    let classified = 0;
    for (const t of candidates) {
      if (Date.now() >= deadline) break;
      const created = await classifyOne(params.tenantId, params.userId, t.id);
      items.push(...created);
      classified++;
    }
    // Estado visible de la última corrida (para el card del hub). Best-effort.
    await writeSyncState(params.emailAccountId, {
      lastRadarRunAt: new Date().toISOString(),
      lastRadarClassified: classified,
    }).catch(() => {});
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
