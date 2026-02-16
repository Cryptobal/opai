import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const updateOpsInstallationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geoRadiusM: z.number().int().min(10).max(1000).optional(),
  teMontoClp: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
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
        marcacionCode: true,
        notes: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        account: { select: { id: true, name: true } },
        opsPuestos: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
    console.error("[OPS] Error fetching installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la instalación" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, updateOpsInstallationSchema);
    if (parsed.error) return parsed.error;

    const installation = await prisma.crmInstallation.update({
      where: { id },
      data: parsed.data,
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
        marcacionCode: true,
        notes: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        account: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
    console.error("[OPS] Error updating installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la instalación" },
      { status: 500 }
    );
  }
}
