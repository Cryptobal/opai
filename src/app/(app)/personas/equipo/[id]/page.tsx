import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { decideStaffMerge, fichaMatchesLookup, type FichaRow } from "@/lib/personas-staff-ficha";

export default async function EquipoInternoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/personas/equipo/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const persona = await prisma.opsPersona.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      adminId: true,
      laborClass: true,
      salaryStructureId: true,
      guardia: { select: { id: true } },
    },
  });

  if (!persona) notFound();
  if (persona.guardia) {
    redirect(`/personas/guardias/${persona.guardia.id}`);
  }

  const siblings = await prisma.opsPersona.findMany({
    where: {
      tenantId: session.user.tenantId,
      OR: [
        ...(persona.adminId ? [{ adminId: persona.adminId }] : []),
        ...(persona.email ? [{ email: { equals: persona.email, mode: "insensitive" as const } }] : []),
        { lastName: { equals: persona.lastName, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      adminId: true,
      laborClass: true,
      salaryStructureId: true,
      guardia: { select: { id: true } },
    },
  });

  const lookup = {
    personaId: persona.id,
    adminId: persona.adminId,
    rut: persona.rut,
    email: persona.email,
    firstName: persona.firstName,
    lastName: persona.lastName,
  };
  const matches: FichaRow[] = siblings
    .filter((p) =>
      fichaMatchesLookup(
        {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          rut: p.rut,
          email: p.email,
          adminId: p.adminId,
          laborClass: p.laborClass,
          salaryStructureId: p.salaryStructureId,
          guardia: p.guardia,
        },
        lookup,
      ),
    )
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      rut: p.rut,
      email: p.email,
      adminId: p.adminId,
      laborClass: p.laborClass,
      salaryStructureId: p.salaryStructureId,
      guardia: p.guardia,
    }));
  const decision = decideStaffMerge(matches);
  if (decision?.keep.guardia) {
    redirect(`/personas/guardias/${decision.keep.guardia.id}`);
  }

  redirect("/personas/equipo");
}
