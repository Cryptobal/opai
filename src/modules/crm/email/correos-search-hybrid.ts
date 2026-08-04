/**
 * Motor híbrido de búsqueda de correos: fusión RRF de rama léxica + vectorial.
 *
 * Único punto de entrada para bandeja y asistente. Las condiciones estructurales
 * (carpeta, from/to/domain, fechas, adjuntos, unread, vertical) se aplican a
 * AMBAS ramas vía `buildCorreoSearchParts` + `folderWhereSql`.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CorreoListFilter } from "./correos-list";
import { snippetFromBody } from "./correos-list-helpers";
import {
  buildCorreoSearchIdsQuery,
  buildCorreoSearchParts,
  folderWhereSql,
  type ParsedCorreoSearch,
} from "./correos-search";
import {
  emailEmbeddingsDisabled,
  rankThreadsFromHits,
  semanticSearchChunks,
} from "./email-embeddings";

export type MatchReason = "lexical" | "semantic" | "both";

/** k de Reciprocal Rank Fusion (estándar literature). */
export const RRF_K = 60;
export const RRF_WEIGHT_LEXICAL = 1.0;
export const RRF_WEIGHT_SEMANTIC = 0.9;

/**
 * Distancia coseno máxima (pgvector `<=>`) para aceptar un hit semántico.
 * text-embedding-3-small: ~0.45 ≈ similitud 0.55. Por encima = ruido.
 */
export const SEMANTIC_MAX_DISTANCE = 0.45;

/**
 * Boosts deterministas — notoriamente menores que la diferencia RRF típica
 * entre posiciones consecutivas (~0.00027 en ranks bajos). Solo desempate.
 */
export const BOOST_SUBJECT = 0.00008;
export const BOOST_RECENCY_MAX = 0.00005;
export const BOOST_UNREAD = 0.00002;
export const BOOST_ATTACHMENT = 0.000015;
export const BOOST_CRM_ACCOUNT = 0.00002;

const RECENCY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

export type HybridSearchResult = {
  ids: string[];
  reasonById: Map<string, MatchReason>;
  /** Capacidad de entorno (API key + flag), independiente de exactOnly. */
  semanticAvailable: boolean;
  /** true si esta invocación ejecutó la rama semántica. */
  semanticRan: boolean;
  /** Mejor excerpt por hilo cuando la rama semántica aportó. */
  excerptById: Map<string, string>;
  /** Coincidencias léxicas (texto/operadores) antes del fuse. */
  lexicalCount: number;
  /** Hits semánticos que pasaron el umbral. */
  semanticCount: number;
  /** true si hubo al menos un match léxico. */
  hasExactMatches: boolean;
  /** Semánticos descartados por distancia > SEMANTIC_MAX_DISTANCE. */
  discardedSemantic: number;
  /** Tamaño del ranking fusionado (acotado al overfetch). */
  totalCount: number;
  /** true si el ranking alcanzó el techo de overfetch (puede haber más). */
  totalIsLowerBound: boolean;
};

/** Bajo este umbral de resultados léxicos el cliente pide semántico. */
export const SEMANTIC_FALLBACK_THRESHOLD = 5;

/** Techo de overfetch / offset de paginación por score. */
export const HYBRID_MAX_RANK = 500;

type LexicalRow = {
  id: string;
  last_message_at: Date | null;
  subject: string;
  is_unread: boolean;
  attachment_count: number;
  account_id: string | null;
};

function subjectMatches(subject: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const hay = subject.toLowerCase();
  return terms.every((t) => hay.includes(t.toLowerCase()));
}

function recencyBoost(lastMessageAt: Date | null, now: Date): number {
  if (!lastMessageAt) return 0;
  const age = Math.max(0, now.getTime() - lastMessageAt.getTime());
  if (age >= RECENCY_WINDOW_MS) return 0;
  return BOOST_RECENCY_MAX * (1 - age / RECENCY_WINDOW_MS);
}

export function fuseRrfScores(params: {
  lexicalIds: string[];
  semanticIds: string[];
  lexicalMeta?: Map<string, LexicalRow>;
  terms: string[];
  now?: Date;
}): Map<string, number> {
  const now = params.now ?? new Date();
  const scores = new Map<string, number>();

  params.lexicalIds.forEach((id, rank) => {
    scores.set(id, (scores.get(id) ?? 0) + RRF_WEIGHT_LEXICAL / (RRF_K + rank + 1));
  });
  params.semanticIds.forEach((id, rank) => {
    scores.set(id, (scores.get(id) ?? 0) + RRF_WEIGHT_SEMANTIC / (RRF_K + rank + 1));
  });

  if (params.lexicalMeta) {
    for (const [id, score] of scores) {
      const meta = params.lexicalMeta.get(id);
      if (!meta) continue;
      let boosted = score;
      if (subjectMatches(meta.subject, params.terms)) boosted += BOOST_SUBJECT;
      boosted += recencyBoost(meta.last_message_at, now);
      if (meta.is_unread) boosted += BOOST_UNREAD;
      if (meta.attachment_count > 0) boosted += BOOST_ATTACHMENT;
      if (meta.account_id) boosted += BOOST_CRM_ACCOUNT;
      scores.set(id, boosted);
    }
  }

  return scores;
}

