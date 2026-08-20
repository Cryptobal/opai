import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { staffCargoLabel } from "@/lib/personas-staff";
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

  const personas = await prisma.opsPersona.findMany({
    where: { tenantId: session.user.tenantId, laborClass: "ADMINISTRATIVO" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      phone: true,
      cargoStaff: true,
      status: true,
      salaryStructure: { select: { baseSalary: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const initialRows: EquipoInternoRow[] = personas.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    rut: p.rut,
    email: p.email,
    phone: p.phone,
    cargoStaff: p.cargoStaff,
    cargoLabel: staffCargoLabel(p.cargoStaff),
    status: p.status,
    displayName: formatPersonName(p.firstName, p.lastName),
    baseSalary: p.salaryStructure ? Number(p.salaryStructure.baseSalary) : null,
    admin: p.admin,
  }));

  return (
    <EquipoInternoClient
      initialRows={JSON.parse(JSON.stringify(initialRows))}
      canEdit={canEdit(perms, "ops", "guardias")}
    />
  );
}
