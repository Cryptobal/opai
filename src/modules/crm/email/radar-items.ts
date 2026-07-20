import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { RadarClassification } from "./radar-types";
import { shortHash } from "./radar-util";

export type CreatedRadarItem = { id: string; kind: string };

/** Upsert idempotente por (tenant, dedupeKey). Devuelve el item si se creó. */
export async function upsertRadarItem(params: {
  tenantId: string;
  userId: string;
  kind: string;
  title: string;
  summary?: string | null;
  threadId?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  dueAt?: Date | null;
  dedupeKey: string;
  payload?: Record<string, unknown> | null;
}): Promise<CreatedRadarItem | null> {
  const existing = await prisma.crmRadarItem.findUnique({
    where: { tenantId_dedupeKey: { tenantId: params.tenantId, dedupeKey: params.dedupeKey } },
    select: { id: true },
  });
  if (existing) return null; // ya existe: no duplicar ni re-alertar
  try {
    const item = await prisma.crmRadarItem.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        kind: params.kind,
        title: params.title,
        summary: params.summary ?? null,
        threadId: params.threadId ?? null,
        dealId: params.dealId ?? null,
        accountId: params.accountId ?? null,
        dueAt: params.dueAt ?? null,
        dedupeKey: params.dedupeKey,
        payload: (params.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    return { id: item.id, kind: params.kind };
  } catch {
    return null; // carrera: otra corrida ganó el dedupeKey único
  }
}

/**
 * Genera los RadarItems derivados de la clasificación de un hilo:
 * `nuevo_lead` (con borrador) · `senal_compra` · `compromiso` (dueAt).
 * Los items `compromiso` los procesa el cron de B7 (vencimiento/follow-up).
 */
export async function generateThreadRadarItems(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  fromEmail: string;
  leadId: string | null;
  dealId: string | null;
  accountId: string | null;
  classification: RadarClassification;
  draftReply: string | null;
}): Promise<CreatedRadarItem[]> {
  const c = params.classification;
  const created: CreatedRadarItem[] = [];

  if (c.intencion === "alta" && !params.leadId && !params.dealId) {
    const r = await upsertRadarItem({
      tenantId: params.tenantId,
      userId: params.userId,
      kind: "nuevo_lead",
      title: `Posible lead — ${params.fromEmail}`,
      summary: c.resumen,
      threadId: params.threadId,
      accountId: params.accountId,
      dedupeKey: `thread:${params.threadId}:lead`,
      payload: { draftReply: params.draftReply, senales: c.senalesCompra, categoria: c.categoria },
    });
    if (r) created.push(r);
  }

  if (c.senalesCompra.length > 0 && (params.dealId || params.accountId)) {
    const r = await upsertRadarItem({
      tenantId: params.tenantId,
      userId: params.userId,
      kind: "senal_compra",
      title: "Señal de compra",
      summary: c.senalesCompra.join(" · ").slice(0, 140),
      threadId: params.threadId,
      dealId: params.dealId,
      accountId: params.accountId,
      dedupeKey: `thread:${params.threadId}:senal:${shortHash(c.senalesCompra.join("|"))}`,
      payload: { senales: c.senalesCompra },
    });
    if (r) created.push(r);
  }

  if ((params.dealId || params.accountId) && c.compromisos.length > 0) {
    for (const cmp of c.compromisos) {
      const r = await upsertRadarItem({
        tenantId: params.tenantId,
        userId: params.userId,
        kind: "compromiso",
        title: `⏰ ${cmp.quien === "nosotros" ? "Nosotros" : "Cliente"}: ${cmp.que} — ${cmp.fechaISO}`,
        threadId: params.threadId,
        dealId: params.dealId,
        accountId: params.accountId,
        dueAt: new Date(`${cmp.fechaISO}T12:00:00.000Z`),
        dedupeKey: `thread:${params.threadId}:comp:${shortHash(`${cmp.que}|${cmp.fechaISO}`)}`,
        payload: { compromiso: cmp },
      });
      if (r) created.push(r);
    }
  }

  return created;
}
