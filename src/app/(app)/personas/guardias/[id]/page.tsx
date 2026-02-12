import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { GuardiaDetailClient, PersonasSubnav } from "@/components/ops";

export default async function GuardiaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/personas/guardias/${id}`);
  }
  const role = session.user.role;
  if (!hasAppAccess(role, "ops")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const [guardia, asignaciones, adminUsers] = await Promise.all([
    prisma.opsGuardia.findFirst({
      where: { id, tenantId },
      include: {
        persona: true,
        bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
        comments: { orderBy: [{ createdAt: "desc" }], take: 100 },
        documents: { orderBy: [{ createdAt: "desc" }] },
        historyEvents: { orderBy: [{ createdAt: "desc" }], take: 100 },
      },
    }),
    prisma.opsAsignacionGuardia.findMany({
      where: { guardiaId: id, tenantId },
      include: {
        puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
        installation: {
          select: {
            id: true,
            name: true,
            account: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    }),
    prisma.admin.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  if (!guardia) notFound();

  // Enrich history events and comments with user names
  const userMap = new Map(adminUsers.map((u) => [u.id, u.name]));
  const enrichedGuardia = {
    ...guardia,
    historyEvents: guardia.historyEvents.map((e) => ({
      ...e,
      createdByName: e.createdBy ? userMap.get(e.createdBy) ?? null : null,
    })),
    comments: guardia.comments.map((c) => ({
      ...c,
      createdByName: c.createdBy ? userMap.get(c.createdBy) ?? null : null,
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ficha guardia · ${guardia.persona.firstName} ${guardia.persona.lastName}`}
        description="Datos personales, ficha de documentos (antecedentes, OS-10, cédula, currículum), cuentas bancarias, comunicaciones e historial."
      />
      <PersonasSubnav />
      <GuardiaDetailClient
        initialGuardia={JSON.parse(JSON.stringify(enrichedGuardia))}
        asignaciones={JSON.parse(JSON.stringify(asignaciones))}
        userRole={role}
      />
    </div>
  );
}
