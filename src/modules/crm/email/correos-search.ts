/**
 * Búsqueda server-side de la bandeja de correos (C15, PR-07 + híbrida).
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
 *   - subject:valor      → solo asunto
 *   - before:YYYY-MM-DD  → último mensaje anterior a la fecha (exclusivo, UTC)
 *   - after:YYYY-MM-DD   → último mensaje desde la fecha (inclusivo, UTC)
 *   - newer_than:7d|2w|3m / older_than:… → relativos (America/Santiago)
 *   - has:attachment     → hilos con adjuntos (alias: has:adjunto)
 *   - is:unread|read|starred
 *   - vertical:|label:   → ai_vertical del radar
 *   - in:inbox|sent|…    → override de carpeta
 *
 * Decisiones:
 *   - Se eligió pg_trgm (no tsvector) porque el repo ya tiene la infraestructura
 *     trigram + f_unaccent del buscador global (migración 20260916...), y porque
 *     los operadores from/to/domain necesitan substring matching que tsvector no
 *     da (tokeniza emails completos). Los índices van en SQL manual supervisado
 *     con CREATE INDEX CONCURRENTLY (ver prisma/migrations/PENDING-email-search-indexes.sql).
 *   - Fechas inválidas en before:/after: se ignoran (comportamiento Gmail).
 *   - Tokens `has:` / `vertical:` / `in:` con valor desconocido se ignoran.
 *     Otros tokens con ":" (ej. "re:") se tratan como texto libre.
 *   - Múltiples valores del mismo operador se combinan con AND.
 */
import { Prisma } from "@prisma/client";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDaysChile, CHILE_TZ, startOfDayChile } from "@/lib/dates-cl";
import type { CorreoListFilter } from "./correos-list";
import {
  CORREO_LIST_FILTERS,
  CORREO_SEARCH_VERTICALS,
} from "./correos-search-constants";
import { correoOperatorRegex } from "./correos-operator-registry";

export { CORREO_LIST_FILTERS, CORREO_SEARCH_VERTICALS };

const VERTICAL_SET = new Set<string>(CORREO_SEARCH_VERTICALS);
const FOLDER_SET = new Set<string>(CORREO_LIST_FILTERS);

export type ParsedCorreoSearch = {
  terms: string[];
  from: string[];
  to: string[];
  cc: string[];
  domains: string[];
  subject: string[];
  before: Date | null;
  after: Date | null;
  hasAttachment: boolean;
  unread: boolean | null;
  starred: boolean | null;
  verticals: string[];
  folderOverride: CorreoListFilter | null;
};

const OPERATOR_RE = correoOperatorRegex();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_RE = /^(\d+)([dwm])$/i;
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

/** Resuelve 7d / 2w / 3m contra ahora en America/Santiago → instante UTC. */
export function parseRelativeAge(value: string, now: Date = new Date()): Date | null {
  const m = RELATIVE_RE.exec(value.trim());
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 3650) return null;
  const unit = m[2].toLowerCase();
  if (unit === "d") return addDaysChile(now, -amount);
  if (unit === "w") return addDaysChile(now, -amount * 7);
  // Meses calendario en Chile.
  const local = toZonedTime(startOfDayChile(now), CHILE_TZ);
  local.setMonth(local.getMonth() - amount);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, CHILE_TZ);
}

function isActive(parsed: ParsedCorreoSearch): boolean {
  return (
    parsed.terms.length > 0 ||
    parsed.from.length > 0 ||
    parsed.to.length > 0 ||
    parsed.cc.length > 0 ||
    parsed.domains.length > 0 ||
    parsed.subject.length > 0 ||
    parsed.before !== null ||
    parsed.after !== null ||
    parsed.hasAttachment ||
    parsed.unread !== null ||
    parsed.starred !== null ||
    parsed.verticals.length > 0 ||
    parsed.folderOverride !== null
  );
}

/**
 * Parsea el query de búsqueda. Devuelve `null` si no hay nada buscable
 * (query vacío o solo operadores inválidos) — señal de "sin búsqueda activa".
 */
