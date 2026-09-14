import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from "@/lib/require-module";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import { createPuestoSalaryStructure } from "@/lib/ops/puesto-salary-structure";
import { loadInstallationServiceWindow } from "@/modules/finance/flow-v3/load-installation-windows";
import { syncPayrollItemForInstallation } from "@/modules/finance/cashflow/generators/payroll-sync";

type DotacionSnapshotItem = {
  positionId: string;
  puestoTrabajoId: string;
  puestoTrabajoName: string;
  customName: string | null;
  cargoId: string;
  cargoName: string;
  rolId: string;
  rolName: string;
  shiftStart: string;
  shiftEnd: string;
  weekdays: string[];
  requiredGuards: number;
  numPuestos: number;
  baseSalary: number;
  netSalary: number | null;
};

function addDaysYmd(ymd: string, days: number): string {
  const d = utcDateFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Puestos con operación real asociada (pautas, asistencias, asignaciones,
 * marcaciones, turnos extra o series). No se borran: se desactivan para
 * conservar trazabilidad (y evitar el FK Restrict de asistencias).
 */
async function findPuestosWithHistory(puestoIds: string[]): Promise<Set<string>> {
  if (puestoIds.length === 0) return new Set();
  const where = { puestoId: { in: puestoIds } };
  const select = { puestoId: true } as const;
  const distinct = ["puestoId"] as const;
  const [pautas, asistencias, asignaciones, marcaciones, turnosExtra, series] = await Promise.all([
    prisma.opsPautaMensual.findMany({ where, select, distinct: [...distinct] }),
    prisma.opsAsistenciaDiaria.findMany({ where, select, distinct: [...distinct] }),
    prisma.opsAsignacionGuardia.findMany({ where, select, distinct: [...distinct] }),
    prisma.opsMarcacion.findMany({ where, select, distinct: [...distinct] }),
    prisma.opsTurnoExtra.findMany({ where, select, distinct: [...distinct] }),
    prisma.opsSerieAsignacion.findMany({ where, select, distinct: [...distinct] }),
  ]);
  const out = new Set<string>();
  for (const rows of [pautas, asistencias, asignaciones, marcaciones, turnosExtra, series]) {
    for (const r of rows) if (r.puestoId) out.add(r.puestoId);
  }
  return out;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: {
            puestoTrabajo: { select: { id: true, name: true } },
            cargo: { select: { id: true, name: true } },
            rol: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    if (!quote.installationId) {
      return NextResponse.json(
        {
          success: false,
          error: "La cotización debe estar vinculada a una instalación",
        },
        { status: 400 }
      );
    }

    if (!quote.positions.length) {
      return NextResponse.json(
        { success: false, error: "La cotización no tiene puestos para enviar" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: quote.installationId, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        teMontoClp: true,
        metadata: true,
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Inicio del servicio: programación recurrente vinculada → fecha de inicio
    // de la instalación → hoy. Define `activeFrom` de los puestos nuevos y, por
    // lo tanto, desde cuándo el flujo proyecta su costo de personal.
    const todayYmd = todayInChile();
    const window = await loadInstallationServiceWindow(ctx.tenantId, installation.id);
    const startYmd = window.startYmd ?? todayYmd;
    const startDate = utcDateFromYmd(startYmd);
    // Los puestos reemplazados terminan el día antes del nuevo inicio (o hoy,
    // si el servicio ya venía operando).
    const untilYmd = startYmd > todayYmd ? addDaysYmd(startYmd, -1) : todayYmd;
    const untilDate = utcDateFromYmd(untilYmd);

    const existing = await prisma.opsPuestoOperativo.findMany({
      where: { tenantId: ctx.tenantId, installationId: installation.id },
      select: { id: true },
    });
    const existingIds = existing.map((p) => p.id);
    const withHistory = await findPuestosWithHistory(existingIds);
    const toDeactivate = existingIds.filter((pid) => withHistory.has(pid));
    const toDelete = existingIds.filter((pid) => !withHistory.has(pid));

    const dotacionSnapshot: DotacionSnapshotItem[] = quote.positions.map((pos) => ({
      positionId: pos.id,
      puestoTrabajoId: pos.puestoTrabajoId,
      puestoTrabajoName: pos.puestoTrabajo.name,
      customName: pos.customName ?? null,
      cargoId: pos.cargoId,
      cargoName: pos.cargo.name,
      rolId: pos.rolId,
      rolName: pos.rol.name,
      shiftStart: pos.startTime,
      shiftEnd: pos.endTime,
      weekdays: pos.weekdays,
      requiredGuards: pos.numGuards,
      numPuestos: Math.max(1, pos.numPuestos ?? 1),
      baseSalary: Number(pos.baseSalary),
      netSalary: pos.netSalary ? Number(pos.netSalary) : null,
    }));

    const baseMetadata =
      installation.metadata && typeof installation.metadata === "object" && !Array.isArray(installation.metadata)
        ? (installation.metadata as Record<string, unknown>)
        : {};

    const metadata = {
      ...baseMetadata,
      dotacionActiva: {
        source: "cpq_quote",
        sourceQuoteId: quote.id,
        sourceQuoteCode: quote.code,
        startDate: startYmd,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.userId,
        items: dotacionSnapshot,
      },
    };

    const result = await prisma.$transaction(
      async (tx) => {
        let deactivated = 0;
        if (toDeactivate.length > 0) {
          const r = await tx.opsPuestoOperativo.updateMany({
            where: { tenantId: ctx.tenantId, id: { in: toDeactivate } },
            data: { active: false, activeUntil: untilDate },
          });
          deactivated = r.count;
        }
        let deleted = 0;
        if (toDelete.length > 0) {
          const r = await tx.opsPuestoOperativo.deleteMany({
            where: { tenantId: ctx.tenantId, id: { in: toDelete } },
          });
          deleted = r.count;
        }

        let created = 0;
        let salaryStructuresCreated = 0;
        for (const pos of quote.positions) {
          const copies = Math.max(1, pos.numPuestos ?? 1);
          const baseName =
            [pos.cargo.name, pos.puestoTrabajo.name].filter(Boolean).join(" - ") || pos.puestoTrabajo.name;
          const baseSalary = Number(pos.baseSalary);
          const netSalary = pos.netSalary ? Number(pos.netSalary) : null;
          for (let k = 1; k <= copies; k++) {
            const puesto = await tx.opsPuestoOperativo.create({
              data: {
                tenantId: ctx.tenantId,
                installationId: installation.id,
                name: copies > 1 ? `${baseName} #${k}` : baseName,
                puestoTrabajoId: pos.puestoTrabajoId,
                cargoId: pos.cargoId,
                rolId: pos.rolId,
                shiftStart: pos.startTime,
                shiftEnd: pos.endTime,
                weekdays: pos.weekdays,
                requiredGuards: pos.numGuards,
                baseSalary: baseSalary > 0 ? baseSalary : null,
                teMontoClp: installation.teMontoClp,
                activeFrom: startDate,
                active: true,
                createdBy: ctx.userId,
              },
              select: { id: true },
            });
            created += 1;
            if (baseSalary > 0) {
              await createPuestoSalaryStructure(tx, {
                tenantId: ctx.tenantId,
                puestoId: puesto.id,
                baseSalary,
                effectiveFrom: startDate,
                netSalaryEstimate: netSalary,
                createdBy: ctx.userId,
              });
              salaryStructuresCreated += 1;
            }
          }
        }

        await tx.crmInstallation.update({
          where: { id: installation.id },
          data: { metadata },
        });

        return { deleted, deactivated, created, salaryStructuresCreated };
      },
      { timeout: 30_000 },
    );

    await createOpsAuditLog(
      ctx,
      "cpq.quote.send_dotacion_to_installation",
      "crm_installation",
      installation.id,
      {
        quoteId: quote.id,
        quoteCode: quote.code,
        startDate: startYmd,
        deletedPuestos: result.deleted,
        deactivatedPuestos: result.deactivated,
        createdPuestos: result.created,
        salaryStructuresCreated: result.salaryStructuresCreated,
      }
    );

    // Mantener el flujo de caja en sync (mismo patrón que /api/ops/puestos).
    try {
      await syncPayrollItemForInstallation(ctx.tenantId, installation.id);
    } catch (err) {
      console.error("[CPQ] sync payroll cashflow failed:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        installationId: installation.id,
        installationName: installation.name,
        quoteId: quote.id,
        quoteCode: quote.code,
        startDate: startYmd,
        deletedPuestos: result.deleted,
        deactivatedPuestos: result.deactivated,
        createdPuestos: result.created,
        salaryStructuresCreated: result.salaryStructuresCreated,
      },
    });
  } catch (error) {
    console.error("Error sending quote staffing to installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la dotación a instalación" },
      { status: 500 }
    );
  }
}
