/**
 * API Route: /api/ops/tickets/[id]/attachments
 * POST — Upload attachments for email sending
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { uploadFile, getFileUrl } from "@/lib/storage";

type Params = { id: string };

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 10;

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

    // Verify ticket exists and belongs to tenant
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
        { success: false, error: `Máximo ${MAX_FILES} archivos por mensaje` },
        { status: 400 },
      );
    }

    const results: Array<{
      r2Key: string;
      fileName: string;
      size: number;
      contentType: string;
      url: string;
    }> = [];

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
      const prefix = `tickets/${ctx.tenantId}/${id}/outbound`;

      const result = await uploadFile(
        buffer,
        sanitizedName,
        file.type || "application/octet-stream",
        prefix,
        ctx.tenantId,
      );

      results.push({
        r2Key: result.storageKey,
        fileName: file.name,
        size: result.size,
        contentType: file.type || "application/octet-stream",
        url: result.publicUrl,
      });
    }

    return NextResponse.json({ success: true, data: results }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error uploading ticket attachments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron subir los archivos" },
      { status: 500 },
    );
  }
}
