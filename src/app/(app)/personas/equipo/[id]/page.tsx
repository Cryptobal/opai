import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { staffCargoLabel } from "@/lib/personas-staff";
import { EquipoInternoDetailClient } from "@/components/personas/EquipoInternoDetailClient";

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
    where: {
      id,
      tenantId: session.user.tenantId,
      laborClass: "ADMINISTRATIVO",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      phone: true,
      personalEmail: true,
      cargoStaff: true,
      status: true,
      afp: true,
      healthSystem: true,
      isapreName: true,
      adminId: true,
      admin: { select: { id: true, name: true, email: true, cargo: true } },
    },
  });

  if (!persona) notFound();

  return (
    <EquipoInternoDetailClient
      canEdit={canEdit(perms, "ops", "guardias")}
      initial={{
        ...JSON.parse(JSON.stringify(persona)),
        displayName: formatPersonName(persona.firstName, persona.lastName),
        cargoLabel: staffCargoLabel(persona.cargoStaff),
      }}
    />
  );
}
