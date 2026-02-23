import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const createAssetSchema = z.object({
  variantId: z.string().uuid().optional().nullable(),
  serialNumber: z.string().optional(),
  phoneNumber: z.string().optional(),
  phoneCarrier: z.string().optional(),
  purchaseCost: z.number().optional().nullable(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const installationId = searchParams.get("installationId");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (status) where.status = status;

    const assets = await prisma.inventoryAsset.findMany({
      where,
      include: {
        variant: {
          include: { product: { select: { id: true, name: true } } },
        },
        assignments: {
          where: { returnedAt: null },
          include: {
            installation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let filtered = assets;
    if (installationId) {
      filtered = assets.filter(
        (a) => a.assignments.some((as) => as.installationId === installationId)
      );
    }

    return NextResponse.json(filtered);
  } catch (e) {
    console.error("[inventario/assets GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar activos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const asset = await prisma.inventoryAsset.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: parsed.data.variantId ?? null,
        serialNumber: parsed.data.serialNumber ?? null,
        phoneNumber: parsed.data.phoneNumber ?? null,
        phoneCarrier: parsed.data.phoneCarrier ?? null,
        purchaseCost: parsed.data.purchaseCost ?? null,
        purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null,
        notes: parsed.data.notes ?? null,
      },
      include: {
        variant: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json(asset);
  } catch (e) {
    console.error("[inventario/assets POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear activo" },
      { status: 500 }
    );
  }
}
