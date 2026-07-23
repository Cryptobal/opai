/**
 * Búsqueda server-side de la bandeja de correos (C15, PR-07).
 *
 * Parser de operadores estilo Gmail + builder de condiciones SQL. La búsqueda
 * corre contra la BD espejo (toda la casilla sincronizada), no contra la
 * página cargada en el cliente.
 *
 * Operadores soportados:
 *   - texto libre        → asunto (accent-insensitive) + participantes + cuerpo
 *   - "frase exacta"     → igual que texto libre, con espacios
 *   - from:valor         → remitente de cualquier mensaje del hilo (substring)
 *   - to:valor           → destinatarios To/CC/BCC (substring)
 *   - domain:valor       → dominio de cualquier participante (con subdominios)
 *   - before:YYYY-MM-DD  → último mensaje anterior a la fecha (exclusivo, UTC)
 *   - after:YYYY-MM-DD   → último mensaje desde la fecha (inclusivo, UTC)
 *   - has:attachment     → hilos con adjuntos (alias: has:adjunto)
 *
 * Decisiones:
 *   - Se eligió pg_trgm (no tsvector) porque el repo ya tiene la infraestructura
 *     trigram + f_unaccent del buscador global (migración 20260916...), y porque
 *     los operadores from/to/domain necesitan substring matching que tsvector no
 *     da (tokeniza emails completos). Los índices van en SQL manual supervisado
 *     con CREATE INDEX CONCURRENTLY (ver prisma/migrations/PENDING-email-search-indexes.sql).
 *   - Fechas inválidas en before:/after: se ignoran (comportamiento Gmail).
 *   - Tokens `has:` con valor desconocido se ignoran. Otros tokens con ":"
 *     (ej. "re:") se tratan como texto libre.
 *   - Múltiples valores del mismo operador se combinan con AND.
 */
import { Prisma } from "@prisma/client";
import type { CorreoListFilter } from "./correos-list";

export type ParsedCorreoSearch = {
  terms: string[];
  from: string[];
  to: string[];
  domains: string[];
  before: Date | null;
  after: Date | null;
  hasAttachment: boolean;
};

const OPERATOR_RE = /^(from|to|domain|before|after|has):(.*)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Longitud máxima defensiva del query completo. */
export const MAX_CORREO_SEARCH_LENGTH = 300;

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, "").trim();
}

/** Tokeniza respetando frases entre comillas, incluso pegadas a operador (from:"bob jones"). */
function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) tokens.push(match[0]);
  return tokens;
}

function parseUtcDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Rechaza fechas normalizadas por JS (2026-02-31 → 2026-03-03).
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/**
 * Parsea el query de búsqueda. Devuelve `null` si no hay nada buscable
 * (query vacío o solo operadores inválidos) — señal de "sin búsqueda activa".
 */
export function parseCorreoSearchQuery(raw: string | null | undefined): ParsedCorreoSearch | null {
  const input = (raw ?? "").slice(0, MAX_CORREO_SEARCH_LENGTH).trim();
  if (!input) return null;

  const parsed: ParsedCorreoSearch = {
    terms: [],
    from: [],
    to: [],
    domains: [],
    before: null,
    after: null,
    hasAttachment: false,
  };

  for (const token of tokenize(input)) {
    const op = OPERATOR_RE.exec(token);
    if (!op) {
      const term = stripQuotes(token);
      if (term) parsed.terms.push(term);
      continue;
    }
    const name = op[1].toLowerCase();
    const value = stripQuotes(op[2]);
    if (name === "has") {
      const v = value.toLowerCase();
      if (v === "attachment" || v === "adjunto" || v === "adjuntos") {
        parsed.hasAttachment = true;
      }
      continue; // has: con valor desconocido se ignora
    }
    if (!value) continue; // operador sin valor se ignora
    if (name === "from") parsed.from.push(value.toLowerCase());
    else if (name === "to") parsed.to.push(value.toLowerCase());
    else if (name === "domain") parsed.domains.push(value.toLowerCase().replace(/^@/, ""));
    else if (name === "before") parsed.before = parseUtcDate(value) ?? parsed.before;
    else if (name === "after") parsed.after = parseUtcDate(value) ?? parsed.after;
  }

  const active =
    parsed.terms.length > 0 ||
    parsed.from.length > 0 ||
    parsed.to.length > 0 ||
    parsed.domains.length > 0 ||
    parsed.before !== null ||
    parsed.after !== null ||
    parsed.hasAttachment;
  return active ? parsed : null;
}

/** Escapa wildcards de LIKE (% _ \) — el escape default de Postgres es backslash. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

/**
 * Condiciones SQL de las carpetas sobre el alias `t` (crm.email_threads).
 * DEBE mantenerse en paridad con `folderWhere` de correos-list.ts (hay test).
 */
