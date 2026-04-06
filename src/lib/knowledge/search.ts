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
 */
export async function searchKnowledge(
  query: string,
  tenantId: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);

  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      kc.content,
      1 - (kc.embedding <=> ${queryEmbedding}::vector) as score,
      kb.title as "knowledgeBaseTitle",
      kc.chunk_index as "chunkIndex"
    FROM knowledge_chunks kc
    JOIN knowledge_bases kb ON kb.id = kc.knowledge_base_id
    WHERE kb.enabled = true
      AND kb.status = 'ready'
      AND (kb.tenant_id IS NULL OR kb.tenant_id = ${tenantId})
    ORDER BY kc.embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit}
  `;

  return results;
}
