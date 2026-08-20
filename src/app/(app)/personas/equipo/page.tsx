import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { loadStaffAssignmentByGuardia, staffRowFromPersona } from "@/lib/personas-staff-list";
import { canViewSensitiveSalary, maskSalaryAmount } from "@/lib/salary-privacy";
import { EquipoInternoClient, type EquipoInternoRow } from "@/components/personas/EquipoInternoClient";

export default async function EquipoInternoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/equipo");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const canSeeSensitive = canViewSensitiveSalary(perms);

  const personas = await prisma.opsPersona.findMany({
    where: {
      tenantId: session.user.tenantId,
      laborClass: "ADMINISTRATIVO",
      status: "active",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      phone: true,
      cargoStaff: true,
      status: true,
      salaryStructure: { select: { baseSalary: true, isActive: true } },
      admin: { select: { id: true, name: true, email: true } },
      guardia: { select: { id: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const assignments = await loadStaffAssignmentByGuardia(
    session.user.tenantId,
    personas.map((p) => p.guardia?.id).filter((id): id is string => Boolean(id)),
  );

  const initialRows: EquipoInternoRow[] = personas.map((p) => {
    const personaSalary =
      p.salaryStructure?.isActive && p.salaryStructure.baseSalary != null
        ? Number(p.salaryStructure.baseSalary)
        : null;
    const display = staffRowFromPersona({
      cargoStaff: p.cargoStaff,
      personaBaseSalary: personaSalary != null && Number.isFinite(personaSalary) ? personaSalary : null,
      guardiaId: p.guardia?.id ?? null,
      assignments,
    });
    return {
      id: p.id,
      personaId: p.id,
      guardiaId: p.guardia?.id ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      rut: p.rut,
      email: p.email,
      phone: p.phone,
      cargoStaff: p.cargoStaff,
      cargoLabel: display.cargoLabel,
      status: p.status,
      displayName: formatPersonName(p.firstName, p.lastName),
      baseSalary: maskSalaryAmount(display.baseSalary, {
        salarySensitive: display.salarySensitive,
        canViewSensitive: canSeeSensitive,
      }),
      salarySensitive: display.salarySensitive,
      admin: p.admin,
    };
  });

  return (
    <EquipoInternoClient
      initialRows={JSON.parse(JSON.stringify(initialRows))}
      canEdit={canEdit(perms, "ops", "guardias")}
      canViewSensitiveSalary={canSeeSensitive}
    />
  );
}
