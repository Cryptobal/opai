/**
 * Resolutores de conversaciones por entidad (Copiloto v2 · bloque 5).
 * Cada tipo declara: gate de permiso, hilos directos, hilos heredados.
 * La unión se materializa en UNA consulta de hilos con OR sobre ids.
 */
import type { PrismaClient } from "@prisma/client";
import { canView, canViewInstallations, type RolePermissions } from "@/lib/permissions";

export const CONVERSATION_ENTITY_TYPES = [
  "account",
  "contact",
  "deal",
  "installation",
  "quote",
] as const;
export type ConversationEntityType = (typeof CONVERSATION_ENTITY_TYPES)[number];

export function isConversationEntityType(v: string): v is ConversationEntityType {
  return (CONVERSATION_ENTITY_TYPES as readonly string[]).includes(v);
}

export type ThreadOrigin = "direct" | "inherited";

export type ConversationThreadDTO = {
  id: string;
  subject: string;
  fromEmail: string | null;
  lastMessageAt: string | null;
  origin: ThreadOrigin;
  originLabel: string;
};

type ResolveCtx = {
  prisma: PrismaClient;
  tenantId: string;
  perms: RolePermissions;
  entityId: string;
  cascade: boolean;
};

type ResolveResult =
  | { ok: true; threads: ConversationThreadDTO[] }
  | { ok: false; status: 403 | 404; error: string };

type IdBucket = { id: string; origin: ThreadOrigin; originLabel: string };

async function loadThreads(
  prisma: PrismaClient,
  tenantId: string,
  buckets: IdBucket[],
): Promise<ConversationThreadDTO[]> {
  if (buckets.length === 0) return [];
  // Prefer direct over inherited when the same id appears in both.
  const byId = new Map<string, IdBucket>();
  for (const b of buckets) {
    const prev = byId.get(b.id);
    if (!prev || (prev.origin === "inherited" && b.origin === "direct")) {
      byId.set(b.id, b);
    }
  }
  const ids = Array.from(byId.keys());
  const rows = await prisma.crmEmailThread.findMany({
    where: { tenantId, id: { in: ids } },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      messages: {
        orderBy: { sentAt: "desc" as const },
        take: 1,
        select: { fromEmail: true },
      },
    },
  });
  return rows.map((t) => {
    const meta = byId.get(t.id)!;
    return {
      id: t.id,
      subject: t.subject,
      fromEmail: t.messages[0]?.fromEmail ?? null,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      origin: meta.origin,
      originLabel: meta.originLabel,
    };
  });
}

async function resolveAccount(ctx: ResolveCtx): Promise<ResolveResult> {
  if (!canView(ctx.perms, "crm", "accounts")) {
    return { ok: false, status: 403, error: "Sin acceso a la cuenta" };
  }
  const account = await ctx.prisma.crmAccount.findFirst({
    where: { id: ctx.entityId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!account) return { ok: false, status: 404, error: "Cuenta no encontrada" };

  const rows = await ctx.prisma.crmEmailThread.findMany({
    where: { tenantId: ctx.tenantId, accountId: ctx.entityId, sharedWithAccount: true },
    select: { id: true },
    take: 50,
    orderBy: { lastMessageAt: "desc" },
  });
  const buckets = rows.map((r) => ({
    id: r.id,
    origin: "direct" as const,
    originLabel: "De esta cuenta",
  }));
  return { ok: true, threads: await loadThreads(ctx.prisma, ctx.tenantId, buckets) };
}

async function resolveContact(ctx: ResolveCtx): Promise<ResolveResult> {
  if (!canView(ctx.perms, "crm", "contacts")) {
    return { ok: false, status: 403, error: "Sin acceso al contacto" };
  }
  const contact = await ctx.prisma.crmContact.findFirst({
    where: { id: ctx.entityId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true },
  });
  if (!contact) return { ok: false, status: 404, error: "Contacto no encontrado" };

  const [byScalar, byBridge] = await Promise.all([
    ctx.prisma.crmEmailThread.findMany({
      where: {
        tenantId: ctx.tenantId,
        contactId: ctx.entityId,
        sharedWithAccount: true,
      },
      select: { id: true },
      take: 50,
    }),
    ctx.prisma.crmEmailThreadContact.findMany({
      where: { tenantId: ctx.tenantId, contactId: ctx.entityId },
      select: { threadId: true },
      take: 50,
    }),
  ]);

  const buckets: IdBucket[] = [];
  const seen = new Set<string>();
  for (const r of byScalar) {
    seen.add(r.id);
    buckets.push({ id: r.id, origin: "direct", originLabel: "De este contacto" });
  }
  if (byBridge.length > 0) {
    const bridgeIds = byBridge.map((b) => b.threadId).filter((id) => !seen.has(id));
    if (bridgeIds.length > 0) {
      const visible = await ctx.prisma.crmEmailThread.findMany({
        where: {
          tenantId: ctx.tenantId,
          id: { in: bridgeIds },
          sharedWithAccount: true,
        },
        select: { id: true },
      });
      for (const r of visible) {
        seen.add(r.id);
        buckets.push({ id: r.id, origin: "direct", originLabel: "De este contacto" });
      }
    }
  }

  if (ctx.cascade && contact.accountId) {
    const inherited = await ctx.prisma.crmEmailThread.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: contact.accountId,
        sharedWithAccount: true,
        id: { notIn: Array.from(seen) },
      },
      select: { id: true },
      take: 50,
    });
    for (const r of inherited) {
      buckets.push({ id: r.id, origin: "inherited", originLabel: "De la cuenta" });
    }
  }

  return { ok: true, threads: await loadThreads(ctx.prisma, ctx.tenantId, buckets) };
}

