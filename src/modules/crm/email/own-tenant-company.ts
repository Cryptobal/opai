/**
 * Identifica la "cuenta propia" del tenant (empresa que opera OPAI).
 * Ningún correo de cliente debe auto-asociarse ni sugerirse a esa cuenta.
 */
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  buildTenantDomains,
  domainOf as domainOfHeader,
  isPublicMailDomain,
} from "@/modules/crm/email/correos-list-helpers";

export type OwnTenant = {
  domains: Set<string>;
  names: Set<string>;
};

export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const host = raw.split("/")[0]?.split("?")[0] ?? "";
  if (!host || !host.includes(".")) return null;
  return isPublicMailDomain(host) ? null : host;
}

export async function loadOwnTenant(tenantId: string): Promise<OwnTenant> {
  const [company, tenant, mailboxes] = await Promise.all([
    getTenantCompanyConfig(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.crmEmailAccount.findMany({
      where: { tenantId, provider: "gmail", status: "active" },
      select: { email: true },
      take: 20,
    }),
  ]);

  const domains = buildTenantDomains(company, mailboxes[0]?.email ?? null);
  for (const m of mailboxes) {
    const d = domainOfHeader(m.email);
    if (d && !isPublicMailDomain(d)) domains.add(d);
  }
  const web = websiteDomain(company.website);
  if (web) domains.add(web);

  const names = new Set<string>();
  for (const n of [
    tenant?.name,
    company.companyName,
    company.commercialName,
    company.razonSocial,
  ]) {
    if (n && n.trim() && n !== "Mi Empresa" && n !== "Empresa Sin Configurar") {
      names.add(normalizeCompanyName(n));
    }
  }
  return { domains, names };
}

export function isOwnCompanyAccount(
  account: { name: string; website?: string | null },
  own: OwnTenant,
): boolean {
  if (own.names.has(normalizeCompanyName(account.name))) return true;
  const web = websiteDomain(account.website);
  return Boolean(web && own.domains.has(web));
}

/** IDs de CrmAccount que representan a la propia empresa del tenant. */
export async function findOwnCompanyAccountIds(tenantId: string): Promise<string[]> {
  const own = await loadOwnTenant(tenantId);
  if (own.names.size === 0 && own.domains.size === 0) return [];

  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, website: true },
    take: 500,
  });
  return accounts.filter((a) => isOwnCompanyAccount(a, own)).map((a) => a.id);
}
