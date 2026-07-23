import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import { fetchGmailAttachment } from "@/modules/crm/email/gmail-attachment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ threadId: string }> };

/**
 * POST — guarda un adjunto del correo como Documento del negocio/cuenta y (si
 * es negocio) lo encola a la carpeta Drive del deal (cron flush-drive-outbox).
 * Idempotente por (entidad, fileName, size).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;

  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    attachmentId?: string;
    dealId?: string;
    accountId?: string;
    filename?: string;
    size?: number;
  };
  if (!body.messageId || !body.attachmentId) {
    return NextResponse.json({ error: "messageId y attachmentId requeridos" }, { status: 400 });
  }
  if (!body.dealId && !body.accountId) {
    return NextResponse.json({ error: "Indicá una cuenta o un negocio" }, { status: 400 });
  }

  // Validar pertenencia al tenant + coherencia negocio↔cuenta.
  let entityType: "deal" | "account";
  let entityId: string;
  let dealForDrive: string | null = null;
  if (body.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: body.dealId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
    if (body.accountId && deal.accountId !== body.accountId) {
      return NextResponse.json({ error: "El negocio no pertenece a la cuenta" }, { status: 400 });
    }
    entityType = "deal";
    entityId = deal.id;
    dealForDrive = deal.id;
  } else {
    const account = await prisma.crmAccount.findFirst({
      where: { id: body.accountId as string, tenantId },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    entityType = "account";
    entityId = account.id;
  }

  const att = await fetchGmailAttachment({
    tenantId,
    userId,
    threadId,
    messageId: body.messageId,
    attachmentId: body.attachmentId,
    filenameHint: typeof body.filename === "string" ? body.filename : null,
    sizeHint: typeof body.size === "number" && body.size > 0 ? body.size : null,
  });
  if (!att.ok) return NextResponse.json({ error: att.error }, { status: att.status });

  // Idempotencia: mismo fileName + size ya vinculado a la entidad.
  const dup = await prisma.crmFileLink.findFirst({
    where: { tenantId, entityType, entityId, file: { fileName: att.filename, size: att.size } },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ already: true });

  const uploaded = await uploadFile(att.buffer, att.filename, att.mimeType, "crm", tenantId);
  const crmFile = await prisma.crmFile.create({
    data: {
      tenantId,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      storageProvider: STORAGE_PROVIDER,
      storageKey: uploaded.storageKey,
      createdBy: userId,
    },
  });
  await prisma.crmFileLink.create({
    data: { tenantId, fileId: crmFile.id, entityType, entityId, folderId: null },
  });

  // Espejo a la carpeta Drive del negocio (cuentas no se espejan). No bloquea.
  if (dealForDrive) {
    void enqueueCrmFileToDrive({
      tenantId,
      entityType: "deal",
      entityId: dealForDrive,
      file: {
        id: crmFile.id,
        storageKey: crmFile.storageKey,
        fileName: crmFile.fileName,
        mimeType: crmFile.mimeType,
      },
    });
  }

  return NextResponse.json({ ok: true, fileId: crmFile.id, entityType, entityId });
}