export function parseCorreoSearchQuery(
  raw: string | null | undefined,
  now: Date = new Date(),
): ParsedCorreoSearch | null {
  const input = (raw ?? "").slice(0, MAX_CORREO_SEARCH_LENGTH).trim();
  if (!input) return null;

  const parsed: ParsedCorreoSearch = {
    terms: [],
    from: [],
    to: [],
    cc: [],
    domains: [],
    subject: [],
    before: null,
    after: null,
    hasAttachment: false,
    unread: null,
    starred: null,
    verticals: [],
    folderOverride: null,
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
      continue;
    }
    if (name === "is") {
      const v = value.toLowerCase();
      if (v === "unread") parsed.unread = true;
      else if (v === "read") parsed.unread = false;
      else if (v === "starred") parsed.starred = true;
      continue;
    }
    if (!value) continue;
    if (name === "from") parsed.from.push(value.toLowerCase());
    else if (name === "to") parsed.to.push(value.toLowerCase());
    else if (name === "cc") parsed.cc.push(value.toLowerCase());
    else if (name === "domain") parsed.domains.push(value.toLowerCase().replace(/^@/, ""));
    else if (name === "subject") parsed.subject.push(value);
    else if (name === "before") parsed.before = parseUtcDate(value) ?? parsed.before;
    else if (name === "after") parsed.after = parseUtcDate(value) ?? parsed.after;
    else if (name === "newer_than") {
      const d = parseRelativeAge(value, now);
      if (d) parsed.after = d;
    } else if (name === "older_than") {
      const d = parseRelativeAge(value, now);
      if (d) parsed.before = d;
    } else if (name === "vertical" || name === "label") {
      const v = value.toLowerCase();
      if (VERTICAL_SET.has(v) && !parsed.verticals.includes(v)) parsed.verticals.push(v);
    } else if (name === "in") {
      const v = value.toLowerCase();
      if (FOLDER_SET.has(v)) parsed.folderOverride = v as CorreoListFilter;
    }
  }

  return isActive(parsed) ? parsed : null;
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
  // Espejo estricto: Recibidos exige label INBOX en algún mensaje (paridad
  // con folderWhere de correos-list.ts).
  return Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL AND t.archived_at IS NULL AND (t.snoozed_until IS NULL OR t.snoozed_until <= ${now}) AND EXISTS (
    SELECT 1 FROM crm.email_messages m
    WHERE m.thread_id = t.id AND m.label_ids @> ARRAY['INBOX']::text[]
  )`;
}

function buildStructuralConditions(parsed: ParsedCorreoSearch): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];

  for (const subject of parsed.subject) {
    const pattern = containsPattern(subject);
    conds.push(
      Prisma.sql`LOWER(public.f_unaccent(t.subject)) LIKE LOWER(public.f_unaccent(${pattern}))`,
    );
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

  for (const cc of parsed.cc ?? []) {
    const pattern = containsPattern(cc);
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM crm.email_messages m
      WHERE m.thread_id = t.id
        AND EXISTS (
          SELECT 1 FROM unnest(m.cc_emails) AS rcpt(email)
          WHERE LOWER(rcpt.email) LIKE ${pattern}
        )
    )`);
  }

  for (const domain of parsed.domains) {
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
  if (parsed.unread === true) conds.push(Prisma.sql`t.is_unread = true`);
  if (parsed.unread === false) conds.push(Prisma.sql`t.is_unread = false`);
  if (parsed.starred === true) conds.push(Prisma.sql`t.starred_at IS NOT NULL`);
  for (const vertical of parsed.verticals) {
    conds.push(Prisma.sql`(
      t.vertical_override = ${vertical}
      OR (t.vertical_override IS NULL AND t.ai_vertical = ${vertical})
    )`);
  }

  return conds;
}

/** Trigram solo acelera patrones de 3+ caracteres (gin_trgm_ops). */
const MIN_TRGM_TERM_LENGTH = 3;

/**
 * Condiciones de texto libre. La expresión de cuerpo DEBE coincidir carácter
 * a carácter con `idx_crm_email_messages_body_trgm`
 * (migración 20261122000000_email_messages_body_trgm):
 *   LOWER(public.f_unaccent(COALESCE(text_body, html_body, '')))
 * Cobertura: text_body tiene precedencia; html_body actúa de respaldo cuando
 * el primero es NULL (misma semántica que snippetFromBody en el módulo).
 */
