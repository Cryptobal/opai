/**
 * Embeddings de correo (A07, Prompt D): chunking de cuerpos + pgvector para
 * búsqueda semántica y Q&A sobre la casilla.
 *
 *  - Indexación INCREMENTAL enganchada al sync (mensajes nuevos, presupuesto
 *    corto). Kill-switch: EMAIL_EMBEDDINGS_DISABLED=1.
 *  - Backfill batcheado OPT-IN por script (scripts/backfill-email-embeddings.ts)
 *    que reporta el costo estimado antes de correr.
 *  - `tenant_id` en TODA fila y TODO retrieval (tests de aislamiento).
 *  - Costos visibles: logAiUsage feature "correo-embeddings" con tokens
 *    REALES del response de OpenAI.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantOpenAIClient } from "@/lib/ai/tenant-openai";
import { logAiUsage } from "@/lib/platform-ai-service";

export const EMBEDDING_MODEL = "text-embedding-3-small";
/** USD por 1M tokens del modelo de embeddings (para estimaciones). */
export const EMBEDDING_USD_PER_MTOKEN = 0.02;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH = 64;

export function emailEmbeddingsDisabled(): boolean {
  return process.env.EMAIL_EMBEDDINGS_DISABLED === "1";
}

/** Texto plano del mensaje (textBody o HTML sin tags), limpio y acotado. */
export function messagePlainText(message: {
  textBody: string | null;
  htmlBody: string | null;
}): string {
  const raw =
    message.textBody?.trim() ||
    message.htmlBody?.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ") ||
    "";
  return raw.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40_000);
}

/** Chunking con corte preferente en párrafo/oración (mismo criterio que knowledge). */
export function splitEmailChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end < text.length) {
      const lastSentence = text.lastIndexOf(". ", end);
      if (lastSentence > start + CHUNK_SIZE * 0.5) end = lastSentence + 2;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 40);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

type MessageToIndex = {
  id: string;
  threadId: string;
  emailAccountId: string | null;
  textBody: string | null;
  htmlBody: string | null;
  subject: string;
};

/**
 * Indexa un lote de mensajes: chunkea, embebe en batch y persiste. Idempotente
 * por (messageId, chunkIndex) + contentHash (no re-embebe lo que no cambió).
 * Devuelve chunks escritos y tokens reales consumidos.
 */
