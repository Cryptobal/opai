import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const photos = await prisma.opsSupervisionPhoto.findMany({
      where: { visitId: id, tenantId: ctx.tenantId },
      orderBy: { takenAt: "asc" },
    });

    return NextResponse.json({ success: true, data: photos });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching photos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las fotos" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para subir fotos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      select: { id: true },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawCategoryId = (formData.get("categoryId") as string | null) ?? null;
    // Default category IDs (e.g. "default-puesto") are not valid UUIDs — set to null
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const categoryId = rawCategoryId && UUID_RE.test(rawCategoryId) ? rawCategoryId : null;
    const categoryName = (formData.get("categoryName") as string | null) ?? null;
    const gpsLat = formData.get("gpsLat") as string | null;
    const gpsLng = formData.get("gpsLng") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Formato inválido. Solo imágenes JPG, PNG, WEBP o GIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede 10MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadFile(buffer, file.name, file.type, "ops-supervision");

    const photo = await prisma.opsSupervisionPhoto.create({
      data: {
        tenantId: ctx.tenantId,
        visitId: id,
        categoryId,
        categoryName,
        photoUrl: uploaded.publicUrl,
        storageKey: uploaded.storageKey,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        gpsLat: gpsLat ? parseFloat(gpsLat) : null,
        gpsLng: gpsLng ? parseFloat(gpsLng) : null,
      },
    });

    return NextResponse.json({ success: true, data: photo }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error uploading categorized photo:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir la foto" },
      { status: 500 },
    );
  }
}
