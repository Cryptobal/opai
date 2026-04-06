/**
 * Seed script: Carga el documento base de conocimiento del producto en la DB.
 *
 * Uso:
 *   npx tsx scripts/seed-knowledge-base.ts
 */

import { prisma } from '@/lib/prisma';
import { processDocument } from '@/lib/knowledge/processor';
import { readFileSync } from 'fs';
import { join } from 'path';

async function seedKnowledgeBase() {
  console.log('Reading knowledge base document...');

  const content = readFileSync(
    join(process.cwd(), 'docs/opai-base-conocimiento-ia.md'),
    'utf-8',
  );

  // Check if already seeded
  const existing = await prisma.knowledgeBase.findFirst({
    where: {
      tenantId: null,
      category: 'producto',
      title: { contains: 'Base de Conocimiento del Producto' },
    },
  });

  if (existing) {
    console.log(`Knowledge base already exists: ${existing.id} (status: ${existing.status})`);
    console.log('Delete it first if you want to re-seed.');
    return;
  }

  console.log('Creating knowledge base record...');

  const kb = await prisma.knowledgeBase.create({
    data: {
      tenantId: null,
      title: 'OPAI — Base de Conocimiento del Producto',
      description:
        'Catálogo completo de módulos, funcionalidades, planes, add-ons y diferenciadores de OPAI.',
      fileName: 'opai-base-conocimiento-ia.md',
      fileUrl: 'local://docs/opai-base-conocimiento-ia.md',
      fileSize: Buffer.byteLength(content, 'utf-8'),
      mimeType: 'text/markdown',
      status: 'processing',
      category: 'producto',
      enabled: true,
    },
  });

  console.log(`Created KB: ${kb.id}`);
  console.log('Processing document (splitting + embeddings)...');

  const result = await processDocument({ knowledgeBaseId: kb.id, content });

  console.log(`Done! ${result.chunks} chunks created.`);
  console.log(`Knowledge base ${kb.id} is now ready.`);
}

seedKnowledgeBase()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