async function resolveDeal(ctx: ResolveCtx): Promise<ResolveResult> {
  if (!canView(ctx.perms, "crm", "deals")) {
    return { ok: false, status: 403, error: "Sin acceso al negocio" };
  }
  const deal = await ctx.prisma.crmDeal.findFirst({
    where: { id: ctx.entityId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true },
  });
  if (!deal) return { ok: false, status: 404, error: "Negocio no encontrado" };

  const quoteLinks = await ctx.prisma.crmDealQuote.findMany({
    where: { dealId: ctx.entityId },
    select: { quoteId: true },
    take: 50,
  });
  const quoteIds = quoteLinks.map((q) => q.quoteId);

  const [byDeal, byQuoteLinks] = await Promise.all([
    ctx.prisma.crmEmailThread.findMany({
      where: { tenantId: ctx.tenantId, dealId: ctx.entityId, sharedWithAccount: true },
      select: { id: true },
      take: 50,
    }),
    quoteIds.length > 0
      ? ctx.prisma.crmEmailThreadLink.findMany({
          where: {
            tenantId: ctx.tenantId,
            entityType: "quote",
            entityId: { in: quoteIds },
            visibleOnEntity: true,
          },
          select: { threadId: true },
        })
      : Promise.resolve([] as { threadId: string }[]),
  ]);

  const buckets: IdBucket[] = [];
  const seen = new Set<string>();
  for (const r of byDeal) {
    seen.add(r.id);
    buckets.push({ id: r.id, origin: "direct", originLabel: "De este negocio" });
  }
  for (const r of byQuoteLinks) {
    if (seen.has(r.threadId)) continue;
    seen.add(r.threadId);
    buckets.push({ id: r.threadId, origin: "direct", originLabel: "Cotización del negocio" });
  }

  if (ctx.cascade && deal.accountId) {
    const inherited = await ctx.prisma.crmEmailThread.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: deal.accountId,
        sharedWithAccount: true,
        id: { notIn: Array.from(seen) },
      },
      select: { id: true },
      take: 50,
    });
    for (const r of inherited) {
      buckets.push({ id: r.id, origin: "inherited", originLabel: "De la cuenta" });
    }
  }

  return { ok: true, threads: await loadThreads(ctx.prisma, ctx.tenantId, buckets) };
}

