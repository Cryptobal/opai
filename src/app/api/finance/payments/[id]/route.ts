import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";

type Params = { id: string };

// ── GET: payment detail with rendiciones ──

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "pagos")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver pagos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const payment = await prisma.financePayment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rendiciones: {
          include: {
            item: { select: { id: true, name: true } },
            costCenter: { select: { id: true, name: true } },
            trip: {
              select: {
                id: true,
                distanceKm: true,
                startAddress: true,
                endAddress: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Pago no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: payment });
  } catch (error) {
    console.error("[Finance] Error getting payment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el pago" },
      { status: 500 },
    );
  }
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// ── POST: upload payment receipt ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_pay")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para gestionar pagos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const payment = await prisma.financePayment.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Pago no encontrado" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo es requerido" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el tamaño máximo de 10MB" },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de archivo no permitido. Permitidos: JPG, PNG, WebP, PDF" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadResult = await uploadFile(buffer, file.name, file.type, "finance/receipts");

    const updated = await prisma.financePayment.update({
      where: { id },
      data: {
        receiptFileName: uploadResult.fileName,
        receiptUrl: uploadResult.publicUrl,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance] Error uploading payment receipt:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el comprobante" },
      { status: 500 },
    );
  }
}
