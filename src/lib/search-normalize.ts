/**
 * Helpers de búsqueda tolerante a tildes/diacríticos.
 *
 * El backend usa la función PostgreSQL `f_unaccent` (definida en la migración
 * 20260916000000_add_search_unaccent_normalization) para comparar campos vs
 * query normalizando acentos. El frontend usa `normalizeForSearch` para que
 * `fuzzyScore` y `highlightMatch` se comporten de forma consistente.
 *
 * Sin esto, "Muñoz" no matchea "munoz" porque Prisma `mode: "insensitive"`
 * solo es case-insensitive (no accent-insensitive) en PostgreSQL.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Re-exportado desde el módulo puro (sin Prisma) para que los Server Components
// también puedan importar desde este archivo sin romper nada.
export { normalizeForSearch } from "@/lib/search-normalize-pure";

type IdRow = { id: string };

/**
 * Ejecuta una query SQL que devuelve IDs y los retorna como string[].
 */
async function fetchIds(sql: Prisma.Sql): Promise<string[]> {
  const rows = await prisma.$queryRaw<IdRow[]>(sql);
  return rows.map((r) => r.id);
}

// ── Búsquedas tipadas por entidad ──
// Cada función devuelve los IDs (limit aplicado) de los registros que matchean
// la query normalizada en cualquiera de los campos relevantes. El endpoint
// luego hace findMany({ where: { id: { in: ids } } }) para conservar selects
// y relaciones de Prisma.

export async function findCrmContactIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
  /** Si true, restringe a contactos de cuentas con installations activas (supervisor hub). */
  onlySupervisorScope?: boolean;
}): Promise<string[]> {
  const { tenantId, query, limit, onlySupervisorScope } = params;
  const supervisorFilter = onlySupervisorScope
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM crm.installations i
        WHERE i.account_id = c.account_id AND i.status = 'active'
      )`
    : Prisma.empty;
  return fetchIds(Prisma.sql`
    SELECT c.id
    FROM crm.contacts c
    WHERE c.tenant_id = ${tenantId}
      ${supervisorFilter}
      AND (
        LOWER(public.f_unaccent(c.first_name)) LIKE LOWER(public.f_unaccent(${"%" + query + "%"}))
        OR LOWER(public.f_unaccent(c.last_name)) LIKE LOWER(public.f_unaccent(${"%" + query + "%"}))
        OR LOWER(public.f_unaccent(c.first_name || ' ' || c.last_name)) LIKE LOWER(public.f_unaccent(${"%" + query + "%"}))
        OR LOWER(c.email) LIKE LOWER(${"%" + query + "%"})
        OR LOWER(c.phone) LIKE LOWER(${"%" + query + "%"})
      )
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `);
}

export async function findCrmAccountIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
  onlySupervisorScope?: boolean;
}): Promise<string[]> {
  const { tenantId, query, limit, onlySupervisorScope } = params;
  const supervisorFilter = onlySupervisorScope
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM crm.installations i
        WHERE i.account_id = a.id AND i.status = 'active'
      )`
    : Prisma.empty;
  const pattern = `%${query}%`;
  // RUT puede venir con/sin puntos y guión — normalizamos el query y comparamos
  // contra el rut almacenado quitándole también puntos/espacios/guiones.
  const rutNorm = query.replace(/[.\s-]/g, "");
  const rutPattern = `%${rutNorm}%`;
  return fetchIds(Prisma.sql`
    SELECT a.id
    FROM crm.accounts a
    WHERE a.tenant_id = ${tenantId}
      ${supervisorFilter}
      AND (
        LOWER(public.f_unaccent(a.name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.legal_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.legal_representative_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.industry, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR REPLACE(REPLACE(REPLACE(LOWER(COALESCE(a.rut, '')), '.', ''), '-', ''), ' ', '') LIKE ${rutPattern}
      )
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `);
}

export async function findCrmLeadIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
}): Promise<string[]> {
  const { tenantId, query, limit } = params;
  const pattern = `%${query}%`;
  return fetchIds(Prisma.sql`
    SELECT l.id
    FROM crm.leads l
    WHERE l.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(COALESCE(l.first_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(l.last_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(l.company_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(COALESCE(l.email, '')) LIKE LOWER(${pattern})
        OR LOWER(COALESCE(l.phone, '')) LIKE LOWER(${pattern})
      )
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  `);
}

