import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import {
  deleteFile,
  getPresignedUploadUrl,
} from "@/lib/storage";
import { requireTenantModule } from "@/lib/require-module";
import {
  MAX_EMAIL_ATTACHMENT_BYTES,
  isBlockedEmailAttachment,
  isOwnedEmailAttachmentKey,
  sanitizeEmailAttachmentName,
} from "@/modules/crm/email/gmail-outbound-attachments";

const presignSchema = z.object({
  fileName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().positive().max(MAX_EMAIL_ATTACHMENT_BYTES),
});

const deleteSchema = z.object({
  storageKey: z.string().min(1).max(1_000),
});

async function authorize() {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return { response: mod.response, ctx: null };
  const ctx = await requireAuth();
  if (!ctx) return { response: unauthorized(), ctx: null };
  const forbidden = await requireCrmEdit(ctx);
  if (forbidden) return { response: forbidden, ctx: null };
  return { response: null, ctx };
}

export async function POST(request: NextRequest) {
  const access = await authorize();
  if (!access.ctx) return access.response;
  const parsed = await parseBody(request, presignSchema);
  if (parsed.error) return parsed.error;

  const connected = await prisma.crmEmailAccount.count({
    where: {
      tenantId: access.ctx.tenantId,
      userId: access.ctx.userId,
      provider: "gmail",
      status: "active",
    },
  });
  if (connected === 0) {
    return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  }

  const fileName = sanitizeEmailAttachmentName(parsed.data.fileName);
  if (isBlockedEmailAttachment(fileName, parsed.data.mimeType)) {
    return NextResponse.json(
      { error: "Gmail no permite adjuntar este tipo de archivo" },
      { status: 400 },
    );
  }

  const upload = await getPresignedUploadUrl({
    fileName,
    mimeType: parsed.data.mimeType,
    prefix: `crm-email-staged/${access.ctx.userId}`,
    tenantId: access.ctx.tenantId,
  });
  return NextResponse.json({
    success: true,
    data: {
      ...upload,
      fileName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const access = await authorize();
  if (!access.ctx) return access.response;
  const parsed = await parseBody(request, deleteSchema);
  if (parsed.error) return parsed.error;
  if (
    !isOwnedEmailAttachmentKey({
      storageKey: parsed.data.storageKey,
      tenantId: access.ctx.tenantId,
      userId: access.ctx.userId,
    })
  ) {
    return NextResponse.json({ error: "Archivo no autorizado" }, { status: 403 });
  }
  await deleteFile(parsed.data.storageKey);
  return NextResponse.json({ success: true });
}
