import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/storage';
import { extractText } from '@/lib/knowledge/extract';
import { processDocument } from '@/lib/knowledge/processor';
import { ensureKnowledgeTables } from '@/lib/knowledge/ensure-tables';
import { resolveUploadedMime } from '@/lib/knowledge/upload-mime';

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  try {
    await ensureKnowledgeTables();
    const items = await prisma.knowledgeBase.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        fileName: true,
        fileUrl: true,
        fileSize: true,
        mimeType: true,
        status: true,
        chunkCount: true,
        category: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('[Tenant Knowledge GET]', error);
    return NextResponse.json(
      {
        success: false,
        error:
          'No se pudo cargar las bases de conocimiento. Verifica la base de datos o los logs del servidor.',
      },
      { status: 500 },
    );
  }
}

const ALLOWED_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  try {
    await ensureKnowledgeTables();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const category = formData.get('category') as string | null;
    const description = formData.get('description') as string | null;

    if (!file || !title) {
      return NextResponse.json(
        { success: false, error: 'Se requiere archivo y título' },
        { status: 400 },
      );
    }

    const mimeType = resolveUploadedMime(file);
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { success: false, error: 'Tipo de archivo no soportado. Usa PDF, Markdown, TXT o DOCX.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'El archivo excede 10MB' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const upload = await uploadFile(buffer, file.name, mimeType, 'knowledge', ctx.tenantId);

    const kb = await prisma.knowledgeBase.create({
      data: {
        tenantId: ctx.tenantId,
        title,
        description,
        fileName: file.name,
        fileUrl: upload.publicUrl,
        fileSize: file.size,
        mimeType,
        status: 'processing',
        category,
        enabled: true,
        createdBy: ctx.userId,
      },
    });

    extractText(buffer, mimeType)
      .then((content) => processDocument({ knowledgeBaseId: kb.id, content }))
      .catch((err) => {
        console.error(`[Knowledge] Error processing ${kb.id}:`, err);
      });

    return NextResponse.json({ success: true, data: kb }, { status: 201 });
  } catch (error) {
    console.error('[Tenant Knowledge] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al subir documento' },
      { status: 500 },
    );
  }
}
