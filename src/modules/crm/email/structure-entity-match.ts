/**
 * Matching de entidades CRM para el Copiloto de correos.
 * Evita duplicar cuenta / contacto / instalación / negocio al re-ejecutar el plan.
 */
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";
import {
  nameSimilarity,
  normalizeAccountName,
  significantTokens,
} from "@/lib/crm/account-duplicates";
import {
  isOwnCompanyAccount,
  type OwnTenant,
} from "@/modules/crm/email/own-tenant-company";

export type AccountMatchReason = "thread" | "rut" | "exact_name" | "similar_name";

export type StructureAccountMatch = {
  id: string;
  name: string;
  rut: string | null;
  score: number;
  reason: AccountMatchReason;
};

export type StructureInstallationMatch = {
  proposalName: string;
  id: string;
  name: string;
  address: string | null;
};

export type StructureContactMatch = {
  proposalLabel: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  reason: "email" | "name";
};

export type StructureDealMatch = {
  id: string;
  title: string;
  reason: "thread" | "similar_title";
  score: number;
};

export type StructureAgendaEventMatch = {
  id: string;
  title: string;
  label: string | null;
  startAt: string;
  status: string;
};

export type StructureEntityConflicts = {
  accounts: StructureAccountMatch[];
  installations: StructureInstallationMatch[];
  contacts: StructureContactMatch[];
  deal: StructureDealMatch | null;
  agendaEvents: StructureAgendaEventMatch[];
};

const ACCOUNT_SIMILARITY_THRESHOLD = 0.7;
/** Umbral alto: reutilizar sin ambigüedad (p. ej. Coexpan vs Coexpan Chile). */
export const ACCOUNT_AUTO_REUSE_THRESHOLD = 0.85;
const DEAL_TITLE_THRESHOLD = 0.85;

function reasonRank(r: AccountMatchReason): number {
  switch (r) {
    case "thread":
      return 0;
    case "rut":
      return 1;
    case "exact_name":
      return 2;
    case "similar_name":
      return 3;
  }
}

function contactLabel(c: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || "Contacto";
}

function normalizePersonName(first: string | null | undefined, last: string | null | undefined): string {
  return normalizeAccountName([first ?? "", last ?? ""].join(" "));
}

