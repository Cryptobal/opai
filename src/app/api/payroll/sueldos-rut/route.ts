/**
 * GET /api/payroll/sueldos-rut
 * Lists all guards that have a RUT salary override (sueldo por RUT).
 * Returns guard info + salary structure details.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const showInactive = req.nextUrl.searchParams.get("inactive") === "true";

    const structures = await prisma.payrollSalaryStructure.findMany({
      where: {
        tenantId: ctx.tenantId,
        sourceType: "GUARDIA_RUT",
        ...(showInactive ? {} : { isActive: true }),
      },
      include: {
        bonos: {
          where: { isActive: true },
          include: {
            bonoCatalog: {
              select: { name: true, bonoType: true, isTaxable: true },
            },
          },
        },
        guardias: {
          select: {
            id: true,
            status: true,
            persona: {
              select: { rut: true, firstName: true, lastName: true },
            },
            currentInstallation: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = structures
      .filter((s) => s.guardias.length > 0)
      .map((s) => {
        const g = s.guardias[0];
        return {
          structureId: s.id,
          guardiaId: g.id,
          guardiaStatus: g.status,
          rut: g.persona.rut || "",
          name: `${g.persona.firstName} ${g.persona.lastName}`,
          installationName: g.currentInstallation?.name || null,
          installationId: g.currentInstallation?.id || null,
          baseSalary: Number(s.baseSalary),
          colacion: Number(s.colacion),
          movilizacion: Number(s.movilizacion),
          gratificationType: s.gratificationType,
          gratificationCustomAmount: s.gratificationCustomAmount ? Number(s.gratificationCustomAmount) : 0,
          netSalaryEstimate: s.netSalaryEstimate ? Number(s.netSalaryEstimate) : null,
          isActive: s.isActive,
          effectiveFrom: s.effectiveFrom,
          effectiveUntil: s.effectiveUntil,
          bonos: s.bonos.map((b) => ({
            name: b.bonoCatalog.name,
            bonoType: b.bonoCatalog.bonoType,
            isTaxable: b.bonoCatalog.isTaxable,
            amount: b.overrideAmount ? Number(b.overrideAmount) : null,
            percentage: b.overridePercentage ? Number(b.overridePercentage) : null,
          })),
        };
      });

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[GET /api/payroll/sueldos-rut]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
