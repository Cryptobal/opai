import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

type Params = { id: string };

// ── GET: list user-uploaded attachments for a DTE ──
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_view")
  ) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const dte = await prisma.financeDte.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 },
    );
  }
  const attachments = await prisma.financeDteAttachment.findMany({
    where: { dteId: id, tenantId: ctx.tenantId, kind: "USER_UPLOAD" },
    orderBy: { uploadedAt: "asc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      publicUrl: true,
      storageKey: true,
      uploadedAt: true,
    },
  });
  return NextResponse.json({ success: true, data: attachments });
}

// ── POST: upload a user attachment to a DTE (draft or issued) ──
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_issue")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para adjuntar archivos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido" },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede 10 MB" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo no permitido. Permitidos: PDF, JPG, PNG, WebP, GIF" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadFile(
      buffer,
      file.name,
      file.type,
      "finance/dte",
      ctx.tenantId,
    );

    const attachment = await prisma.financeDteAttachment.create({
      data: {
        tenantId: ctx.tenantId,
        dteId: id,
        kind: "USER_UPLOAD",
        filename: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        uploadedBy: ctx.userId,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        publicUrl: true,
        storageKey: true,
        uploadedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (err) {
    console.error("[finance/dte/attachments] upload error", err);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el adjunto" },
      { status: 500 },
    );
  }
}
