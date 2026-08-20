import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveStaffListDisplay, type StaffAssignmentDisplay } from "@/lib/personas-staff-display";

export async function loadStaffAssignmentByGuardia(
  tenantId: string,
  guardiaIds: string[],
): Promise<Map<string, StaffAssignmentDisplay>> {
  const map = new Map<string, StaffAssignmentDisplay>();
  if (guardiaIds.length === 0) return map;

  const rows = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, isActive: true, guardiaId: { in: guardiaIds } },
    orderBy: { startDate: "desc" },
    select: {
      guardiaId: true,
      puesto: {
        select: {
          name: true,
          salaryStructure: { select: { baseSalary: true, isActive: true } },
          cargo: { select: { name: true, salarySensitive: true } },
        },
      },
    },
  });

  for (const row of rows) {
    if (map.has(row.guardiaId)) continue;
    const ss = row.puesto.salaryStructure;
    const puestoBase =
      ss?.isActive && ss.baseSalary != null ? Number(ss.baseSalary) : null;
    map.set(row.guardiaId, {
      cargoName: row.puesto.cargo?.name ?? null,
      puestoName: row.puesto.name,
      puestoBaseSalary: puestoBase != null && Number.isFinite(puestoBase) ? puestoBase : null,
      cargoSalarySensitive: row.puesto.cargo?.salarySensitive ?? false,
    });
  }
  return map;
}

export function staffRowFromPersona(opts: {
  cargoStaff: string | null;
  personaBaseSalary: number | null;
  guardiaId: string | null;
  assignments: Map<string, StaffAssignmentDisplay>;
}) {
  const assignment = opts.guardiaId ? opts.assignments.get(opts.guardiaId) ?? null : null;
  return resolveStaffListDisplay(
    { cargoStaff: opts.cargoStaff, personaBaseSalary: opts.personaBaseSalary },
    assignment,
  );
}
