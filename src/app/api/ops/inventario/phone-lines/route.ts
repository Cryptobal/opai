import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from '@/lib/require-module';
import { z } from "zod";

const createPhoneLineSchema = z.object({
  phoneNumber: z.string().min(1),
  carrier: z.string().min(1),
  planType: z.string().optional().nullable(),
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  label: z.string().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function normalizePhoneNumber(raw: string): string {
  // Remove spaces, dashes, dots, parentheses
  let n = raw.replace(/[\s\-().]/g, "");
  // If starts with 56 without +, add +
  if (n.startsWith("56") && !n.startsWith("+")) n = "+" + n;
  // If starts with 9 and is 9 digits, assume Chilean mobile
  if (/^9\d{8}$/.test(n)) n = "+56" + n;
  return n;
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const carrier = searchParams.get("carrier");
    const status = searchParams.get("status");
    const installationId = searchParams.get("installationId");
    const unassigned = searchParams.get("unassigned");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (carrier) where.carrier = carrier;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { label: { contains: search, mode: "insensitive" } },
      ];
    }

    const userId = searchParams.get("userId");

    const phoneLines = await prisma.inventoryPhoneLine.findMany({
      where,
      include: {
        asset: { select: { id: true, serialNumber: true } },
        assignments: {
          where: { returnedAt: null },
          include: {
            installation: { select: { id: true, name: true } },
            assignedToUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let filtered = phoneLines;

    if (installationId) {
      filtered = filtered.filter((pl) =>
        pl.assignments.some((a) => a.installationId === installationId)
      );
    }

    if (userId) {
      filtered = filtered.filter((pl) =>
        pl.assignments.some((a) => a.assignedToUserId === userId)
      );
    }

    if (unassigned === "true") {
      filtered = filtered.filter((pl) => pl.assignments.length === 0);
    }

    return NextResponse.json(filtered);
  } catch (e) {
    console.error("[inventario/phone-lines GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar líneas telefónicas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createPhoneLineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const phoneNumber = normalizePhoneNumber(parsed.data.phoneNumber);
    const carrier = parsed.data.carrier.toLowerCase().trim();

    // Check uniqueness within tenant
    const existing = await prisma.inventoryPhoneLine.findUnique({
      where: {
        tenantId_phoneNumber: { tenantId: ctx.tenantId, phoneNumber },
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe una línea con este número" },
        { status: 400 }
      );
    }

    const phoneLine = await prisma.inventoryPhoneLine.create({
      data: {
        tenantId: ctx.tenantId,
        phoneNumber,
        carrier,
        planType: parsed.data.planType ?? null,
        status: parsed.data.status ?? "active",
        label: parsed.data.label ?? null,
        assetId: parsed.data.assetId ?? null,
        notes: parsed.data.notes ?? null,
      },
      include: {
        asset: { select: { id: true, serialNumber: true } },
        assignments: {
          where: { returnedAt: null },
          include: {
            installation: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(phoneLine);
  } catch (e) {
    console.error("[inventario/phone-lines POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear línea telefónica" },
      { status: 500 }
    );
  }
}
