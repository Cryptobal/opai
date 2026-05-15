import { prisma } from '@/lib/prisma';
import { generateEmbedding } from './processor';

interface SearchResult {
  content: string;
  score: number;
  knowledgeBaseTitle: string;
  chunkIndex: number;
}

type RawRow = {
  content: string;
  distance: number;
  knowledgeBaseTitle: string;
  chunkIndex: number;
};

function toSearchResults(rows: RawRow[]): SearchResult[] {
  return rows
    .map((r: RawRow) => ({
      content: r.content,
      score: Math.max(0, (1 - Number(r.distance)) * 10),
      knowledgeBaseTitle: r.knowledgeBaseTitle,
      chunkIndex: r.chunkIndex,
    }))
    .filter((r: SearchResult) => r.score >= 2);
}

/**
 * Busca en las bases de conocimiento relevantes para un tenant.
 * Incluye documentos globales (tenantId IS NULL) + documentos del tenant.
 */
export async function searchKnowledge(
  query: string,
  tenantId: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const results: RawRow[] = await prisma.$queryRawUnsafe(
    `SELECT
      kc.content,
      (kc.embedding <=> $1::vector) as distance,
      kb.title as "knowledgeBaseTitle",
      kc.chunk_index as "chunkIndex"
    FROM knowledge_chunks kc
    JOIN knowledge_bases kb ON kb.id = kc.knowledge_base_id
    WHERE kb.enabled = true
      AND kb.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (kb.tenant_id IS NULL OR kb.tenant_id::text = $2)
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $3`,
    vectorLiteral,
    tenantId,
    limit,
  );

  return toSearchResults(results);
}

/**
 * Busca solo en bases de conocimiento globales (tenantId IS NULL).
 * Usado por el chatbot de marketing (opai.cl) que no tiene tenant.
 */
export async function searchKnowledgeGlobal(
  query: string,
  limit: number = 3,
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const results: RawRow[] = await prisma.$queryRawUnsafe(
    `SELECT
      kc.content,
      (kc.embedding <=> $1::vector) as distance,
      kb.title as "knowledgeBaseTitle",
      kc.chunk_index as "chunkIndex"
    FROM knowledge_chunks kc
    JOIN knowledge_bases kb ON kb.id = kc.knowledge_base_id
    WHERE kb.enabled = true
      AND kb.status = 'ready'
      AND kb.tenant_id IS NULL
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $2`,
    vectorLiteral,
    limit,
  );

  return toSearchResults(results);
}
