/**
 * API Route: /api/ops/tickets/[id]/attachments
 *
 * Adjuntos persistidos a nivel de ticket. Independientes del composer
 * de email (que usa /api/ops/tickets/[id]/email-attachments para staging
 * efímero).
 *
 * GET   — lista los adjuntos del ticket.
 * POST  — sube uno o más archivos a R2 y crea filas OpsTicketAttachment.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { recordTicketEvent } from "@/lib/tickets-events";
import { resolveActorNames } from "@/lib/notifications/resolve-actor-name";

type Params = { id: string };

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 10;

type AttachmentDTO = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  storageKey: string;
  url: string;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

function safeUrl(storageKey: string): string {
  try {
    return getFileUrl(storageKey);
  } catch {
    return "";
  }
}

/* ── GET ── lista adjuntos del ticket ─────────────────────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const rows = await prisma.opsTicketAttachment.findMany({
      where: { ticketId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const uploaderIds = Array.from(
      new Set(rows.map((r) => r.uploadedBy).filter((v): v is string => !!v)),
    );
    const actorMap = uploaderIds.length
      ? await resolveActorNames(ctx.tenantId, uploaderIds)
      : new Map<string, { name: string }>();

    const data: AttachmentDTO[] = rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      fileSize: r.fileSize,
      contentType: r.contentType,
      storageKey: r.storageKey,
      url: safeUrl(r.storageKey),
      uploadedBy: r.uploadedBy,
      uploadedByName: r.uploadedBy
        ? actorMap.get(r.uploadedBy)?.name ?? null
        : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS] Error listing ticket attachments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los adjuntos" },
      { status: 500 },
    );
  }
}

/* ── POST ── sube + persiste adjuntos ─────────────────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se enviaron archivos" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Máximo ${MAX_FILES} archivos por subida` },
        { status: 400 },
      );
    }

    const created: AttachmentDTO[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `El archivo "${file.name}" excede el límite de 25 MB`,
          },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const prefix = `tickets/${ctx.tenantId}/${id}/attachments`;
      const contentType = file.type || "application/octet-stream";

      const upload = await uploadFile(
        buffer,
        sanitizedName,
        contentType,
        prefix,
        ctx.tenantId,
      );

      const row = await prisma.opsTicketAttachment.create({
        data: {
          tenantId: ctx.tenantId,
          ticketId: id,
          fileName: file.name,
          fileSize: upload.size,
          contentType,
          storageKey: upload.storageKey,
          uploadedBy: ctx.userId,
        },
      });

      created.push({
        id: row.id,
        fileName: row.fileName,
        fileSize: row.fileSize,
        contentType: row.contentType,
        storageKey: row.storageKey,
        url: safeUrl(row.storageKey),
        uploadedBy: row.uploadedBy,
        uploadedByName: null,
        createdAt: row.createdAt.toISOString(),
      });

      // Audit trail (best-effort — no rompe la subida si falla).
      try {
        await recordTicketEvent({
          tenantId: ctx.tenantId,
          ticketId: id,
          type: "attachment_added",
          actorId: ctx.userId,
          data: {
            attachmentId: row.id,
            fileName: row.fileName,
            fileSize: row.fileSize,
          },
        });
      } catch {
        // ignore
      }
    }

    // Hidratar nombre del uploader en respuesta.
    const actorMap = await resolveActorNames(ctx.tenantId, [ctx.userId]);
    const uploaderName = actorMap.get(ctx.userId)?.name ?? null;
    for (const a of created) a.uploadedByName = uploaderName;

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error uploading ticket attachments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron subir los archivos" },
      { status: 500 },
    );
  }
}
