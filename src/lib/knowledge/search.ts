import { prisma } from '@/lib/prisma';
import { generateEmbedding } from './processor';

interface SearchResult {
  content: string;
  score: number;
  knowledgeBaseTitle: string;
  chunkIndex: number;
}

/**
 * Busca en las bases de conocimiento relevantes para un tenant.
 * Incluye documentos globales (tenantId IS NULL) + documentos del tenant.
 * Returns results with score in 0-10 scale (consistent with help-chat-retrieval).
 */
export async function searchKnowledge(
  query: string,
  tenantId: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  type RawRow = {
    content: string;
    distance: number;
    knowledgeBaseTitle: string;
    chunkIndex: number;
  };

  const results = await prisma.$queryRawUnsafe<RawRow[]>(
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
      AND (kb.tenant_id IS NULL OR kb.tenant_id = $2)
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $3`,
    vectorLiteral,
    tenantId,
    limit,
  );

  // Convert cosine distance to similarity score on 0-10 scale
  // (consistent with help-chat-retrieval.ts semantic search scoring)
  return results
    .map((r) => ({
      content: r.content,
      score: Math.max(0, (1 - Number(r.distance)) * 10),
      knowledgeBaseTitle: r.knowledgeBaseTitle,
      chunkIndex: r.chunkIndex,
    }))
    .filter((r) => r.score >= 2); // Minimum relevance threshold
}