async function resolveInstallation(ctx: ResolveCtx): Promise<ResolveResult> {
  if (!canViewInstallations(ctx.perms)) {
    return { ok: false, status: 403, error: "Sin acceso a la instalación" };
  }
  const installation = await ctx.prisma.crmInstallation.findFirst({
    where: { id: ctx.entityId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true },
  });
  if (!installation) return { ok: false, status: 404, error: "Instalación no encontrada" };

  const links = await ctx.prisma.crmEmailThreadLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "installation",
      entityId: ctx.entityId,
      visibleOnEntity: true,
    },
    select: { threadId: true },
  });
  const buckets: IdBucket[] = links.map((l) => ({
    id: l.threadId,
    origin: "direct" as const,
    originLabel: "De esta instalación",
  }));
  const seen = new Set(buckets.map((b) => b.id));

  if (ctx.cascade && installation.accountId) {
    const inherited = await ctx.prisma.crmEmailThread.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: installation.accountId,
        sharedWithAccount: true,
        id: { notIn: Array.from(seen) },
      },
      select: { id: true },
      take: 50,
    });
    for (const r of inherited) {
      buckets.push({ id: r.id, origin: "inherited", originLabel: "De la cuenta" });
    }
  }

  return { ok: true, threads: await loadThreads(ctx.prisma, ctx.tenantId, buckets) };
}

async function resolveQuote(ctx: ResolveCtx): Promise<ResolveResult> {
  if (!canView(ctx.perms, "crm", "quotes")) {
    return { ok: false, status: 403, error: "Sin acceso a la cotización" };
  }
  const quote = await ctx.prisma.cpqQuote.findFirst({
    where: { id: ctx.entityId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true, dealId: true },
  });
  if (!quote) return { ok: false, status: 404, error: "Cotización no encontrada" };

  const links = await ctx.prisma.crmEmailThreadLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: ctx.entityId,
      visibleOnEntity: true,
    },
    select: { threadId: true },
  });
  const buckets: IdBucket[] = links.map((l) => ({
    id: l.threadId,
    origin: "direct" as const,
    originLabel: "De esta cotización",
  }));
  const seen = new Set(buckets.map((b) => b.id));

  if (ctx.cascade) {
    if (quote.dealId) {
      const fromDeal = await ctx.prisma.crmEmailThread.findMany({
        where: {
          tenantId: ctx.tenantId,
          dealId: quote.dealId,
          sharedWithAccount: true,
          id: { notIn: Array.from(seen) },
        },
        select: { id: true },
        take: 50,
      });
      for (const r of fromDeal) {
        seen.add(r.id);
        buckets.push({ id: r.id, origin: "inherited", originLabel: "Del negocio" });
      }
    } else if (quote.accountId) {
      const fromAccount = await ctx.prisma.crmEmailThread.findMany({
        where: {
          tenantId: ctx.tenantId,
          accountId: quote.accountId,
          sharedWithAccount: true,
          id: { notIn: Array.from(seen) },
        },
        select: { id: true },
        take: 50,
      });
      for (const r of fromAccount) {
        buckets.push({ id: r.id, origin: "inherited", originLabel: "De la cuenta" });
      }
    }
  }

  return { ok: true, threads: await loadThreads(ctx.prisma, ctx.tenantId, buckets) };
}

const RESOLVERS: Record<
  ConversationEntityType,
  (ctx: ResolveCtx) => Promise<ResolveResult>
> = {
  account: resolveAccount,
  contact: resolveContact,
  deal: resolveDeal,
  installation: resolveInstallation,
  quote: resolveQuote,
};

export async function resolveEntityConversations(
  ctx: ResolveCtx & { entityType: ConversationEntityType },
): Promise<ResolveResult> {
  return RESOLVERS[ctx.entityType](ctx);
}

/** Traduce parámetros legacy accountId/dealId/installationId → entityType/entityId. */
export function legacyParamsToEntity(params: {
  accountId: string | null;
  dealId: string | null;
  installationId: string | null;
  entityType: string | null;
  entityId: string | null;
}): { entityType: ConversationEntityType; entityId: string } | null {
  if (params.entityType && params.entityId && isConversationEntityType(params.entityType)) {
    return { entityType: params.entityType, entityId: params.entityId };
  }
  if (params.accountId) return { entityType: "account", entityId: params.accountId };
  if (params.dealId) return { entityType: "deal", entityId: params.dealId };
  if (params.installationId) {
    return { entityType: "installation", entityId: params.installationId };
  }
  return null;
}