export async function findCrmDealIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
}): Promise<string[]> {
  const { tenantId, query, limit } = params;
  const pattern = `%${query}%`;
  return fetchIds(Prisma.sql`
    SELECT d.id
    FROM crm.deals d
    LEFT JOIN crm.accounts a ON a.id = d.account_id
    WHERE d.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(d.title)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
      )
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);
}

/**
 * Devuelve IDs de deals cuyo título o nombre de cuenta matchean (sin LIMIT),
 * para encadenar la búsqueda de cotizaciones que cuelgan de esos deals.
 */
export async function findCrmDealIdsByTitleOrAccount(params: {
  tenantId: string;
  query: string;
}): Promise<string[]> {
  const { tenantId, query } = params;
  const pattern = `%${query}%`;
  return fetchIds(Prisma.sql`
    SELECT d.id
    FROM crm.deals d
    LEFT JOIN crm.accounts a ON a.id = d.account_id
    WHERE d.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(d.title)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
      )
  `);
}

export async function findCpqQuoteIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
  /** IDs de deals adicionales cuyos quotes incluir (vía dealId directo o CrmDealQuote). */
  extraDealIds?: string[];
  extraQuoteIds?: string[];
}): Promise<string[]> {
  const { tenantId, query, limit, extraDealIds, extraQuoteIds } = params;
  const pattern = `%${query}%`;
  const extraDealsCond =
    extraDealIds && extraDealIds.length > 0
      ? Prisma.sql`OR q.deal_id IN (${Prisma.join(extraDealIds)})`
      : Prisma.empty;
  const extraQuotesCond =
    extraQuoteIds && extraQuoteIds.length > 0
      ? Prisma.sql`OR q.id IN (${Prisma.join(extraQuoteIds)})`
      : Prisma.empty;
  return fetchIds(Prisma.sql`
    SELECT q.id
    FROM cpq.quotes q
    WHERE q.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(q.code)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(q.name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(q.client_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(q.notes, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        ${extraDealsCond}
        ${extraQuotesCond}
      )
    ORDER BY q.created_at DESC
    LIMIT ${limit}
  `);
}

export async function findCrmInstallationIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
  onlyActive?: boolean;
}): Promise<string[]> {
  const { tenantId, query, limit, onlyActive } = params;
  const pattern = `%${query}%`;
  const statusFilter = onlyActive
    ? Prisma.sql`AND i.status = 'active'`
    : Prisma.empty;
  return fetchIds(Prisma.sql`
    SELECT i.id
    FROM crm.installations i
    WHERE i.tenant_id = ${tenantId}
      ${statusFilter}
      AND (
        LOWER(public.f_unaccent(i.name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(i.address, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(i.commune, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(i.city, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
      )
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `);
}

export async function findOpsGuardiaIdsBySearch(params: {
  tenantId: string;
  query: string;
  limit: number;
}): Promise<string[]> {
  const { tenantId, query, limit } = params;
  const pattern = `%${query}%`;
  const rutNorm = query.replace(/[.\s-]/g, "");
  const rutPattern = `%${rutNorm}%`;
  return fetchIds(Prisma.sql`
    SELECT g.id
    FROM ops.guardias g
    INNER JOIN ops.personas p ON p.id = g.persona_id
    WHERE g.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(p.first_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(p.last_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(p.first_name || ' ' || p.last_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(g.code, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR REPLACE(REPLACE(REPLACE(LOWER(COALESCE(p.rut, '')), '.', ''), '-', ''), ' ', '') LIKE ${rutPattern}
      )
    ORDER BY g.created_at DESC
    LIMIT ${limit}
  `);
}

/**
 * Devuelve IDs de guardias cuyo persona.firstName/lastName/rut matchean,
 * sin LIMIT. Útil para encadenar búsqueda de documentos asociados.
 */
export async function findOpsGuardiaIdsForDocsSearch(params: {
  tenantId: string;
  query: string;
}): Promise<string[]> {
  const { tenantId, query } = params;
  const pattern = `%${query}%`;
  const rutNorm = query.replace(/[.\s-]/g, "");
  const rutPattern = `%${rutNorm}%`;
  return fetchIds(Prisma.sql`
    SELECT g.id
    FROM ops.guardias g
    INNER JOIN ops.personas p ON p.id = g.persona_id
    WHERE g.tenant_id = ${tenantId}
      AND (
        LOWER(public.f_unaccent(p.first_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(p.last_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR REPLACE(REPLACE(REPLACE(LOWER(COALESCE(p.rut, '')), '.', ''), '-', ''), ' ', '') LIKE ${rutPattern}
      )
  `);
}
