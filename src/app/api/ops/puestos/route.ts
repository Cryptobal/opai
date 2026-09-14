import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createPuestoSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { assertPuestoCatalogOwnership } from "@/lib/ops/puesto-catalog";
import { createPuestoSalaryStructure } from "@/lib/ops/puesto-salary-structure";
import { syncPayrollItemForInstallation } from "@/modules/finance/cashflow/generators/payroll-sync";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;

    const puestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId ? { installationId } : {}),
      },
      include: {
        installation: {
          select: { id: true, name: true, teMontoClp: true },
        },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: puestos });
  } catch (error) {
    console.error("[OPS] Error listing puestos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los puestos operativos" },
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

    const parsed = await parseBody(request, createPuestoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const catalogForbidden = await assertPuestoCatalogOwnership(ctx.tenantId, {
      cargoId: body.cargoId,
      rolId: body.rolId,
      puestoTrabajoId: body.puestoTrabajoId,
      bonos: body.bonos,
    });
    if (catalogForbidden) return catalogForbidden;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: {
        id: true,
        teMontoClp: true,
        status: true,
        account: { select: { type: true, isActive: true } },
      },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }
    if (installation.account?.type !== "client") {
      return NextResponse.json(
        { success: false, error: "Solo puedes crear puestos para cuentas cliente" },
        { status: 400 }
      );
    }
    if (installation.status !== "active") {
      return NextResponse.json(
        { success: false, error: "La instalación debe estar activa para crear puestos" },
        { status: 400 }
      );
    }
    if (installation.account?.isActive === false) {
      return NextResponse.json(
        { success: false, error: "La cuenta debe estar activa para crear puestos" },
        { status: 400 }
      );
    }

    const puesto = await prisma.opsPuestoOperativo.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        name: body.name,
        puestoTrabajoId: body.puestoTrabajoId ?? null,
        cargoId: body.cargoId ?? null,
        rolId: body.rolId ?? null,
        shiftStart: body.shiftStart,
        shiftEnd: body.shiftEnd,
        weekdays: body.weekdays,
        requiredGuards: body.requiredGuards,
        baseSalary: body.baseSalary ?? null,
        teMontoClp: body.teMontoClp ?? installation.teMontoClp,
        activeFrom: body.activeFrom ? new Date(`${body.activeFrom}T00:00:00.000Z`) : new Date(),
        active: body.active ?? true,
        createdBy: ctx.userId,
      },
      include: {
        installation: {
          select: { id: true, name: true, teMontoClp: true },
        },
      },
    });

    // Estructura de sueldo + bonos + líquido estimado (helper compartido con
    // "Enviar dotación" del CPQ).
    if (body.baseSalary != null && body.baseSalary > 0) {
      await createPuestoSalaryStructure(prisma, {
        tenantId: ctx.tenantId,
        puestoId: puesto.id,
        baseSalary: body.baseSalary,
        colacion: body.colacion,
        movilizacion: body.movilizacion,
        gratificationType: body.gratificationType,
        gratificationCustomAmount: body.gratificationCustomAmount,
        effectiveFrom: body.activeFrom ? new Date(`${body.activeFrom}T00:00:00.000Z`) : new Date(),
        bonos: Array.isArray(body.bonos) ? body.bonos : [],
        createdBy: ctx.userId,
      });
    }

    await createOpsAuditLog(ctx, "ops.puesto.created", "ops_puesto", puesto.id, {
      installationId: body.installationId,
      name: body.name,
    });

    // Mantener flujo de caja en sync: recalcula el item PAYROLL de la
    // instalación. Best-effort, no bloquea la respuesta si falla.
    try {
      await syncPayrollItemForInstallation(ctx.tenantId, body.installationId);
    } catch (err) {
      console.error("[OPS] sync payroll cashflow failed:", err);
    }

    return NextResponse.json({ success: true, data: puesto }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating puesto:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el puesto operativo" },
      { status: 500 }
    );
  }
}
