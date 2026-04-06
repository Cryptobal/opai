import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/storage';
import { extractText } from '@/lib/knowledge/extract';
import { processDocument } from '@/lib/knowledge/processor';
import { ensureKnowledgeTables } from '@/lib/knowledge/ensure-tables';
import { resolveUploadedMime } from '@/lib/knowledge/upload-mime';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requirePlatformAuth();
  if (!session) return platformUnauthorized();

  try {
    await ensureKnowledgeTables();
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
  } catch (error) {
    console.error('[Platform Knowledge GET]', error);
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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await requirePlatformAuth();
  if (!session) return platformUnauthorized();

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

    // Upload to R2
    const upload = await uploadFile(buffer, file.name, mimeType, 'knowledge');

    // Create knowledge base record
    const kb = await prisma.knowledgeBase.create({
      data: {
        tenantId: null,
        title,
        description,
        fileName: file.name,
        fileUrl: upload.publicUrl,
        fileSize: file.size,
        mimeType,
        status: 'processing',
        category,
        enabled: true,
        createdBy: session.email,
      },
    });

    // Procesar SINCRÓNICAMENTE: en serverless las promesas fire-and-forget
    // se cancelan cuando la request termina, dejando el documento atascado
    // en `processing` para siempre. Mejor esperar el resultado y reportarlo.
    let processed: { success: boolean; chunks: number } | null = null;
    let processError: string | null = null;
    try {
      const content = await extractText(buffer, mimeType);
      if (!content || !content.trim()) {
        throw new Error('No se pudo extraer texto del archivo (contenido vacío).');
      }
      processed = await processDocument({ knowledgeBaseId: kb.id, content });
    } catch (err) {
      processError = err instanceof Error ? err.message : String(err);
      console.error(`[Knowledge] Error processing ${kb.id}:`, err);
      // Asegurar que el estado quede en 'error' incluso si falla extractText
      // (processDocument ya hace esto por su cuenta, pero lo cubrimos por si
      // el error ocurre antes de que processDocument llegue a ejecutarse).
      await prisma.knowledgeBase
        .update({
          where: { id: kb.id },
          data: { status: 'error', metadata: { error: processError } },
        })
        .catch((updateErr: unknown) => {
          console.error(`[Knowledge] Error marking ${kb.id} as error:`, updateErr);
        });
    }

    const finalKb = await prisma.knowledgeBase.findUnique({ where: { id: kb.id } });

    return NextResponse.json(
      {
        success: true,
        data: finalKb ?? kb,
        processed: processed ?? undefined,
        processError: processError ?? undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[Platform Knowledge] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al subir documento' },
      { status: 500 },
    );
  }
}
