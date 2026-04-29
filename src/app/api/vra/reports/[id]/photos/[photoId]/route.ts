import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { deleteFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  caption: z.string().max(2000).optional().nullable(),
  linkedFindingIds: z.array(z.string().uuid()).optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * PUT /api/vra/reports/[id]/photos/[photoId]
 * Edita caption y vinculación a hallazgos.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, photoId } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const photo = await prisma.vraReportPhoto.findFirst({
      where: { id: photoId, reportId: id },
    });
    if (!photo) {
      return NextResponse.json({ success: false, error: "Foto no encontrada" }, { status: 404 });
    }

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const updated = await prisma.vraReportPhoto.update({
      where: { id: photoId },
      data: {
        caption: data.caption === undefined ? undefined : data.caption,
        linkedFindingIds: data.linkedFindingIds ?? undefined,
        sortOrder: data.sortOrder ?? undefined,
      },
    });

    return NextResponse.json({ success: true, photo: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/vra/reports/[id]/photos/[photoId]
 * Borra la foto del informe y del bucket R2 si NO fue importada de una visita.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, photoId } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const photo = await prisma.vraReportPhoto.findFirst({
      where: { id: photoId, reportId: id },
    });
    if (!photo) {
      return NextResponse.json({ success: false, error: "Foto no encontrada" }, { status: 404 });
    }

    // Solo borrar de R2 si fue subida directamente al informe (no importada de visita)
    if (!photo.importedFromPhotoId) {
      try {
        await deleteFile(photo.storageKey);
      } catch (err) {
        console.warn("[VRA] No se pudo borrar foto en R2:", err);
      }
    }

    await prisma.vraReportPhoto.delete({ where: { id: photoId } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
