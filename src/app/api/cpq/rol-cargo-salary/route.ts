/**
 * API Route: /api/cpq/rol-cargo-salary
 * GET - Mapa de sueldos preconfigurados del tenant (rolId → cargoId → {day,night})
 * PUT - Upsert de un cruce (rolId, cargoId) con salaryDay / salaryNight
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { getRolCargoSalaryMap } from "@/lib/cpq/rol-cargo-salary";

export async function GET() {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const map = await getRolCargoSalaryMap(ctx.tenantId);
    return NextResponse.json({ success: true, data: map });
  } catch (error) {
    console.error("Error fetching rol-cargo-salary map:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch salaries" },
      { status: 500 }
    );
  }
}

function toSafeInt(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const rolId = typeof body?.rolId === "string" ? body.rolId : null;
    const cargoId = typeof body?.cargoId === "string" ? body.cargoId : null;

    if (!rolId || !cargoId) {
      return NextResponse.json(
        { success: false, error: "rolId y cargoId son requeridos" },
        { status: 400 }
      );
    }

    const salaryDay = toSafeInt(body?.salaryDay);
    const salaryNight = toSafeInt(body?.salaryNight);

    // Validar que rol y cargo pertenezcan al tenant (o sean globales).
    const [rol, cargo] = await Promise.all([
      prisma.cpqRol.findFirst({
        where: { id: rolId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
        select: { id: true },
      }),
      prisma.cpqCargo.findFirst({
        where: { id: cargoId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
        select: { id: true },
      }),
    ]);
    if (!rol || !cargo) {
      return NextResponse.json(
        { success: false, error: "Rol o cargo no encontrado" },
        { status: 404 }
      );
    }

    const saved = await prisma.cpqRolCargoSalary.upsert({
      where: {
        tenantId_rolId_cargoId: { tenantId: ctx.tenantId, rolId, cargoId },
      },
      create: { tenantId: ctx.tenantId, rolId, cargoId, salaryDay, salaryNight },
      update: { salaryDay, salaryNight },
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error("Error upserting rol-cargo-salary:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save salary" },
      { status: 500 }
    );
  }
}

export const POST = PUT;
