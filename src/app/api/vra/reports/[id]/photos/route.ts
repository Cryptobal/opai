import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { uploadFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/vra/reports/[id]/photos
 * Lista las fotos cargadas/importadas al informe.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const photos = await prisma.vraReportPhoto.findMany({
      where: { reportId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, photos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/vra/reports/[id]/photos
 * Sube una foto (multipart/form-data) directamente al informe.
 * Acepta los campos: file (required), caption, gpsLat, gpsLng, takenAt.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Archivo no recibido" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Solo se aceptan imágenes" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Imagen demasiado grande (máx 10 MB)" }, { status: 400 });
    }

    const caption = (formData.get("caption") as string | null) ?? null;
    const gpsLatRaw = formData.get("gpsLat") as string | null;
    const gpsLngRaw = formData.get("gpsLng") as string | null;
    const takenAtRaw = formData.get("takenAt") as string | null;
    const gpsLat = gpsLatRaw ? Number(gpsLatRaw) : null;
    const gpsLng = gpsLngRaw ? Number(gpsLngRaw) : null;
    const takenAt = takenAtRaw ? new Date(takenAtRaw) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await uploadFile(
      buffer,
      file.name,
      file.type,
      `vra/${id}/photos`,
      ctx.tenantId,
    );

    const lastOrder = await prisma.vraReportPhoto.findFirst({
      where: { reportId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (lastOrder?.sortOrder ?? -10) + 10;

    const created = await prisma.vraReportPhoto.create({
      data: {
        reportId: id,
        storageKey: upload.storageKey,
        publicUrl: upload.publicUrl,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        caption,
        gpsLat: gpsLat !== null && !Number.isNaN(gpsLat) ? gpsLat : null,
        gpsLng: gpsLng !== null && !Number.isNaN(gpsLng) ? gpsLng : null,
        takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
        sortOrder,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, photo: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] upload photo error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
