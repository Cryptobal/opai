/**
 * Resolutor único de contexto CRM de un hilo (Copiloto v4).
 * Usado por el chat y cualquier consumidor que necesite el bloque CRM.
 */
import { prisma } from "@/lib/prisma";
import { resolveThreadLinks } from "./email-thread-links";

export type ThreadCrmContext = {
  account: {
    id: string;
    name: string;
    rut: string | null;
    openDealsCount: number;
  } | null;
  deal: {
    id: string;
    title: string;
    stageName: string | null;
    amount: string;
    status: string;
    daysSinceActivity: number | null;
  } | null;
  quote: { id: string; code: string; status: string; version: string | null } | null;
  installation: { id: string; name: string; commune: string | null } | null;
  links: Array<{ entityType: string; label: string; status: string | null }>;
  openTasks: Array<{ id: string; title: string; dueAt: string | null }>;
};

export async function resolveThreadCrmContext(params: {
  tenantId: string;
  threadId: string;
}): Promise<ThreadCrmContext> {
  const { tenantId, threadId } = params;
  const empty: ThreadCrmContext = {
    account: null,
    deal: null,
    quote: null,
    installation: null,
    links: [],
    openTasks: [],
  };

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: { accountId: true, dealId: true, contactId: true },
  });
  if (!thread) return empty;

  const [account, deal, links, tasks] = await Promise.all([
    thread.accountId
      ? prisma.crmAccount.findFirst({
          where: { id: thread.accountId, tenantId },
          select: {
            id: true,
            name: true,
            rut: true,
            _count: { select: { deals: { where: { status: "open" } } } },
          },
        })
      : null,
    thread.dealId
      ? prisma.crmDeal.findFirst({
          where: { id: thread.dealId, tenantId },
          select: {
            id: true,
            title: true,
            amount: true,
            status: true,
            updatedAt: true,
            stage: { select: { name: true } },
          },
        })
      : null,
    resolveThreadLinks({ tenantId, threadId }).catch(() => []),
    prisma.crmTask
      .findMany({
        where: {
          tenantId,
          status: { not: "done" },
          OR: [
            { emailThreadId: threadId },
            ...(thread.dealId ? [{ dealId: thread.dealId }] : []),
          ],
        },
        select: { id: true, title: true, dueAt: true },
        take: 8,
        orderBy: { dueAt: "asc" },
      })
      .catch(() => []),
  ]);

  const quoteLink = links.find((l) => l.entityType === "quote" && !l.orphan);
  const instLink = links.find((l) => l.entityType === "installation" && !l.orphan);

  let quote: ThreadCrmContext["quote"] = null;
  if (quoteLink) {
    const q = await prisma.cpqQuote.findFirst({
      where: { id: quoteLink.entityId, tenantId },
      select: { id: true, code: true, status: true, name: true },
    });
    if (q) {
      quote = {
        id: q.id,
        code: q.code,
        status: q.status,
        version: q.name,
      };
    }
  }

  let installation: ThreadCrmContext["installation"] = null;
  if (instLink) {
    const i = await prisma.crmInstallation.findFirst({
      where: { id: instLink.entityId, tenantId },
      select: { id: true, name: true, commune: true },
    });
    if (i) installation = i;
  }

  const daysSinceActivity = deal
    ? Math.max(
        0,
        Math.floor((Date.now() - deal.updatedAt.getTime()) / 86_400_000),
      )
    : null;

  return {
    account: account
      ? {
          id: account.id,
          name: account.name,
          rut: account.rut,
          openDealsCount: account._count.deals,
        }
      : null,
    deal: deal
      ? {
          id: deal.id,
          title: deal.title,
          stageName: deal.stage?.name ?? null,
          amount: String(deal.amount),
          status: deal.status,
          daysSinceActivity,
        }
      : null,
    quote,
    installation,
    links: links
      .filter((l) => !l.orphan)
      .map((l) => ({
        entityType: l.entityType,
        label: l.label,
        status: l.status,
      })),
    openTasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
    })),
  };
}

/** Formatea el bloque CRM para el system prompt del chat (dato confiable). */
export function formatThreadCrmContextBlock(ctx: ThreadCrmContext): string {
  const lines: string[] = ["CONTEXTO CRM DEL HILO (dato confiable del tenant):"];
  if (ctx.account) {
    lines.push(
      `Cuenta: ${ctx.account.name}${ctx.account.rut ? ` · RUT ${ctx.account.rut}` : ""} · ${ctx.account.openDealsCount} negocio(s) abierto(s) · accountId=${ctx.account.id}`,
    );
  } else {
    lines.push("Cuenta: (sin asociar)");
  }
  if (ctx.deal) {
    lines.push(
      `Negocio: ${ctx.deal.title} · etapa=${ctx.deal.stageName ?? "?"} · monto=${ctx.deal.amount} · status=${ctx.deal.status}${
        ctx.deal.daysSinceActivity != null
          ? ` · ${ctx.deal.daysSinceActivity}d sin actividad`
          : ""
      } · dealId=${ctx.deal.id}`,
    );
  }
  if (ctx.quote) {
    lines.push(
      `Cotización: ${ctx.quote.code} · estado=${ctx.quote.status}${
        ctx.quote.version ? ` · ${ctx.quote.version}` : ""
      } · quoteId=${ctx.quote.id}`,
    );
  }
  if (ctx.installation) {
    lines.push(
      `Instalación: ${ctx.installation.name}${
        ctx.installation.commune ? ` · ${ctx.installation.commune}` : ""
      } · installationId=${ctx.installation.id}`,
    );
  }
  if (ctx.links.length > 0) {
    lines.push(
      `Vínculos: ${ctx.links.map((l) => `${l.entityType}:${l.label}`).join("; ")}`,
    );
  }
  if (ctx.openTasks.length > 0) {
    lines.push(
      `Tareas abiertas: ${ctx.openTasks.map((t) => t.title).join("; ")}`,
    );
  }
  return lines.join("\n");
}