export function folderWhereSql(folder: CorreoListFilter, now: Date): Prisma.Sql {
  if (folder === "trash") return Prisma.sql`t.trashed_at IS NOT NULL`;
  if (folder === "snoozed") {
    return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND t.snoozed_until > ${now}`;
  }
  if (folder === "archived") {
    return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND t.archived_at IS NOT NULL`;
  }
  if (folder === "all") return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL`;
  if (folder === "sent") {
    return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id AND m.direction = 'out' AND m.is_draft = false
    )`;
  }
  if (folder === "drafts") {
    return Prisma.sql`t.trashed_at IS NULL AND EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id AND m.is_draft = true
    )`;
  }
  if (folder === "spam") {
    return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NOT NULL`;
  }
  if (folder === "starred") {
    return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND t.starred_at IS NOT NULL`;
  }
  return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND t.archived_at IS NULL AND (t.snoozed_until IS NULL OR t.snoozed_until <= ${now})`;
}

/**
 * Condiciones de búsqueda sobre el alias `t` (crm.email_threads), una por
 * criterio, para combinar con AND. Los subqueries a crm.email_messages van
 * por thread_id (idx_crm_email_messages_thread).
 */
export function buildCorreoSearchConditions(parsed: ParsedCorreoSearch): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];

  for (const term of parsed.terms) {
    const pattern = containsPattern(term);
    // Asunto accent-insensitive (usa el índice trgm sobre LOWER(f_unaccent(subject)));
    // participantes y cuerpo case-insensitive (emails no llevan tildes; el cuerpo
    // se compara tal cual para no pagar f_unaccent sobre textos largos).
    conds.push(Prisma.sql`(
      LOWER(public.f_unaccent(t.subject)) LIKE LOWER(public.f_unaccent(${pattern}))
      OR EXISTS (
        SELECT 1 FROM crm.email_messages m
        WHERE m.thread_id = t.id
          AND (
            LOWER(m.from_email) LIKE LOWER(${pattern})
            OR EXISTS (
              SELECT 1 FROM unnest(m.to_emails || m.cc_emails) AS rcpt(email)
              WHERE LOWER(rcpt.email) LIKE LOWER(${pattern})
            )
            OR m.text_body ILIKE ${pattern}
          )
      )
    )`);
  }

  for (const from of parsed.from) {
    const pattern = containsPattern(from);
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id AND LOWER(m.from_email) LIKE ${pattern}
    )`);
  }

  for (const to of parsed.to) {
    const pattern = containsPattern(to);
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id
        AND EXISTS (
          SELECT 1 FROM unnest(m.to_emails || m.cc_emails || m.bcc_emails) AS rcpt(email)
          WHERE LOWER(rcpt.email) LIKE ${pattern}
        )
    )`);
  }

  for (const domain of parsed.domains) {
    // domain:acme.com matchea bob@acme.com y bob@mail.acme.com, no bob@notacme.com.
    const subdomainPattern = `%.${escapeLikePattern(domain)}`;
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id
        AND EXISTS (
          SELECT 1 FROM unnest(ARRAY[m.from_email] || m.to_emails || m.cc_emails) AS p(email)
          WHERE split_part(LOWER(p.email), '@', 2) = ${domain}
             OR split_part(LOWER(p.email), '@', 2) LIKE ${subdomainPattern}
        )
    )`);
  }

  if (parsed.before) conds.push(Prisma.sql`t.last_message_at < ${parsed.before}`);
  if (parsed.after) conds.push(Prisma.sql`t.last_message_at >= ${parsed.after}`);
  if (parsed.hasAttachment) conds.push(Prisma.sql`t.attachment_count > 0`);

  return conds;
}

/**
 * Query completa de IDs de hilos que matchean la búsqueda, paginada por
 * cursor de fecha (last_message_at DESC — bajo búsqueda todas las carpetas
 * ordenan por recencia, incluida Pospuestos).
 */
export function buildCorreoSearchIdsQuery(params: {
  tenantId: string;
  emailAccountId: string;
  parsed: ParsedCorreoSearch;
  folder: CorreoListFilter;
  /** A03: filtro por vertical v5 (ai_vertical). */
  vertical?: string | null;
  cursorDate: Date | null;
  take: number;
  now?: Date;
}): Prisma.Sql {
  const now = params.now ?? new Date();
  const conds: Prisma.Sql[] = [
    Prisma.sql`t.tenant_id::text = ${params.tenantId}`,
    Prisma.sql`t.email_account_id = ${params.emailAccountId}::uuid`,
    folderWhereSql(params.folder, now),
    ...buildCorreoSearchConditions(params.parsed),
    ...(params.vertical ? [Prisma.sql`t.ai_vertical = ${params.vertical}`] : []),
  ];
  if (params.cursorDate) conds.push(Prisma.sql`t.last_message_at < ${params.cursorDate}`);
  return Prisma.sql`
    SELECT t.id, t.last_message_at
    FROM crm.email_threads t
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT ${params.take}
  `;
}