export async function hybridSearchThreadIds(params: {
  tenantId: string;
  emailAccountIds: string[];
  parsed: ParsedCorreoSearch;
  folder: CorreoListFilter;
  vertical?: string | null;
  limit: number;
  /** Offset sobre el ranking fusionado (paginación por score). */
  offset?: number;
  now?: Date;
  /**
   * Si true, no mezcla ni devuelve resultados solo-semánticos.
   * Útil para "buscar solo exactos" y para el asistente en modo estricto.
   */
  exactOnly?: boolean;
}): Promise<HybridSearchResult> {
  const now = params.now ?? new Date();
  const folder = params.parsed.folderOverride ?? params.folder;
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const offset = Math.min(
    Math.max(Math.floor(params.offset ?? 0), 0),
    HYBRID_MAX_RANK,
  );
  const overfetch = Math.min((offset + limit) * 4, HYBRID_MAX_RANK);
  const hasTextTerms = params.parsed.terms.length > 0;
  const semanticAvailableEnv =
    !emailEmbeddingsDisabled() && Boolean(process.env.OPENAI_API_KEY);
  const exactOnly = Boolean(params.exactOnly);
  const emailAccountIds = params.emailAccountIds;

  if (emailAccountIds.length === 0) {
    return {
      ids: [],
      reasonById: new Map(),
      semanticAvailable: semanticAvailableEnv,
      semanticRan: false,
      excerptById: new Map(),
      lexicalCount: 0,
      semanticCount: 0,
      hasExactMatches: false,
      discardedSemantic: 0,
      totalCount: 0,
      totalIsLowerBound: false,
    };
  }

  // Atajo: solo operadores estructurales → léxico por recencia, sin embeddings.
  if (!hasTextTerms) {
    const idRows = await prisma.$queryRaw<LexicalRow[]>(
      buildCorreoSearchIdsQuery({
        tenantId: params.tenantId,
        emailAccountIds,
        parsed: params.parsed,
        folder,
        vertical: params.vertical ?? null,
        cursorDate: null,
        take: limit,
        now,
        structuralOnly: true,
      }),
    );
    const reasonById = new Map<string, MatchReason>();
    for (const row of idRows) reasonById.set(row.id, "lexical");
    return {
      ids: idRows.map((r) => r.id),
      reasonById,
      semanticAvailable: semanticAvailableEnv,
      semanticRan: false,
      excerptById: new Map(),
      lexicalCount: idRows.length,
      semanticCount: 0,
      hasExactMatches: idRows.length > 0,
      discardedSemantic: 0,
      totalCount: idRows.length,
      totalIsLowerBound: false,
    };
  }

  const parts = buildCorreoSearchParts(params.parsed);
  const folderSql = folderWhereSql(folder, now);
  const structuralWithVertical: Prisma.Sql[] = [
    ...parts.structural,
    ...(params.vertical ? [Prisma.sql`t.ai_vertical = ${params.vertical}`] : []),
  ];

  // Tipado en vivo (exactOnly): asunto + participantes — evita seq scan de
  // cuerpos HTML que dispara timeouts/504 y el falso "Sin conexión" del cliente.
  // Si 0 hits, expandimos a cuerpo en la misma request (recall). Con semantic=1
  // ya vamos directo al léxico completo + embeddings.
  const lexicalPromise = prisma.$queryRaw<LexicalRow[]>(
    buildCorreoSearchIdsQuery({
      tenantId: params.tenantId,
      emailAccountIds,
      parsed: params.parsed,
      folder,
      vertical: params.vertical ?? null,
      cursorDate: null,
      take: overfetch,
      now,
      paletteTextOnly: exactOnly,
    }),
  );

  const semanticPromise =
    semanticAvailableEnv && !exactOnly
      ? semanticSearchChunks({
          tenantId: params.tenantId,
          emailAccountIds,
          query: params.parsed.terms.join(" "),
          limit: overfetch,
          folderSql,
          structuralSql: structuralWithVertical,
          overfetch,
        })
      : Promise.resolve([]);

  const [lexSettled, semSettled] = await Promise.allSettled([
    lexicalPromise,
    semanticPromise,
  ]);

  let lexicalRows = lexSettled.status === "fulfilled" ? lexSettled.value : [];
  if (exactOnly && lexicalRows.length === 0 && hasTextTerms) {
    try {
      lexicalRows = await prisma.$queryRaw<LexicalRow[]>(
        buildCorreoSearchIdsQuery({
          tenantId: params.tenantId,
          emailAccountIds,
          parsed: params.parsed,
          folder,
          vertical: params.vertical ?? null,
          cursorDate: null,
          take: overfetch,
          now,
          paletteTextOnly: false,
        }),
      );
    } catch {
      // Mantener vacío: el cliente muestra "sin resultados", no offline.
    }
  }
  const rawSemanticHits = semSettled.status === "fulfilled" ? semSettled.value : [];
  // Capacidad de entorno (UI); independiente de si esta request pidió semántico.
  const semanticAvailable = semanticAvailableEnv;
  const semanticRan =
    !exactOnly && semanticAvailableEnv && semSettled.status === "fulfilled";

  const acceptedHits = rawSemanticHits.filter(
    (h) => Number.isFinite(h.distance) && h.distance <= SEMANTIC_MAX_DISTANCE,
  );
  const discardedSemantic = rawSemanticHits.length - acceptedHits.length;

  const lexicalIds = lexicalRows.map((r) => r.id);
  const hasExactMatches = lexicalIds.length > 0;
  const semanticIds = rankThreadsFromHits(acceptedHits, overfetch);
  const lexicalMeta = new Map(lexicalRows.map((r) => [r.id, r]));

  // Con matches léxicos: preservar su orden (boosts deterministas) y anexar
  // solo-semánticos al final — la lista ya pintada no se reordena al llegar
  // el semántico. Sin exactos: RRF completo (banner "sin coincidencias exactas").
  let rankedAll: string[];
  if (hasExactMatches) {
    const lexicalScores = fuseRrfScores({
      lexicalIds,
      semanticIds: [],
      lexicalMeta,
      terms: params.parsed.terms,
      now,
    });
    const lexicalRanked = Array.from(lexicalScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const lexicalSetForAppend = new Set(lexicalIds);
    const semanticOnly = semanticRan
      ? semanticIds.filter((id) => !lexicalSetForAppend.has(id))
      : [];
    rankedAll = [...lexicalRanked, ...semanticOnly];
  } else {
    const scores = fuseRrfScores({
      lexicalIds,
      semanticIds: semanticRan ? semanticIds : [],
      lexicalMeta,
      terms: params.parsed.terms,
      now,
    });
    rankedAll = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }
  const totalCount = rankedAll.length;
  const totalIsLowerBound =
    lexicalIds.length >= overfetch || semanticIds.length >= overfetch;
  const ranked = rankedAll.slice(offset, offset + limit);

  const lexicalSet = new Set(lexicalIds);
  const semanticSet = new Set(semanticIds);
  const reasonById = new Map<string, MatchReason>();
  for (const id of ranked) {
    const inLex = lexicalSet.has(id);
    const inSem = semanticSet.has(id);
    reasonById.set(id, inLex && inSem ? "both" : inSem ? "semantic" : "lexical");
  }

  const excerptById = new Map<string, string>();
  for (const hit of acceptedHits) {
    if (!excerptById.has(hit.threadId)) {
      excerptById.set(hit.threadId, hit.content.slice(0, 240));
    }
  }

  // Matches léxicos puros: una fila por hilo, cuerpo truncado en BD.
  // Evita traer textBody/htmlBody completos de todos los mensajes del set.
  // thread_id es uuid: sin ::uuid Postgres falla con "operator does not exist: uuid = text".
  const missingExcerpt = ranked.filter((id) => !excerptById.has(id));
  if (missingExcerpt.length > 0) {
    try {
      const rows = await prisma.$queryRaw<
        Array<{ thread_id: string; body: string | null }>
      >(Prisma.sql`
        SELECT DISTINCT ON (m.thread_id)
               m.thread_id,
               LEFT(COALESCE(m.text_body, m.html_body, ''), 2000) AS body
        FROM crm.email_messages m
        WHERE m.tenant_id::text = ${params.tenantId}
          AND m.thread_id IN (${Prisma.join(
            missingExcerpt.map((id) => Prisma.sql`${id}::uuid`),
          )})
          AND m.is_draft = false
        ORDER BY m.thread_id, m.sent_at DESC
      `);
      for (const row of rows) {
        if (!row.body) continue;
        const snippet = snippetFromBody(row.body.replace(/<[^>]+>/g, " "));
        if (snippet) excerptById.set(row.thread_id, snippet.slice(0, 240));
      }
    } catch (err) {
      // No tumbar la búsqueda por fallos de snippet; el listado ya tiene IDs.
      console.warn("[correo-search] excerpt hydrate falló:", err);
    }
  }

  return {
    ids: ranked,
    reasonById,
    semanticAvailable,
    semanticRan,
    excerptById,
    lexicalCount: lexicalIds.length,
    semanticCount: semanticIds.length,
    hasExactMatches,
    discardedSemantic,
    totalCount,
    totalIsLowerBound,
  };
}
