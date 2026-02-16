import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const createOpsInstallationSchema = z.object({
  accountId: z.string().uuid("accountId inválido"),
  name: z.string().trim().min(1, "Nombre es requerido").max(200),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geoRadiusM: z.number().int().min(10).max(1000).optional(),
  teMontoClp: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        account: { type: "client", isActive: true },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        isActive: true,
        geoRadiusM: true,
        teMontoClp: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        account: { select: { id: true, name: true } },
        _count: {
          select: {
            opsPuestos: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: installations });
  } catch (error) {
    console.error("[OPS] Error listing installations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las instalaciones de Ops" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createOpsInstallationSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await prisma.crmAccount.findFirst({
      where: { id: body.accountId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const installation = await prisma.crmInstallation.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: body.accountId,
        name: body.name,
        address: body.address || null,
        city: body.city || null,
        commune: body.commune || null,
        lat: body.lat || null,
        lng: body.lng || null,
        geoRadiusM: body.geoRadiusM ?? 100,
        teMontoClp: body.teMontoClp ?? 0,
        notes: body.notes || null,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        isActive: true,
        geoRadiusM: true,
        teMontoClp: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        account: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: installation }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la instalación de Ops" },
      { status: 500 }
    );
  }
}