function buildTextConditions(parsed: ParsedCorreoSearch): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  for (const term of parsed.terms) {
    const pattern = containsPattern(term);
    // Bajo 3 chars el cuerpo degrada a seq scan: se restringe a asunto y
    // participantes para no escanear HTML completo en cada tecla.
    const searchesBody = term.length >= MIN_TRGM_TERM_LENGTH;
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
            ${
              searchesBody
                ? Prisma.sql`OR LOWER(public.f_unaccent(COALESCE(m.text_body, m.html_body, ''))) LIKE LOWER(public.f_unaccent(${pattern}))`
                : Prisma.empty
            }
          )
      )
    )`);
  }
  return conds;
}

/**
 * Variante ligera para el command palette: asunto + remitente/participantes.
 * Nunca consulta text_body/html_body (latencia y costo de índices de cuerpo).
 */
export function buildPaletteTextConditions(parsed: ParsedCorreoSearch): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  for (const term of parsed.terms) {
    const pattern = containsPattern(term);
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
          )
      )
    )`);
  }
  return conds;
}

/**
 * Particiona condiciones: estructurales (léxico + vectorial) vs texto (solo léxico).
 */
export function buildCorreoSearchParts(parsed: ParsedCorreoSearch): {
  structural: Prisma.Sql[];
  text: Prisma.Sql[];
} {
  return {
    structural: buildStructuralConditions(parsed),
    text: buildTextConditions(parsed),
  };
}

/**
 * Condiciones de búsqueda sobre el alias `t` (crm.email_threads), una por
 * criterio, para combinar con AND. Wrapper de compatibilidad sobre
 * `buildCorreoSearchParts`.
 */
export function buildCorreoSearchConditions(parsed: ParsedCorreoSearch): Prisma.Sql[] {
  const parts = buildCorreoSearchParts(parsed);
  return [...parts.structural, ...parts.text];
}

/**
 * Query completa de IDs de hilos que matchean la búsqueda, paginada por
 * cursor de fecha (last_message_at DESC — bajo búsqueda todas las carpetas
 * ordenan por recencia, incluida Pospuestos).
 */
/** Fragmento SQL seguro para filtrar casillas (evita ANY text[] de Prisma). */
export function emailAccountIdsInSql(
  ids: string[],
  column: Prisma.Sql = Prisma.sql`t.email_account_id`,
): Prisma.Sql {
  if (ids.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${column} IN (${Prisma.join(
    ids.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

export function buildCorreoSearchIdsQuery(params: {
  tenantId: string;
  emailAccountIds: string[];
  parsed: ParsedCorreoSearch;
  folder: CorreoListFilter;
  /** A03: filtro por vertical efectiva (override ?? ai_vertical). */
  vertical?: string | null;
  cursorDate: Date | null;
  take: number;
  now?: Date;
  /** Override opcional; default recencia. */
  orderBy?: Prisma.Sql;
  /** Si true, solo aplica condiciones estructurales (sin texto libre). */
  structuralOnly?: boolean;
  /**
   * Si true, el texto libre matchea solo asunto + participantes (sin cuerpo).
   * Usado por el command palette.
   */
  paletteTextOnly?: boolean;
}): Prisma.Sql {
  const now = params.now ?? new Date();
  const parts = buildCorreoSearchParts(params.parsed);
  const textConds = params.paletteTextOnly
    ? buildPaletteTextConditions(params.parsed)
    : parts.text;
  const searchConds = params.structuralOnly
    ? parts.structural
    : [...parts.structural, ...textConds];
  const conds: Prisma.Sql[] = [
    Prisma.sql`t.tenant_id::text = ${params.tenantId}`,
    emailAccountIdsInSql(params.emailAccountIds),
    folderWhereSql(params.folder, now),
    ...searchConds,
    ...(params.vertical
      ? [
          Prisma.sql`(
            t.vertical_override = ${params.vertical}
            OR (t.vertical_override IS NULL AND t.ai_vertical = ${params.vertical})
          )`,
        ]
      : []),
  ];
  if (params.cursorDate) conds.push(Prisma.sql`t.last_message_at < ${params.cursorDate}`);
  const orderBy = params.orderBy ?? Prisma.sql`t.last_message_at DESC NULLS LAST`;
  return Prisma.sql`
    SELECT t.id, t.last_message_at, t.subject, t.is_unread, t.attachment_count, t.account_id
    FROM crm.email_threads t
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY ${orderBy}
    LIMIT ${params.take}
  `;
}
