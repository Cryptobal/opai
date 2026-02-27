import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import { GuardiaDetailClient } from "@/components/ops";
import { NotesProvider } from "@/components/notes";

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
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }
  const hasInventarioAccess = canView(perms, "ops", "inventario");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const [guardia, asignaciones, adminUsers, guardiaDocConfig] = await Promise.all([
    prisma.opsGuardia.findFirst({
      where: { id, tenantId },
      include: {
        persona: true,
        currentInstallation: {
          select: { id: true, name: true, marcacionCode: true, account: { select: { id: true, name: true } } },
        },
        bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
        comments: { orderBy: [{ createdAt: "desc" }], take: 100 },
        documents: { orderBy: [{ createdAt: "desc" }] },
        historyEvents: { orderBy: [{ createdAt: "desc" }], take: 100 },
      },
    }),
    prisma.opsAsignacionGuardia.findMany({
      where: { guardiaId: id, tenantId },
      include: {
        puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true, cargo: { select: { name: true } } } },
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
    getGuardiaDocumentosConfig(tenantId),
  ]);

  if (!guardia) notFound();

  // Try to find matching Admin for this persona (by email) for rendiciones link
  let personaAdminId: string | null = null;
  if (guardia.persona.email) {
    const matchingAdmin = await prisma.admin.findFirst({
      where: { tenantId, email: guardia.persona.email },
      select: { id: true },
    });
    if (matchingAdmin) personaAdminId = matchingAdmin.id;
  }

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
    <NotesProvider
      contextType="GUARD"
      contextId={id}
      contextLabel={`${guardia.persona.firstName ?? ""} ${guardia.persona.lastName ?? ""}`.trim() || "Guardia"}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <div className="min-w-0">
        <GuardiaDetailClient
          initialGuardia={JSON.parse(JSON.stringify(enrichedGuardia))}
          asignaciones={JSON.parse(JSON.stringify(asignaciones))}
          userRole={session.user.role}
          personaAdminId={personaAdminId}
          currentUserId={session.user.id}
          guardiaDocConfig={JSON.parse(JSON.stringify(guardiaDocConfig))}
          hasInventarioAccess={hasInventarioAccess}
        />
      </div>
    </NotesProvider>
  );
}
