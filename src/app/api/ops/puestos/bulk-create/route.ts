import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { bulkCreatePuestosSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { syncPayrollItemForInstallation } from "@/modules/finance/cashflow/generators/payroll-sync";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, bulkCreatePuestosSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: { id: true, teMontoClp: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const created = await prisma.$transaction(
      body.puestos.map((puesto) =>
        prisma.opsPuestoOperativo.create({
          data: {
            tenantId: ctx.tenantId,
            installationId: body.installationId,
            name: puesto.name,
            shiftStart: puesto.shiftStart,
            shiftEnd: puesto.shiftEnd,
            weekdays: puesto.weekdays,
            requiredGuards: puesto.requiredGuards,
            teMontoClp: puesto.teMontoClp ?? installation.teMontoClp,
            active: puesto.active ?? true,
            createdBy: ctx.userId,
          },
        })
      )
    );

    await createOpsAuditLog(ctx, "ops.puesto.bulk_created", "ops_puesto", undefined, {
      installationId: body.installationId,
      total: created.length,
    });

    try {
      await syncPayrollItemForInstallation(ctx.tenantId, body.installationId);
    } catch (err) {
      console.error("[OPS] sync payroll cashflow failed:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        count: created.length,
        puestos: created,
      },
    });
  } catch (error) {
    console.error("[OPS] Error bulk creating puestos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la estructura de puestos" },
      { status: 500 }
    );
  }
}
