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
    WHERE c.tenant_id::text = ${tenantId}
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
    WHERE a.tenant_id::text = ${tenantId}
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
    WHERE l.tenant_id::text = ${tenantId}
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
    WHERE d.tenant_id::text = ${tenantId}
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
    WHERE d.tenant_id::text = ${tenantId}
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
      ? Prisma.sql`OR q.deal_id IN (${Prisma.join(extraDealIds.map((id) => Prisma.sql`${id}::uuid`), ", ")})`
      : Prisma.empty;
  const extraQuotesCond =
    extraQuoteIds && extraQuoteIds.length > 0
      ? Prisma.sql`OR q.id IN (${Prisma.join(extraQuoteIds.map((id) => Prisma.sql`${id}::uuid`), ", ")})`
      : Prisma.empty;
  return fetchIds(Prisma.sql`
    SELECT q.id
    FROM cpq.quotes q
    WHERE q.tenant_id::text = ${tenantId}
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

/**
 * Buscador UNIVERSAL de negocios (Fase 21 Slack): matchea por título del
 * negocio, nombre de la CUENTA o nombre de INSTALACIÓN. La relación
 * negocio↔instalación tiene TRES caminos reales en el esquema y se recorren
 * todos (auditado F21):
 *  1. `crm.deals.installation_name` — campo directo desnormalizado (migración Soho).
 *  2. `cpq.quotes.installation_id` — instalaciones de sus cotizaciones CPQ,
 *     vinculadas al deal por `q.deal_id` directo O por la tabla `crm.deal_quotes`.
 *  3. `crm.installations.activated_by_deal_id` — instalación activada por el deal.
 *
 * `scope` filtra por estado del negocio: un negocio CERRADO debe ser
 * encontrable (post-mortems, reactivaciones, abrir su sala).
 */
export async function findCrmDealIdsUniversalSearch(params: {
  tenantId: string;
  query: string;
  scope: "open" | "won" | "lost" | "all";
  limit: number;
}): Promise<string[]> {
  const { tenantId, query, scope, limit } = params;
  const pattern = `%${query}%`;
  const statusFilter =
    scope === "all" ? Prisma.empty : Prisma.sql`AND d.status = ${scope}`;
  return fetchIds(Prisma.sql`
    SELECT d.id
    FROM crm.deals d
    LEFT JOIN crm.accounts a ON a.id = d.account_id
    WHERE d.tenant_id::text = ${tenantId}
      ${statusFilter}
      AND (
        LOWER(public.f_unaccent(d.title)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(a.name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(COALESCE(d.installation_name, ''))) LIKE LOWER(public.f_unaccent(${pattern}))
        OR EXISTS (
          SELECT 1 FROM cpq.quotes q
          JOIN crm.installations iq ON iq.id = q.installation_id
          WHERE q.tenant_id::text = ${tenantId}
            AND (
              q.deal_id = d.id
              OR EXISTS (SELECT 1 FROM crm.deal_quotes dq WHERE dq.deal_id = d.id AND dq.quote_id = q.id)
            )
            AND LOWER(public.f_unaccent(iq.name)) LIKE LOWER(public.f_unaccent(${pattern}))
        )
        OR EXISTS (
          SELECT 1 FROM crm.installations ia
          WHERE ia.tenant_id::text = ${tenantId}
            AND ia.activated_by_deal_id = d.id
            AND LOWER(public.f_unaccent(ia.name)) LIKE LOWER(public.f_unaccent(${pattern}))
        )
      )
    ORDER BY d.updated_at DESC
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
    WHERE i.tenant_id::text = ${tenantId}
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
    WHERE g.tenant_id::text = ${tenantId}
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
    WHERE g.tenant_id::text = ${tenantId}
      AND (
        LOWER(public.f_unaccent(p.first_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR LOWER(public.f_unaccent(p.last_name)) LIKE LOWER(public.f_unaccent(${pattern}))
        OR REPLACE(REPLACE(REPLACE(LOWER(COALESCE(p.rut, '')), '.', ''), '-', ''), ' ', '') LIKE ${rutPattern}
      )
  `);
}
