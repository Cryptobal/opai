import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { extractText } from '@/lib/knowledge/extract';
import { processDocument } from '@/lib/knowledge/processor';
import { ensureKnowledgeTables } from '@/lib/knowledge/ensure-tables';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  await ensureKnowledgeTables();
  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!kb) {
    return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });
  }

  if (!kb.fileUrl) {
    return NextResponse.json(
      { success: false, error: 'Documento sin URL de archivo' },
      { status: 400 },
    );
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM knowledge_chunks WHERE knowledge_base_id = $1`,
    id,
  );
  await prisma.knowledgeBase.update({
    where: { id },
    data: { status: 'processing', chunkCount: 0, metadata: {} },
  });

  try {
    const res = await fetch(kb.fileUrl);
    if (!res.ok) {
      throw new Error(`No se pudo descargar el archivo (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const content = await extractText(buffer, kb.mimeType);
    if (!content || !content.trim()) {
      throw new Error('No se pudo extraer texto del archivo (contenido vacío).');
    }
    const processed = await processDocument({ knowledgeBaseId: id, content });
    const updated = await prisma.knowledgeBase.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: updated, processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Knowledge] Reprocess error ${id}:`, err);
    await prisma.knowledgeBase
      .update({
        where: { id },
        data: { status: 'error', metadata: { error: message } },
      })
      .catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
