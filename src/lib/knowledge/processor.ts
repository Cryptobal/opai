import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ProcessDocumentInput {
  knowledgeBaseId: string;
  content: string;
}

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

export function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end);
      const lastSentence = text.lastIndexOf('. ', end);

      if (lastParagraph > start + CHUNK_SIZE * 0.5) {
        end = lastParagraph + 2;
      } else if (lastSentence > start + CHUNK_SIZE * 0.5) {
        end = lastSentence + 2;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
  }

  return chunks.filter(c => c.length > 50);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

export async function processDocument({ knowledgeBaseId, content }: ProcessDocumentInput) {
  try {
    const chunks = splitIntoChunks(content);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      const chunkId = `kc_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const vectorLiteral = `[${embedding.join(",")}]`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO knowledge_chunks (id, knowledge_base_id, content, chunk_index, embedding, token_count, created_at)
         VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())`,
        chunkId,
        knowledgeBaseId,
        chunks[i],
        i,
        vectorLiteral,
        Math.ceil(chunks[i].length / 4),
      );
    }

    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { status: 'ready', chunkCount: chunks.length },
    });

    return { success: true, chunks: chunks.length };
  } catch (error) {
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        status: 'error',
        metadata: { error: String(error) },
      },
    });
    throw error;
  }
}
