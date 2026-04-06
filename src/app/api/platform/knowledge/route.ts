import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/storage';
import { extractText } from '@/lib/knowledge/extract';
import { processDocument } from '@/lib/knowledge/processor';

export async function GET() {
  const session = await requirePlatformAuth();
  if (!session) return platformUnauthorized();

  const items = await prisma.knowledgeBase.findMany({
    where: { tenantId: null },
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
}

const ALLOWED_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await requirePlatformAuth();
  if (!session) return platformUnauthorized();

  try {
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

    if (!ALLOWED_TYPES.includes(file.type)) {
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

    // Upload to R2
    const upload = await uploadFile(buffer, file.name, file.type, 'knowledge');

    // Create knowledge base record
    const kb = await prisma.knowledgeBase.create({
      data: {
        tenantId: null,
        title,
        description,
        fileName: file.name,
        fileUrl: upload.publicUrl,
        fileSize: file.size,
        mimeType: file.type,
        status: 'processing',
        category,
        enabled: true,
        createdBy: session.email,
      },
    });

    // Process async (extract text + generate chunks/embeddings)
    extractText(buffer, file.type)
      .then((content) => processDocument({ knowledgeBaseId: kb.id, content }))
      .catch((err) => {
        console.error(`[Knowledge] Error processing ${kb.id}:`, err);
      });

    return NextResponse.json({ success: true, data: kb }, { status: 201 });
  } catch (error) {
    console.error('[Platform Knowledge] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al subir documento' },
      { status: 500 },
    );
  }
}