export async function indexEmailMessages(params: {
  tenantId: string;
  messages: MessageToIndex[];
  deadline?: number;
}): Promise<{ chunks: number; tokens: number }> {
  const { tenantId } = params;
  let written = 0;
  let tokens = 0;

  type PendingChunk = {
    messageId: string;
    threadId: string;
    emailAccountId: string;
    chunkIndex: number;
    content: string;
    contentHash: string;
  };
  const pending: PendingChunk[] = [];

  for (const message of params.messages) {
    if (!message.emailAccountId) continue;
    const text = messagePlainText(message);
    if (!text) continue;
    // El asunto entra al primer chunk: mejora el retrieval de hilos cortos.
    const chunks = splitEmailChunks(`${message.subject}\n${text}`);
    const existing = await prisma.crmEmailChunk.findMany({
      where: { tenantId, messageId: message.id },
      select: { chunkIndex: true, contentHash: true },
    });
    const existingByIndex = new Map(existing.map((c) => [c.chunkIndex, c.contentHash]));
    chunks.forEach((content, index) => {
      const contentHash = hashContent(content);
      if (existingByIndex.get(index) === contentHash) return;
      pending.push({
        messageId: message.id,
        threadId: message.threadId,
        emailAccountId: message.emailAccountId!,
        chunkIndex: index,
        content,
        contentHash,
      });
    });
  }

  const client = await getTenantOpenAIClient(tenantId);
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    if (params.deadline && Date.now() >= params.deadline) break;
    const batch = pending.slice(i, i + EMBED_BATCH);
    const startedAt = Date.now();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.content),
    });
    const usedTokens = response.usage?.total_tokens ?? 0;
    tokens += usedTokens;
    logAiUsage({
      tenantId,
      providerType: "openai",
      model: EMBEDDING_MODEL,
      feature: "correo-embeddings",
      inputTokens: usedTokens,
      outputTokens: 0,
      estimatedCost: (usedTokens / 1_000_000) * EMBEDDING_USD_PER_MTOKEN,
      durationMs: Date.now() - startedAt,
      metadata: { chunks: batch.length },
    });
    for (let j = 0; j < batch.length; j += 1) {
      const chunk = batch[j];
      const embedding = response.data[j]?.embedding;
      if (!embedding) continue;
      const vectorLiteral = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO crm.email_chunks
           (tenant_id, email_account_id, thread_id, message_id, chunk_index, content, content_hash, embedding, token_count)
         VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::vector, $9)
         ON CONFLICT (message_id, chunk_index)
         DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
                       embedding = EXCLUDED.embedding, token_count = EXCLUDED.token_count`,
        tenantId,
        chunk.emailAccountId,
        chunk.threadId,
        chunk.messageId,
        chunk.chunkIndex,
        chunk.content,
        chunk.contentHash,
        vectorLiteral,
        Math.ceil(chunk.content.length / 4),
      );
      written += 1;
    }
  }
  return { chunks: written, tokens };
}

/**
 * Indexación incremental (enganchada al sync de mantenimiento): mensajes
 * recientes de la casilla que aún no tienen chunks. Best-effort, presupuesto
 * corto; nunca lanza.
 */
export async function indexRecentEmailMessages(params: {
  tenantId: string;
  emailAccountId: string;
  deadline: number;
  limit?: number;
}): Promise<{ chunks: number; tokens: number }> {
  if (emailEmbeddingsDisabled() || !process.env.OPENAI_API_KEY) {
    return { chunks: 0, tokens: 0 };
  }
  try {
    const messages = await prisma.crmEmailMessage.findMany({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        isDraft: false,
        chunksIndexed: false,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(params.limit ?? 40, 100),
      select: {
        id: true,
        threadId: true,
        emailAccountId: true,
        textBody: true,
        htmlBody: true,
        subject: true,
      },
    });
    if (messages.length === 0) return { chunks: 0, tokens: 0 };
    const result = await indexEmailMessages({
      tenantId: params.tenantId,
      messages,
      deadline: params.deadline,
    });
    await prisma.crmEmailMessage.updateMany({
      where: { id: { in: messages.map((m) => m.id) } },
      data: { chunksIndexed: true },
    });
    return result;
  } catch (err) {
    console.warn("[correo-embeddings] indexación incremental falló:", err);
    return { chunks: 0, tokens: 0 };
  }
}

export type SemanticHit = {
  threadId: string;
  messageId: string;
  content: string;
  distance: number;
};

/**
 * Retrieval semántico SIEMPRE acotado por tenant + casilla. Devuelve los
 * chunks más cercanos con su distancia coseno.
 *
 * Con `folderSql` / `structuralSql` hace JOIN a `crm.email_threads t` y aplica
 * los mismos filtros estructurales que la rama léxica. Sobre-recupera por
 * defecto (`limit * 4`) para compensar el post-filtrado de HNSW.
 */
export async function semanticSearchChunks(params: {
  tenantId: string;
  emailAccountId: string;
  query: string;
  limit?: number;
  /** Condición de carpeta sobre alias `t` (folderWhereSql). */
  folderSql?: Prisma.Sql;
  /** Condiciones estructurales sobre alias `t`. */
  structuralSql?: Prisma.Sql[];
  /** Sobre-recuperación ante post-filtrado HNSW (default limit*4, techo 200). */
  overfetch?: number;
}): Promise<SemanticHit[]> {
  if (emailEmbeddingsDisabled() || !process.env.OPENAI_API_KEY) {
    return [];
  }
  const startedAt = Date.now();
  const client = await getTenantOpenAIClient(params.tenantId);
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: params.query.slice(0, 4_000),
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) return [];
  logAiUsage({
    tenantId: params.tenantId,
    providerType: "openai",
    model: EMBEDDING_MODEL,
    feature: "correo-semantic-query",
    inputTokens: response.usage?.total_tokens ?? 0,
    outputTokens: 0,
    estimatedCost:
      ((response.usage?.total_tokens ?? 0) / 1_000_000) * EMBEDDING_USD_PER_MTOKEN,
    durationMs: Date.now() - startedAt,
  });
  const baseLimit = Math.min(params.limit ?? 24, 50);
  const hasThreadFilters =
    Boolean(params.folderSql) || (params.structuralSql?.length ?? 0) > 0;
  // Con filtros, HNSW post-filtra: sobre-recuperar para no quedar cortos.
  const fetchLimit = hasThreadFilters
    ? Math.min(params.overfetch ?? Math.max(baseLimit * 4, baseLimit), 200)
    : baseLimit;
  const vectorLiteral = `[${embedding.join(",")}]`;

  const conds: Prisma.Sql[] = [
    Prisma.sql`c.tenant_id = ${params.tenantId}`,
    Prisma.sql`c.email_account_id = ${params.emailAccountId}::uuid`,
    Prisma.sql`c.embedding IS NOT NULL`,
  ];
  if (params.folderSql) conds.push(params.folderSql);
  if (params.structuralSql?.length) conds.push(...params.structuralSql);

  // Vector como parámetro tipado (no concatenar entrada del usuario).
  const rows = hasThreadFilters
    ? await prisma.$queryRaw<
        Array<{ thread_id: string; message_id: string; content: string; distance: number }>
      >(Prisma.sql`
        SELECT c.thread_id, c.message_id, c.content,
               (c.embedding <=> ${vectorLiteral}::vector) AS distance
        FROM crm.email_chunks c
        JOIN crm.email_threads t ON t.id = c.thread_id
        WHERE ${Prisma.join(conds, " AND ")}
        ORDER BY c.embedding <=> ${vectorLiteral}::vector
        LIMIT ${fetchLimit}
      `)
    : await prisma.$queryRaw<
        Array<{ thread_id: string; message_id: string; content: string; distance: number }>
      >(Prisma.sql`
        SELECT c.thread_id, c.message_id, c.content,
               (c.embedding <=> ${vectorLiteral}::vector) AS distance
        FROM crm.email_chunks c
        WHERE ${Prisma.join(conds, " AND ")}
        ORDER BY c.embedding <=> ${vectorLiteral}::vector
        LIMIT ${fetchLimit}
      `);

  return rows.map((r) => ({
    threadId: r.thread_id,
    messageId: r.message_id,
    content: r.content,
    distance: Number(r.distance),
  }));
}

/** IDs de hilos rankeados por su mejor chunk (para la lista de la bandeja). */
export function rankThreadsFromHits(hits: SemanticHit[], limit: number): string[] {
  const best = new Map<string, number>();
  for (const hit of hits) {
    const current = best.get(hit.threadId);
    if (current === undefined || hit.distance < current) best.set(hit.threadId, hit.distance);
  }
  return Array.from(best.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([threadId]) => threadId);
}
