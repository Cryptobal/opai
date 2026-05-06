/**
 * API: /api/finance/billing/dte/[id]/attachments
 *
 *  GET  → lista los adjuntos del DTE (sin bytes — solo metadata).
 *  POST → sube un nuevo adjunto (multipart/form-data).
 *         Campos: file (binario), kind (XML | PDF | EMAIL | OTHER opcional)
 *
 * Aplica tanto a DTEs RECIBIDOS como EMITIDOS. La autorización se basa en
 * tenantId del DTE (debe coincidir con el tenant del usuario).
 *
 * Storage: BYTEA en BD para MVP. Tope blando: 5MB por archivo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_PREFIXES = [
  "application/xml",
  "text/xml",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "message/rfc822", // .eml
  "application/octet-stream", // fallback
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function inferKind(filename: string, mime: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xml") || mime.includes("xml")) return "XML";
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "PDF";
  if (lower.endsWith(".eml") || mime === "message/rfc822") return "EMAIL";
  if (mime.startsWith("image/")) return "IMAGE";
  return "OTHER";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
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
    where: { dteId: id, tenantId: ctx.tenantId },
    select: {
      id: true,
      kind: true,
      filename: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      uploadedBy: true,
    },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({ success: true, data: attachments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  // Adjuntar archivos NO emite al SII; es un registro local de soporte.
  // Reusamos la capability de "create_draft" porque es la más cercana
  // a un cambio no-tributario en el módulo facturación.
  if (!hasCapability(perms, "facturacion_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permiso para adjuntar archivos al DTE" },
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body inválido (esperaba multipart/form-data)" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Falta archivo en el campo 'file'" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Archivo vacío" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `Archivo demasiado grande (${Math.round(file.size / 1024)}KB). Máximo 5MB.`,
      },
      { status: 400 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedMime(mimeType)) {
    return NextResponse.json(
      {
        success: false,
        error: `Tipo de archivo no permitido (${mimeType}). Permitidos: XML, PDF, imágenes, EML.`,
      },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  const kindRaw = formData.get("kind");
  const kind = typeof kindRaw === "string" && kindRaw
    ? kindRaw.toUpperCase()
    : inferKind(file.name, mimeType);

  const created = await prisma.financeDteAttachment.create({
    data: {
      dteId: id,
      tenantId: ctx.tenantId,
      kind,
      filename: file.name,
      mimeType,
      size: file.size,
      data,
      uploadedBy: ctx.userId,
    },
    select: {
      id: true,
      kind: true,
      filename: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      uploadedBy: true,
    },
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
