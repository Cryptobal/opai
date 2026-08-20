/**
 * GET /api/payroll/sueldos-rut
 * Lists all guards that have a RUT salary override (sueldo por RUT).
 * Returns guard info + salary structure details.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canViewSensitiveSalary, isSalarySensitiveCargo } from "@/lib/salary-privacy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const modCheck = await requireTenantModule('payroll');
  if (!modCheck.authorized) return modCheck.response;
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
            asignaciones: {
              where: { isActive: true },
              orderBy: { startDate: "desc" },
              take: 1,
              select: {
                puesto: { select: { name: true, cargo: { select: { name: true, salarySensitive: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const canSeeSensitive = canViewSensitiveSalary(await getPermissionsFromAuth(ctx));
    const data = structures
      .filter((s) => s.guardias.length > 0)
      .map((s) => {
        const g = s.guardias[0];
        const puesto = g.asignaciones[0]?.puesto;
        const salarySensitive = isSalarySensitiveCargo({
          salarySensitive: puesto?.cargo?.salarySensitive,
          names: [puesto?.cargo?.name, puesto?.name],
        });
        const hide = salarySensitive && !canSeeSensitive;
        return {
          structureId: s.id,
          guardiaId: g.id,
          guardiaStatus: g.status,
          rut: g.persona.rut || "",
          name: `${g.persona.firstName} ${g.persona.lastName}`,
          installationName: g.currentInstallation?.name || null,
          installationId: g.currentInstallation?.id || null,
          salarySensitive,
          salaryHidden: hide,
          baseSalary: hide ? 0 : Number(s.baseSalary),
          colacion: hide ? 0 : Number(s.colacion),
          movilizacion: hide ? 0 : Number(s.movilizacion),
          gratificationType: s.gratificationType,
          gratificationCustomAmount: hide
            ? 0
            : s.gratificationCustomAmount
              ? Number(s.gratificationCustomAmount)
              : 0,
          netSalaryEstimate: hide
            ? null
            : s.netSalaryEstimate
              ? Number(s.netSalaryEstimate)
              : null,
          isActive: s.isActive,
          effectiveFrom: s.effectiveFrom,
          effectiveUntil: s.effectiveUntil,
          bonos: hide
            ? []
            : s.bonos.map((b) => ({
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
