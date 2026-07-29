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
 * Distancia coseno máxima (`<=>`) para aceptar un hit semántico.
 * Por encima = vecino lejano (basura operacional). text-embedding-3-small.
 */
export const MAX_SEMANTIC_DISTANCE = 0.55;

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
  semanticAvailable: boolean;
  /** Mejor excerpt por hilo cuando la rama semántica aportó. */
  excerptById: Map<string, string>;
  /** La rama léxica no encontró nada (el resultado es solo semántico o vacío). */
  lexicalEmpty: boolean;
  /** Hits semánticos descartados por baja similitud. */
  semanticDiscarded: number;
};

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
  emailAccountId: string;
  parsed: ParsedCorreoSearch;
  folder: CorreoListFilter;
  vertical?: string | null;
  limit: number;
  now?: Date;
  /**
   * Si true, no mezcla hits solo-semánticos cuando la rama léxica está vacía.
   * Útil para «buscar solo exactos» y para queries basura (asdfgh).
   */
  exactOnly?: boolean;
}): Promise<HybridSearchResult> {
  const now = params.now ?? new Date();
  // Texto libre sin `in:` → toda la casilla (como Gmail). Operadores solos
  // respetan la carpeta de la UI.
  const folder =
    params.parsed.folderOverride ??
    (params.parsed.terms.length > 0 ? "all" : params.folder);
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const overfetch = Math.min(limit * 4, 200);
  const hasTextTerms = params.parsed.terms.length > 0;
  const semanticAvailableEnv =
    !emailEmbeddingsDisabled() && Boolean(process.env.OPENAI_API_KEY);

  // Atajo: solo operadores estructurales → léxico por recencia, sin embeddings.
  if (!hasTextTerms) {
    const idRows = await prisma.$queryRaw<LexicalRow[]>(
      buildCorreoSearchIdsQuery({
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
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
      excerptById: new Map(),
      lexicalEmpty: idRows.length === 0,
      semanticDiscarded: 0,
    };
  }

  const parts = buildCorreoSearchParts(params.parsed);
  const folderSql = folderWhereSql(folder, now);
  const structuralWithVertical: Prisma.Sql[] = [
    ...parts.structural,
    ...(params.vertical ? [Prisma.sql`t.ai_vertical = ${params.vertical}`] : []),
  ];

  const lexicalPromise = prisma.$queryRaw<LexicalRow[]>(
    buildCorreoSearchIdsQuery({
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      parsed: params.parsed,
      folder,
      vertical: params.vertical ?? null,
      cursorDate: null,
      take: overfetch,
      now,
    }),
  );

  const semanticPromise = semanticAvailableEnv
    ? semanticSearchChunks({
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
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

  const lexicalRows = lexSettled.status === "fulfilled" ? lexSettled.value : [];
  const rawSemanticHits = semSettled.status === "fulfilled" ? semSettled.value : [];
  const semanticAvailable =
    semanticAvailableEnv && semSettled.status === "fulfilled";

  const strongHits = rawSemanticHits.filter(
    (h) => h.distance <= MAX_SEMANTIC_DISTANCE,
  );
  const semanticDiscarded = rawSemanticHits.length - strongHits.length;

  const lexicalIds = lexicalRows.map((r) => r.id);
  const lexicalEmpty = lexicalIds.length === 0;

  // exactOnly / umbral: nunca servir vecinos semánticos lejanos.
  const semanticHits = params.exactOnly ? [] : strongHits;
  const semanticIds = rankThreadsFromHits(semanticHits, overfetch);
  const lexicalMeta = new Map(lexicalRows.map((r) => [r.id, r]));

  const scores = fuseRrfScores({
    lexicalIds,
    semanticIds,
    lexicalMeta,
    terms: params.parsed.terms,
    now,
  });

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const lexicalSet = new Set(lexicalIds);
  const semanticSet = new Set(semanticIds);
  const reasonById = new Map<string, MatchReason>();
  for (const id of ranked) {
    const inLex = lexicalSet.has(id);
    const inSem = semanticSet.has(id);
    reasonById.set(id, inLex && inSem ? "both" : inSem ? "semantic" : "lexical");
  }

  const excerptById = new Map<string, string>();
  for (const hit of semanticHits) {
    if (!excerptById.has(hit.threadId)) {
      excerptById.set(hit.threadId, hit.content.slice(0, 240));
    }
  }

  return {
    ids: ranked,
    reasonById,
    semanticAvailable,
    excerptById,
    lexicalEmpty,
    semanticDiscarded,
  };
}