/** Busca cuentas candidatas a reutilizar para el plan. */
export async function findStructureAccountMatches(params: {
  tenantId: string;
  accountName: string;
  accountRut: string | null | undefined;
  threadAccountId: string | null | undefined;
  ownTenant: OwnTenant;
}): Promise<StructureAccountMatch[]> {
  const { tenantId, ownTenant } = params;
  const accountName = params.accountName.trim();
  if (!accountName) return [];

  const byId = new Map<string, StructureAccountMatch>();
  const upsert = (m: StructureAccountMatch) => {
    const prev = byId.get(m.id);
    if (!prev || reasonRank(m.reason) < reasonRank(prev.reason) || m.score > prev.score) {
      byId.set(m.id, m);
    }
  };

  if (params.threadAccountId) {
    const linked = await prisma.crmAccount.findFirst({
      where: { id: params.threadAccountId, tenantId },
      select: { id: true, name: true, rut: true, website: true },
    });
    if (linked && !isOwnCompanyAccount(linked, ownTenant)) {
      upsert({
        id: linked.id,
        name: linked.name,
        rut: linked.rut,
        score: 1,
        reason: "thread",
      });
    }
  }

  const rutKey = params.accountRut ? cleanRut(params.accountRut) : "";
  if (rutKey.length >= 8) {
    const rutBody = rutKey.slice(0, -1);
    const byRut = await prisma.crmAccount.findMany({
      where: {
        tenantId,
        rut: { not: null },
        OR: [
          { rut: { equals: params.accountRut!, mode: "insensitive" } },
          { rut: { contains: rutBody } },
        ],
      },
      select: { id: true, name: true, rut: true, website: true },
      take: 30,
    });
    for (const acc of byRut) {
      if (!acc.rut || cleanRut(acc.rut) !== rutKey) continue;
      if (isOwnCompanyAccount(acc, ownTenant)) continue;
      upsert({
        id: acc.id,
        name: acc.name,
        rut: acc.rut,
        score: 1,
        reason: "rut",
      });
    }
  }

  const exact = await prisma.crmAccount.findMany({
    where: { tenantId, name: { equals: accountName, mode: "insensitive" } },
    select: { id: true, name: true, rut: true, website: true },
    take: 10,
  });
  for (const acc of exact) {
    if (isOwnCompanyAccount(acc, ownTenant)) continue;
    upsert({
      id: acc.id,
      name: acc.name,
      rut: acc.rut,
      score: 1,
      reason: "exact_name",
    });
  }

  if (accountName.length >= 4) {
    const tokens = significantTokens(normalizeAccountName(accountName));
    const terms = tokens.length > 0 ? tokens.slice(0, 3) : [normalizeAccountName(accountName)].filter((t) => t.length >= 2);
    if (terms.length > 0) {
      const candidates = await prisma.crmAccount.findMany({
        where: {
          tenantId,
          OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
        },
        select: { id: true, name: true, rut: true, website: true },
        take: 50,
      });
      for (const acc of candidates) {
        if (isOwnCompanyAccount(acc, ownTenant)) continue;
        const score = nameSimilarity(accountName, acc.name);
        if (score < ACCOUNT_SIMILARITY_THRESHOLD) continue;
        upsert({
          id: acc.id,
          name: acc.name,
          rut: acc.rut,
          score,
          reason: score >= 0.999 ? "exact_name" : "similar_name",
        });
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) => reasonRank(a.reason) - reasonRank(b.reason) || b.score - a.score,
  );
}

/** Elige la cuenta a reutilizar automáticamente, o null si hay ambigüedad. */
export function pickAutoAccountMatch(
  matches: StructureAccountMatch[],
): StructureAccountMatch | null {
  if (matches.length === 0) return null;
  const top = matches[0];
  if (top.reason === "thread" || top.reason === "rut" || top.reason === "exact_name") {
    return top;
  }
  if (top.reason === "similar_name" && top.score >= ACCOUNT_AUTO_REUSE_THRESHOLD) {
    // Ambigüedad: dos candidatos similares con scores cercanos.
    if (matches.length >= 2 && matches[1].score >= ACCOUNT_AUTO_REUSE_THRESHOLD) {
      const gap = top.score - matches[1].score;
      if (gap < 0.05) return null;
    }
    return top;
  }
  return null;
}

export async function findStructureInstallationMatches(params: {
  tenantId: string;
  accountId: string;
  installationNames: string[];
}): Promise<StructureInstallationMatch[]> {
  const names = [...new Set(params.installationNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return [];

  const existing = await prisma.crmInstallation.findMany({
    where: {
      tenantId: params.tenantId,
      accountId: params.accountId,
      name: { in: names, mode: "insensitive" },
    },
    select: { id: true, name: true, address: true },
  });

  const out: StructureInstallationMatch[] = [];
  for (const proposalName of names) {
    const hit = existing.find(
      (e) => e.name.localeCompare(proposalName, "es", { sensitivity: "base" }) === 0,
    );
    if (hit) {
      out.push({
        proposalName,
        id: hit.id,
        name: hit.name,
        address: hit.address,
      });
    }
  }
  return out;
}

export async function findStructureContactMatches(params: {
  tenantId: string;
  accountId: string;
  contacts: Array<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }>;
}): Promise<StructureContactMatch[]> {
  const out: StructureContactMatch[] = [];
  const seen = new Set<string>();

  for (const c of params.contacts) {
    const label = contactLabel(c);
    if (c.email) {
      const byEmail = await prisma.crmContact.findFirst({
        where: {
          tenantId: params.tenantId,
          accountId: params.accountId,
          email: { equals: c.email, mode: "insensitive" },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (byEmail && !seen.has(byEmail.id)) {
        seen.add(byEmail.id);
        out.push({
          proposalLabel: label,
          id: byEmail.id,
          firstName: byEmail.firstName,
          lastName: byEmail.lastName,
          email: byEmail.email,
          reason: "email",
        });
        continue;
      }
    }

    const norm = normalizePersonName(c.firstName, c.lastName);
    if (norm.length < 3) continue;

    const siblings = await prisma.crmContact.findMany({
      where: { tenantId: params.tenantId, accountId: params.accountId },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 100,
    });
    const byName = siblings.find(
      (s) => normalizePersonName(s.firstName, s.lastName) === norm,
    );
    if (byName && !seen.has(byName.id)) {
      seen.add(byName.id);
      out.push({
        proposalLabel: label,
        id: byName.id,
        firstName: byName.firstName,
        lastName: byName.lastName,
        email: byName.email,
        reason: "name",
      });
    }
  }

  return out;
}

export async function findStructureDealMatch(params: {
  tenantId: string;
  accountId: string;
  threadDealId: string | null | undefined;
  dealTitle: string | null | undefined;
}): Promise<StructureDealMatch | null> {
  if (params.threadDealId) {
    const linked = await prisma.crmDeal.findFirst({
      where: {
        id: params.threadDealId,
        tenantId: params.tenantId,
        accountId: params.accountId,
      },
      select: { id: true, title: true },
    });
    if (linked) {
      return { id: linked.id, title: linked.title, reason: "thread", score: 1 };
    }
  }

  const title = params.dealTitle?.trim();
  if (!title || title.length < 4) return null;

  const openDeals = await prisma.crmDeal.findMany({
    where: {
      tenantId: params.tenantId,
      accountId: params.accountId,
      status: "open",
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  let best: StructureDealMatch | null = null;
  for (const d of openDeals) {
    const score = nameSimilarity(title, d.title);
    if (score < DEAL_TITLE_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { id: d.id, title: d.title, reason: "similar_title", score };
    }
  }
  return best;
}

export async function detectStructureConflicts(params: {
  tenantId: string;
  accountName: string;
  accountRut: string | null | undefined;
  threadAccountId: string | null | undefined;
  threadDealId: string | null | undefined;
  dealTitle: string | null | undefined;
  installationNames: string[];
  contacts: Array<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }>;
  ownTenant: OwnTenant;
  /** Cuenta forzada por el usuario (si eligió una). */
  useExistingAccountId?: string | null;
  includeContact: boolean;
  includeDeal: boolean;
  includeInstallations: boolean;
}): Promise<StructureEntityConflicts> {
  let accounts = await findStructureAccountMatches({
    tenantId: params.tenantId,
    accountName: params.accountName,
    accountRut: params.accountRut,
    threadAccountId: params.threadAccountId,
    ownTenant: params.ownTenant,
  });

  if (params.useExistingAccountId) {
    const forced = accounts.find((a) => a.id === params.useExistingAccountId);
    if (forced) {
      accounts = [forced];
    } else {
      const row = await prisma.crmAccount.findFirst({
        where: { id: params.useExistingAccountId, tenantId: params.tenantId },
        select: { id: true, name: true, rut: true, website: true },
      });
      if (row && !isOwnCompanyAccount(row, params.ownTenant)) {
        accounts = [
          {
            id: row.id,
            name: row.name,
            rut: row.rut,
            score: 1,
            reason: "thread",
          },
        ];
      }
    }
  }

  const accountId = accounts[0]?.id;
  if (!accountId) {
    return { accounts, installations: [], contacts: [], deal: null, agendaEvents: [] };
  }

  const [installations, contacts, deal] = await Promise.all([
    params.includeInstallations
      ? findStructureInstallationMatches({
          tenantId: params.tenantId,
          accountId,
          installationNames: params.installationNames,
        })
      : Promise.resolve([]),
    params.includeContact
      ? findStructureContactMatches({
          tenantId: params.tenantId,
          accountId,
          contacts: params.contacts,
        })
      : Promise.resolve([]),
    params.includeDeal
      ? findStructureDealMatch({
          tenantId: params.tenantId,
          accountId,
          threadDealId: params.threadDealId,
          dealTitle: params.dealTitle,
        })
      : Promise.resolve(null),
  ]);

  const agendaDealId = deal?.id ?? params.threadDealId ?? null;
  const agendaEvents = agendaDealId
    ? await findStructureAgendaEvents({
        tenantId: params.tenantId,
        dealId: agendaDealId,
      })
    : [];

  return { accounts, installations, contacts, deal, agendaEvents };
}

async function findStructureAgendaEvents(params: {
  tenantId: string;
  dealId: string;
}): Promise<StructureAgendaEventMatch[]> {
  const rows = await prisma.agendaVisita.findMany({
    where: {
      tenantId: params.tenantId,
      dealId: params.dealId,
      status: { not: "cancelada" },
    },
    select: {
      id: true,
      title: true,
      label: true,
      startAt: true,
      status: true,
    },
    orderBy: { startAt: "asc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    label: r.label,
    startAt: r.startAt.toISOString(),
    status: r.status,
  }));
}

export function conflictsNeedConfirmation(conflicts: StructureEntityConflicts): boolean {
  if (conflicts.accounts.length > 0) return true;
  if (conflicts.installations.length > 0) return true;
  if (conflicts.contacts.length > 0) return true;
  if (conflicts.deal) return true;
  if (conflicts.agendaEvents.length > 0) return true;
  return false;
}
