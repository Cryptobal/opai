/**
 * Vinculación CRM de tareas: cuenta → negocio → cotización / instalación.
 * Validación scoped por tenant + cascada al limpiar padres.
 */

import { prisma } from "@/lib/prisma";

export type TareaCrmLinks = {
  accountId: string | null;
  dealId: string | null;
  quoteId: string | null;
  installationId: string | null;
};

export const EMPTY_CRM_LINKS: TareaCrmLinks = {
  accountId: null,
  dealId: null,
  quoteId: null,
  installationId: null,
};

export type CrmLinksPatch = {
  accountId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  installationId?: string | null;
};

function asOptionalId(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return undefined;
}

/** Extrae del body solo los campos de vinculación presentes. */
export function parseCrmLinksPatch(body: Record<string, unknown>): CrmLinksPatch | { error: string } {
  const patch: CrmLinksPatch = {};
  for (const key of ["accountId", "dealId", "quoteId", "installationId"] as const) {
    if (body[key] === undefined) continue;
    const v = asOptionalId(body[key]);
    if (v === undefined && body[key] !== null && body[key] !== "") {
      return { error: `Vinculación CRM inválida (${key})` };
    }
    patch[key] = v ?? null;
  }
  return patch;
}

export function hasCrmLinksPatch(patch: CrmLinksPatch): boolean {
  return (
    patch.accountId !== undefined ||
    patch.dealId !== undefined ||
    patch.quoteId !== undefined ||
    patch.installationId !== undefined
  );
}

/**
 * Aplica un patch de vinculación sobre el estado actual y valida pertenencia
 * al tenant + consistencia padre→hijo. Al limpiar un padre, limpia hijos.
 */
export async function resolveCrmLinks(
  tenantId: string,
  current: TareaCrmLinks,
  patch: CrmLinksPatch,
): Promise<{ ok: true; value: TareaCrmLinks } | { ok: false; error: string }> {
  let next: TareaCrmLinks = { ...current };

  if (patch.accountId !== undefined) {
    const prevAccount = current.accountId;
    next.accountId = patch.accountId;
    if (patch.accountId === null) {
      next.dealId = null;
      next.quoteId = null;
      next.installationId = null;
    } else if (patch.accountId !== prevAccount) {
      // Cuenta distinta: limpiar hijos no reenviados en el mismo patch.
      if (patch.dealId === undefined) next.dealId = null;
      if (patch.quoteId === undefined) next.quoteId = null;
      if (patch.installationId === undefined) next.installationId = null;
    }
  }

  if (patch.dealId !== undefined) {
    const prevDeal = current.dealId;
    next.dealId = patch.dealId;
    if (patch.dealId === null || patch.dealId !== prevDeal) {
      if (patch.quoteId === undefined) next.quoteId = null;
    }
  }

  if (patch.quoteId !== undefined) {
    next.quoteId = patch.quoteId;
  }

  if (patch.installationId !== undefined) {
    next.installationId = patch.installationId;
  }

  // Validar / heredar desde entidades concretas (orden: deal → quote → installation → account).
  if (next.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: next.dealId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) return { ok: false, error: "Negocio inválido" };
    if (next.accountId && deal.accountId !== next.accountId) {
      return { ok: false, error: "El negocio no pertenece a la cuenta seleccionada" };
    }
    next.accountId = deal.accountId;
  }

  if (next.quoteId) {
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: next.quoteId, tenantId },
      select: { id: true, accountId: true, dealId: true, installationId: true },
    });
    if (!quote) return { ok: false, error: "Cotización inválida" };
    if (next.dealId && quote.dealId && quote.dealId !== next.dealId) {
      return { ok: false, error: "La cotización no pertenece al negocio seleccionado" };
    }
    if (next.accountId && quote.accountId && quote.accountId !== next.accountId) {
      return { ok: false, error: "La cotización no pertenece a la cuenta seleccionada" };
    }
    if (quote.dealId) next.dealId = quote.dealId;
    if (quote.accountId) next.accountId = quote.accountId;
    if (quote.installationId && next.installationId == null && patch.installationId === undefined) {
      next.installationId = quote.installationId;
    }
  }

  if (next.installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: next.installationId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!inst) return { ok: false, error: "Instalación inválida" };
    if (next.accountId && inst.accountId && inst.accountId !== next.accountId) {
      return { ok: false, error: "La instalación no pertenece a la cuenta seleccionada" };
    }
    if (inst.accountId) next.accountId = inst.accountId;
  }

  if (next.accountId) {
    const account = await prisma.crmAccount.findFirst({
      where: { id: next.accountId, tenantId },
      select: { id: true },
    });
    if (!account) return { ok: false, error: "Cuenta inválida" };
  }

  // Si quedó deal sin account (dato legacy), no forzar — ya heredamos arriba.
  // Cotización sin deal/account válidos ya se filtró.

  return { ok: true, value: next };
}
